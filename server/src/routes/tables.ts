import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

// Use a lightweight PG client for these generic endpoints to avoid
// coupling to Drizzle schema names that may not be exported.
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'convo_insight',
});

const router = Router();

// ===========================================
// RPC ROUTES (simulating Supabase RPC calls)
// ===========================================

// POST /api/rpc/get_user_effective_permissions
router.post('/rpc/get_user_effective_permissions', async (req: Request, res: Response) => {
  try {
    const { _user_id } = req.body;
    
    if (!_user_id) {
      return res.status(400).json({ error: '_user_id is required' });
    }

    // Get user's role
    const { rows: roleRows } = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1',
      [_user_id]
    );
    const userRole = roleRows[0]?.role || 'agent';

    // Get all permission types
    const { rows: permissionTypes } = await pool.query('SELECT * FROM permission_types');

    // Get user's sector permissions
    const { rows: userSectors } = await pool.query(
      'SELECT sector_id FROM user_sectors WHERE user_id = $1',
      [_user_id]
    );
    const sectorIds = userSectors.map(s => s.sector_id);

    let sectorPermissions: any[] = [];
    if (sectorIds.length > 0) {
      const placeholders = sectorIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await pool.query(
        `SELECT permission_key, is_enabled FROM sector_permissions WHERE sector_id IN (${placeholders})`,
        sectorIds
      );
      sectorPermissions = rows;
    }

    // Get user's permission overrides
    const { rows: overrides } = await pool.query(
      'SELECT permission_key, is_enabled FROM user_permission_overrides WHERE user_id = $1',
      [_user_id]
    );

    // Build effective permissions
    const roleColumn = `default_for_${userRole}`;
    const effectivePermissions = permissionTypes.map(pt => {
      // Check user override first (highest priority)
      const override = overrides.find(o => o.permission_key === pt.key);
      if (override) {
        return {
          permission_key: pt.key,
          is_enabled: override.is_enabled,
          source: 'user_override'
        };
      }

      // Check sector permissions
      const sectorPerm = sectorPermissions.find(sp => sp.permission_key === pt.key);
      if (sectorPerm) {
        return {
          permission_key: pt.key,
          is_enabled: sectorPerm.is_enabled,
          source: 'sector'
        };
      }

      // Fall back to role default
      return {
        permission_key: pt.key,
        is_enabled: pt[roleColumn] ?? false,
        source: 'role_default'
      };
    });

    return res.status(200).json(effectivePermissions);
  } catch (error: any) {
    console.error('Error in get_user_effective_permissions:', error);
    return res.status(500).json({ error: error.message || 'Failed to get effective permissions' });
  }
});

// ===========================================
// TABLE ROUTES
// ===========================================

// GET /api/admin/conversations - Admin conversations with all joins
router.get('/admin/conversations', async (req: Request, res: Response) => {
  try {
    const { status, instance_id, agent_id, search } = req.query;
    const params: any[] = [];
    const whereClauses: string[] = [];

    let sql = `
      SELECT 
        c.id,
        c.contact_id,
        c.instance_id,
        c.assigned_to,
        c.status,
        c.last_message_at,
        c.last_message_preview,
        c.unread_count,
        c.created_at,
        json_build_object(
          'id', ct.id,
          'name', ct.name,
          'phone_number', ct.phone_number,
          'profile_picture_url', ct.profile_picture_url
        ) as contact,
        json_build_object(
          'id', i.id,
          'name', i.name,
          'status', i.status
        ) as instance,
        CASE WHEN p.id IS NOT NULL THEN
          json_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url,
            'status', p.status
          )
        ELSE NULL END as assigned_agent,
        (
          SELECT json_build_object(
            'id', t.id,
            'status', t.status,
            'created_at', t.created_at,
            'closed_at', t.closed_at
          )
          FROM tickets t 
          WHERE t.conversation_id = c.id 
          ORDER BY t.created_at DESC 
          LIMIT 1
        ) as ticket
      FROM whatsapp_conversations c
      LEFT JOIN whatsapp_contacts ct ON ct.id = c.contact_id
      LEFT JOIN whatsapp_instances i ON i.id = c.instance_id
      LEFT JOIN profiles p ON p.id = c.assigned_to
    `;

    if (status && status !== 'all') {
      params.push(String(status));
      whereClauses.push(`c.status = $${params.length}`);
    }

    if (instance_id && instance_id !== 'all') {
      params.push(String(instance_id));
      whereClauses.push(`c.instance_id = $${params.length}`);
    }

    if (agent_id) {
      if (agent_id === 'unassigned') {
        whereClauses.push(`c.assigned_to IS NULL`);
      } else if (agent_id !== 'all') {
        params.push(String(agent_id));
        whereClauses.push(`c.assigned_to = $${params.length}`);
      }
    }

    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      whereClauses.push(`(
        LOWER(ct.name) LIKE $${params.length} OR 
        ct.phone_number LIKE $${params.length} OR 
        LOWER(c.last_message_preview) LIKE $${params.length}
      )`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ' ORDER BY c.last_message_at DESC NULLS LAST LIMIT 200';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      console.error('DB error fetching admin conversations:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching admin conversations:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});
// ===========================================

// GET /api/escalation_notifications?user_id=...
router.get('/escalation_notifications', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM escalation_notifications';
    if (user_id) {
      sql += ' WHERE user_id = $1';
      params.push(String(user_id));
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      // If table doesn't exist, return empty array instead of 500
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table escalation_notifications not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching escalation_notifications:', dbErr);
      // Fail-safe: always return an array to callers (avoids undefined in React Query)
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching escalation_notifications:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// GET /api/whatsapp_instances?status=...
router.get('/whatsapp_instances', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM whatsapp_instances';
    if (status) {
      sql += ' WHERE status = $1';
      params.push(String(status));
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table whatsapp_instances not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching whatsapp_instances:', dbErr);
      // Fail-safe: always return an array to callers
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching whatsapp_instances:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/whatsapp_instances - Create a new instance
router.post('/whatsapp_instances', async (req: Request, res: Response) => {
  try {
    const { name, instance_name, provider_type, instance_id_external, status } = req.body;
    
    if (!instance_name) {
      return res.status(400).json({ error: 'instance_name is required' });
    }

    const sql = `
      INSERT INTO whatsapp_instances (name, instance_name, provider_type, instance_id_external, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const params = [
      name || instance_name,
      instance_name,
      provider_type || 'self_hosted',
      instance_id_external || null,
      status || 'disconnected'
    ];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating whatsapp_instance:', error);
    return res.status(500).json({ error: error.message || 'Failed to create instance' });
  }
});

// PUT /api/whatsapp_instances/:id - Update an instance
router.put('/whatsapp_instances/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, instance_name, provider_type, instance_id_external, status } = req.body;

    // Build update statement with COALESCE to only change provided fields
    const sql = `
      UPDATE whatsapp_instances
      SET name = COALESCE($1, name),
          instance_name = COALESCE($2, instance_name),
          provider_type = COALESCE($3, provider_type),
          instance_id_external = COALESCE($4, instance_id_external),
          status = COALESCE($5, status),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    const params = [name || null, instance_name || null, provider_type || null, typeof instance_id_external !== 'undefined' ? instance_id_external : null, status || null, id];

    const { rows } = await pool.query(sql, params);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error updating whatsapp_instance:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Instance with this name already exists' });
    }
    return res.status(500).json({ error: error.message || 'Failed to update instance' });
  }
});

// POST /api/whatsapp_instance_secrets - Create secrets for an instance
router.post('/whatsapp_instance_secrets', async (req: Request, res: Response) => {
  try {
    const { instance_id, api_url, api_key } = req.body;
    
    if (!instance_id || !api_url || !api_key) {
      return res.status(400).json({ error: 'instance_id, api_url, and api_key are required' });
    }

    const sql = `
      INSERT INTO whatsapp_instance_secrets (instance_id, api_url, api_key)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const params = [instance_id, api_url, api_key];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating whatsapp_instance_secrets:', error);
    return res.status(500).json({ error: error.message || 'Failed to create secrets' });
  }
});

// DELETE /api/whatsapp_instances/:id - Delete an instance and its secrets
router.delete('/whatsapp_instances/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // First delete secrets
    await pool.query('DELETE FROM whatsapp_instance_secrets WHERE instance_id = $1', [id]);
    
    // Then delete instance
    const { rowCount } = await pool.query('DELETE FROM whatsapp_instances WHERE id = $1', [id]);
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error deleting whatsapp_instance:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete instance' });
  }
});

// GET /api/whatsapp_conversations?range=from:to&instance_id=...&status=...&assigned_to=...&id=...
router.get('/whatsapp_conversations', async (req: Request, res: Response) => {
  try {
    const { range, instance_id, status, assigned_to, unassigned, id } = req.query;
    const params: any[] = [];
    const whereClauses: string[] = [];

    // Build SQL with JOINs to get contact and instance data
    let sql = `
      SELECT 
        c.*,
        json_build_object(
          'id', ct.id,
          'instance_id', ct.instance_id,
          'phone_number', ct.phone_number,
          'name', ct.name,
          'profile_picture_url', ct.profile_picture_url,
          'is_group', ct.is_group,
          'notes', ct.notes,
          'metadata', ct.metadata,
          'created_at', ct.created_at,
          'updated_at', ct.updated_at
        ) as contact,
        json_build_object(
          'id', i.id,
          'name', i.name
        ) as instance,
        CASE WHEN p.id IS NOT NULL THEN
          json_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url
          )
        ELSE NULL END as assigned_profile
      FROM whatsapp_conversations c
      LEFT JOIN whatsapp_contacts ct ON ct.id = c.contact_id
      LEFT JOIN whatsapp_instances i ON i.id = c.instance_id
      LEFT JOIN profiles p ON p.id = c.assigned_to
    `;

    // Add filters
    if (id) {
      params.push(String(id));
      whereClauses.push(`c.id = $${params.length}`);
    }

    if (instance_id) {
      params.push(String(instance_id));
      whereClauses.push(`c.instance_id = $${params.length}`);
    }

    if (status) {
      params.push(String(status));
      whereClauses.push(`c.status = $${params.length}`);
    }

    // Handle assigned_to - skip if it's the string "null" or "undefined"
    if (assigned_to && String(assigned_to) !== 'null' && String(assigned_to) !== 'undefined') {
      params.push(String(assigned_to));
      whereClauses.push(`c.assigned_to = $${params.length}`);
    }

    if (unassigned === 'true') {
      whereClauses.push(`c.assigned_to IS NULL`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ' ORDER BY c.last_message_at DESC NULLS LAST';

    if (range && typeof range === 'string') {
      // range format "from:to"
      const [fromStr, toStr] = range.split(':');
      const from = parseInt(fromStr || '0', 10);
      const to = parseInt(toStr || `${from + 19}`, 10);
      const limit = Math.max(0, to - from + 1);
      sql += ` LIMIT ${limit} OFFSET ${from}`;
    } else {
      sql += ' LIMIT 50';
    }

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table whatsapp_conversations not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching whatsapp_conversations:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching whatsapp_conversations:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// GET /api/escalation_queue?status=pending,assigned&sector_id=...
router.get('/escalation_queue', async (req: Request, res: Response) => {
  try {
    const { status, sector_id } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM escalation_queue';

    const whereClauses: string[] = [];
    if (sector_id) {
      params.push(String(sector_id));
      whereClauses.push(`sector_id = $${params.length}`);
    }

    if (status && typeof status === 'string') {
      // status may be comma separated
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        const placeholders = statuses.map((_, i) => `$${params.length + i + 1}`);
        params.push(...statuses);
        whereClauses.push(`status IN (${placeholders.join(',')})`);
      }
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' ORDER BY priority DESC, created_at ASC LIMIT 100';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table escalation_queue not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching escalation_queue:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching escalation_queue:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// GET /api/sectors?is_active=true&id=xxx
router.get('/sectors', async (req: Request, res: Response) => {
  try {
    const { is_active, id } = req.query;
    const params: any[] = [];
    const conditions: string[] = [];
    
    // Query com JOINs para trazer dados das instâncias
    let sql = `
      SELECT 
        s.*,
        wi.name as instance_name,
        COALESCE(
          (SELECT json_agg(json_build_object('instance_id', si.instance_id, 'instance_name', wi2.name))
           FROM sector_instances si
           LEFT JOIN whatsapp_instances wi2 ON wi2.id = si.instance_id
           WHERE si.sector_id = s.id),
          '[]'::json
        ) as sector_instances
      FROM sectors s
      LEFT JOIN whatsapp_instances wi ON wi.id = s.instance_id
    `;

    if (typeof is_active !== 'undefined') {
      const active = String(is_active) === 'true';
      params.push(active);
      conditions.push(`s.is_active = $${params.length}`);
    }

    // Support filtering by ID
    if (id) {
      params.push(id);
      conditions.push(`s.id = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY s.is_default DESC, s.name ASC LIMIT 200';

    try {
      const { rows } = await pool.query(sql, params);
      
      // Processar dados para formato esperado pelo frontend
      const processedRows = rows.map((sector: any) => {
        const sectorInstances = sector.sector_instances || [];
        const instanceIds = sectorInstances.map((si: any) => si.instance_id).filter(Boolean);
        const instanceNames = sectorInstances.map((si: any) => si.instance_name).filter(Boolean);
        
        // Fallback para coluna legacy se não houver sector_instances
        if (instanceIds.length === 0 && sector.instance_id) {
          instanceIds.push(sector.instance_id);
          if (sector.instance_name) {
            instanceNames.push(sector.instance_name);
          }
        }
        
        return {
          ...sector,
          instance_name: instanceNames[0] || sector.instance_name || null,
          instance_names: instanceNames,
          instance_ids: instanceIds,
        };
      });
      
      return res.set('Cache-Control', 'no-store').status(200).json(processedRows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table sectors not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching sectors:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching sectors:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/sectors - Create a new sector
router.post('/sectors', async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      is_active, 
      is_default,
      instance_id,
      tipo_atendimento,
      gera_ticket,
      gera_ticket_usuarios,
      gera_ticket_grupos,
      grupos_permitidos_todos,
      mensagem_boas_vindas,
      mensagem_reabertura,
      mensagem_encerramento
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // If this sector is set as default, unset other defaults first
    if (is_default === true) {
      await pool.query('UPDATE sectors SET is_default = false WHERE is_default = true');
    }

    const sql = `
      INSERT INTO sectors (name, description, is_active, is_default, instance_id, tipo_atendimento, gera_ticket, gera_ticket_usuarios, gera_ticket_grupos, grupos_permitidos_todos, mensagem_boas_vindas, mensagem_reabertura, mensagem_encerramento, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *
    `;
    const params = [
      name,
      description || null,
      is_active !== false,
      is_default || false,
      instance_id || null,
      tipo_atendimento || 'humano',
      gera_ticket || false,
      gera_ticket_usuarios || false,
      gera_ticket_grupos || false,
      grupos_permitidos_todos !== false,
      mensagem_boas_vindas || null,
      mensagem_reabertura || null,
      mensagem_encerramento || null
    ];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating sector:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A sector with this name already exists' });
    }
    return res.status(500).json({ error: 'Failed to create sector' });
  }
});

// PUT /api/sectors/:id - Update a sector
router.put('/sectors/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      is_active,
      is_default,
      instance_id,
      tipo_atendimento,
      gera_ticket,
      gera_ticket_usuarios,
      gera_ticket_grupos,
      grupos_permitidos_todos,
      mensagem_boas_vindas,
      mensagem_reabertura,
      mensagem_encerramento
    } = req.body;

    // If this sector is set as default, unset other defaults first
    if (is_default === true) {
      await pool.query('UPDATE sectors SET is_default = false WHERE is_default = true AND id != $1', [id]);
    }

    const sql = `
      UPDATE sectors
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          is_active = COALESCE($3, is_active),
          is_default = COALESCE($4, is_default),
          instance_id = COALESCE($5, instance_id),
          tipo_atendimento = COALESCE($6, tipo_atendimento),
          gera_ticket = COALESCE($7, gera_ticket),
          gera_ticket_usuarios = COALESCE($8, gera_ticket_usuarios),
          gera_ticket_grupos = COALESCE($9, gera_ticket_grupos),
          grupos_permitidos_todos = COALESCE($10, grupos_permitidos_todos),
          mensagem_boas_vindas = COALESCE($11, mensagem_boas_vindas),
          mensagem_reabertura = COALESCE($12, mensagem_reabertura),
          mensagem_encerramento = COALESCE($13, mensagem_encerramento),
          updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `;
    const params = [name, description, is_active, is_default, instance_id, tipo_atendimento, gera_ticket, gera_ticket_usuarios, gera_ticket_grupos, grupos_permitidos_todos, mensagem_boas_vindas, mensagem_reabertura, mensagem_encerramento, id];

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error updating sector:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A sector with this name already exists' });
    }
    return res.status(500).json({ error: 'Failed to update sector' });
  }
});

// DELETE /api/sectors/:id - Delete a sector
router.delete('/sectors/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rowCount } = await pool.query('DELETE FROM sectors WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting sector:', error);
    return res.status(500).json({ error: 'Failed to delete sector' });
  }
});

// =====================================================
// USER_SECTORS ROUTES
// =====================================================

// GET /api/user_sectors?sector_id=...&user_id=...
// Returns user_sectors with joined profiles and sectors data
router.get('/user_sectors', async (req: Request, res: Response) => {
  try {
    const { sector_id, user_id } = req.query;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (sector_id) {
      params.push(String(sector_id));
      whereClauses.push(`us.sector_id = $${params.length}`);
    }

    if (user_id) {
      params.push(String(user_id));
      whereClauses.push(`us.user_id = $${params.length}`);
    }

    let sql = `
      SELECT 
        us.id,
        us.user_id,
        us.sector_id,
        us.is_primary,
        us.created_at,
        p.full_name as user_name,
        p.email as user_email,
        s.name as sector_name
      FROM user_sectors us
      LEFT JOIN profiles p ON us.user_id = p.id
      LEFT JOIN sectors s ON us.sector_id = s.id
    `;

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' ORDER BY us.created_at DESC LIMIT 200';

    try {
      const { rows } = await pool.query(sql, params);
      // Transform to match the expected format from useUserSectors hook
      const transformed = rows.map(row => ({
        ...row,
        profiles: { full_name: row.user_name, email: row.user_email },
        sectors: { name: row.sector_name }
      }));
      return res.set('Cache-Control', 'no-store').status(200).json(transformed ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table user_sectors not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching user_sectors:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching user_sectors:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/user_sectors - Add user to sector
router.post('/user_sectors', async (req: Request, res: Response) => {
  try {
    const { user_id, sector_id, is_primary } = req.body;

    if (!user_id || !sector_id) {
      return res.status(400).json({ error: 'user_id and sector_id are required' });
    }

    const sql = `
      INSERT INTO user_sectors (user_id, sector_id, is_primary, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `;
    const params = [user_id, sector_id, is_primary ?? false];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error adding user to sector:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'User is already in this sector', message: 'duplicate key value' });
    }
    return res.status(500).json({ error: error.message || 'Failed to add user to sector' });
  }
});

// PUT /api/user_sectors/:id - Update user sector (e.g., set as primary)
router.put('/user_sectors/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_primary } = req.body;

    // If setting as primary, first unset other primary sectors for this user
    if (is_primary === true) {
      // Get the user_id for this record
      const { rows: current } = await pool.query('SELECT user_id FROM user_sectors WHERE id = $1', [id]);
      if (current.length === 0) {
        return res.status(404).json({ error: 'User sector not found' });
      }
      
      // Unset all other primary sectors for this user
      await pool.query(
        'UPDATE user_sectors SET is_primary = false WHERE user_id = $1 AND id != $2',
        [current[0].user_id, id]
      );
    }

    const sql = `
      UPDATE user_sectors
      SET is_primary = COALESCE($1, is_primary)
      WHERE id = $2
      RETURNING *
    `;
    const params = [is_primary, id];

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User sector not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error updating user sector:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user sector' });
  }
});

// PATCH /api/user_sectors - Update by user_id and sector_id (for setPrimarySector)
router.patch('/user_sectors', async (req: Request, res: Response) => {
  try {
    const { user_id, sector_id, is_primary } = req.body;

    if (!user_id || !sector_id) {
      return res.status(400).json({ error: 'user_id and sector_id are required' });
    }

    // If setting as primary, first unset other primary sectors for this user
    if (is_primary === true) {
      await pool.query(
        'UPDATE user_sectors SET is_primary = false WHERE user_id = $1',
        [user_id]
      );
    }

    const sql = `
      UPDATE user_sectors
      SET is_primary = COALESCE($1, is_primary)
      WHERE user_id = $2 AND sector_id = $3
      RETURNING *
    `;
    const params = [is_primary, user_id, sector_id];

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User sector not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error updating user sector:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user sector' });
  }
});

// DELETE /api/user_sectors?user_id=...&sector_id=... - Remove user from sector
router.delete('/user_sectors', async (req: Request, res: Response) => {
  try {
    const { user_id, sector_id } = req.query;

    if (!user_id || !sector_id) {
      return res.status(400).json({ error: 'user_id and sector_id are required' });
    }

    const { rowCount } = await pool.query(
      'DELETE FROM user_sectors WHERE user_id = $1 AND sector_id = $2',
      [String(user_id), String(sector_id)]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'User sector not found' });
    }
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error removing user from sector:', error);
    return res.status(500).json({ error: error.message || 'Failed to remove user from sector' });
  }
});

// =====================================================
// SECTOR_INSTANCES ROUTES
// =====================================================

// GET /api/sector_instances?sector_id=...
router.get('/sector_instances', async (req: Request, res: Response) => {
  try {
    const { sector_id } = req.query;
    const params: any[] = [];
    let sql = `
      SELECT si.*, wi.name as instance_name
      FROM sector_instances si
      LEFT JOIN whatsapp_instances wi ON si.instance_id = wi.id
    `;

    if (sector_id) {
      params.push(String(sector_id));
      sql += ` WHERE si.sector_id = $${params.length}`;
    }

    sql += ' ORDER BY si.created_at DESC';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table sector_instances not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching sector_instances:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching sector_instances:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/sector_instances - Create sector-instance relationship
router.post('/sector_instances', async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    for (const item of items) {
      const { sector_id, instance_id } = item;

      if (!sector_id || !instance_id) {
        continue; // Skip invalid items
      }

      try {
        const { rows } = await pool.query(`
          INSERT INTO sector_instances (sector_id, instance_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (sector_id, instance_id) DO NOTHING
          RETURNING *
        `, [sector_id, instance_id]);

        if (rows[0]) {
          results.push(rows[0]);
        }
      } catch (insertErr: any) {
        console.error('Error inserting sector_instance:', insertErr);
      }
    }

    return res.status(201).json(results.length === 1 ? results[0] : results);
  } catch (error: any) {
    console.error('Error creating sector_instances:', error);
    return res.status(500).json({ error: error.message || 'Failed to create sector_instances' });
  }
});

// DELETE /api/sector_instances?sector_id=...&instance_id=...
router.delete('/sector_instances', async (req: Request, res: Response) => {
  try {
    const { sector_id, instance_id } = req.query;

    if (!sector_id) {
      return res.status(400).json({ error: 'sector_id is required' });
    }

    let sql = 'DELETE FROM sector_instances WHERE sector_id = $1';
    const params: any[] = [String(sector_id)];

    if (instance_id) {
      params.push(String(instance_id));
      sql += ` AND instance_id = $${params.length}`;
    }

    await pool.query(sql, params);
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting sector_instances:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete sector_instances' });
  }
});

// =====================================================
// SECTOR_ALLOWED_GROUPS ROUTES
// =====================================================

// GET /api/sector_allowed_groups?sector_id=...
router.get('/sector_allowed_groups', async (req: Request, res: Response) => {
  try {
    const { sector_id } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM sector_allowed_groups';

    if (sector_id) {
      params.push(String(sector_id));
      sql += ` WHERE sector_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table sector_allowed_groups not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching sector_allowed_groups:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching sector_allowed_groups:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/sector_allowed_groups - Create allowed groups for sector
router.post('/sector_allowed_groups', async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    for (const item of items) {
      const { sector_id, group_phone_number, group_name } = item;

      if (!sector_id || !group_phone_number) {
        continue; // Skip invalid items
      }

      try {
        const { rows } = await pool.query(`
          INSERT INTO sector_allowed_groups (sector_id, group_phone_number, group_name, created_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (sector_id, group_phone_number) DO UPDATE SET group_name = $3
          RETURNING *
        `, [sector_id, group_phone_number, group_name || null]);

        if (rows[0]) {
          results.push(rows[0]);
        }
      } catch (insertErr: any) {
        console.error('Error inserting sector_allowed_group:', insertErr);
      }
    }

    return res.status(201).json(results.length === 1 ? results[0] : results);
  } catch (error: any) {
    console.error('Error creating sector_allowed_groups:', error);
    return res.status(500).json({ error: error.message || 'Failed to create sector_allowed_groups' });
  }
});

// DELETE /api/sector_allowed_groups?sector_id=...&group_phone_number=...
router.delete('/sector_allowed_groups', async (req: Request, res: Response) => {
  try {
    const { sector_id, group_phone_number } = req.query;

    if (!sector_id) {
      return res.status(400).json({ error: 'sector_id is required' });
    }

    let sql = 'DELETE FROM sector_allowed_groups WHERE sector_id = $1';
    const params: any[] = [String(sector_id)];

    if (group_phone_number) {
      params.push(String(group_phone_number));
      sql += ` AND group_phone_number = $${params.length}`;
    }

    await pool.query(sql, params);
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting sector_allowed_groups:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete sector_allowed_groups' });
  }
});

// ===========================================
// UPSERT ROUTES
// ===========================================

// GET /api/whatsapp_contacts?id=xxx - Get contacts with optional filters
router.get('/whatsapp_contacts', async (req: Request, res: Response) => {
  try {
    const { id, instance_id, phone_number, limit: limitParam } = req.query;
    const params: any[] = [];
    const conditions: string[] = [];

    let sql = 'SELECT * FROM whatsapp_contacts';

    if (id) {
      params.push(id);
      conditions.push(`id = $${params.length}`);
    }

    if (instance_id) {
      params.push(instance_id);
      conditions.push(`instance_id = $${params.length}`);
    }

    if (phone_number) {
      params.push(phone_number);
      conditions.push(`phone_number = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const limit = limitParam ? parseInt(String(limitParam), 10) : 100;
    sql += ` ORDER BY updated_at DESC LIMIT ${limit}`;

    const { rows } = await pool.query(sql, params);
    return res.status(200).json(rows);
  } catch (error: any) {
    console.error('Error fetching whatsapp_contacts:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch contacts' });
  }
});

// POST /api/whatsapp_contacts/upsert - Upsert a contact (insert or update on conflict)
router.post('/whatsapp_contacts/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    const { instance_id, phone_number, name, profile_picture_url, deleted_at, is_group, notes, metadata } = data;

    if (!instance_id || !phone_number) {
      return res.status(400).json({ error: 'instance_id and phone_number are required' });
    }

    // Upsert using ON CONFLICT
    const sql = `
      INSERT INTO whatsapp_contacts (instance_id, phone_number, name, profile_picture_url, deleted_at, is_group, notes, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (instance_id, phone_number) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
        profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, whatsapp_contacts.profile_picture_url),
        deleted_at = EXCLUDED.deleted_at,
        is_group = COALESCE(EXCLUDED.is_group, whatsapp_contacts.is_group),
        notes = COALESCE(EXCLUDED.notes, whatsapp_contacts.notes),
        metadata = COALESCE(EXCLUDED.metadata, whatsapp_contacts.metadata),
        updated_at = NOW()
      RETURNING *
    `;
    const params = [
      instance_id,
      phone_number,
      name || phone_number,
      profile_picture_url || null,
      deleted_at || null,
      is_group || false,
      notes || null,
      metadata || '{}'
    ];

    const { rows } = await pool.query(sql, params);
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error upserting whatsapp_contact:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert contact' });
  }
});

// POST /api/kanban_columns_config/upsert - Upsert kanban column config
router.post('/kanban_columns_config/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    // Handle both single object and array
    const items = Array.isArray(data) ? data : [data];
    const results: any[] = [];

    for (const item of items) {
      const { user_id, column_id, name, color, position, is_visible } = item;

      if (!column_id) {
        continue;
      }

      const sql = `
        INSERT INTO kanban_columns_config (user_id, column_id, name, color, position, is_visible, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (user_id, column_id) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, kanban_columns_config.name),
          color = COALESCE(EXCLUDED.color, kanban_columns_config.color),
          position = COALESCE(EXCLUDED.position, kanban_columns_config.position),
          is_visible = COALESCE(EXCLUDED.is_visible, kanban_columns_config.is_visible),
          updated_at = NOW()
        RETURNING *
      `;
      const params = [
        user_id || null,
        column_id,
        name || column_id,
        color || null,
        position || 0,
        is_visible !== false
      ];

      try {
        const { rows } = await pool.query(sql, params);
        if (rows[0]) results.push(rows[0]);
      } catch (e: any) {
        console.error('Error upserting kanban_columns_config item:', e);
      }
    }

    return res.status(200).json(Array.isArray(data) ? results : results[0]);
  } catch (error: any) {
    console.error('Error upserting kanban_columns_config:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert kanban config' });
  }
});

// POST /api/sector_permissions/upsert - Upsert sector permissions
router.post('/sector_permissions/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    // Handle both single object and array
    const items = Array.isArray(data) ? data : [data];
    const results: any[] = [];

    for (const item of items) {
      const { sector_id, permission_key, is_enabled } = item;

      if (!sector_id || !permission_key) {
        continue;
      }

      const sql = `
        INSERT INTO sector_permissions (sector_id, permission_key, is_enabled, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (sector_id, permission_key) DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled,
          updated_at = NOW()
        RETURNING *
      `;
      const params = [sector_id, permission_key, is_enabled !== false];

      try {
        const { rows } = await pool.query(sql, params);
        if (rows[0]) results.push(rows[0]);
      } catch (e: any) {
        console.error('Error upserting sector_permission item:', e);
      }
    }

    return res.status(200).json(Array.isArray(data) ? results : results[0]);
  } catch (error: any) {
    console.error('Error upserting sector_permissions:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert sector permissions' });
  }
});

// POST /api/permission_overrides/upsert - Upsert permission overrides
router.post('/permission_overrides/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    const { user_id, permission_type, granted } = data;

    if (!user_id || !permission_type) {
      return res.status(400).json({ error: 'user_id and permission_type are required' });
    }

    const sql = `
      INSERT INTO permission_overrides (user_id, permission_type, granted, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (user_id, permission_type) DO UPDATE SET
        granted = EXCLUDED.granted,
        updated_at = NOW()
      RETURNING *
    `;
    const params = [user_id, permission_type, granted !== false];

    const { rows } = await pool.query(sql, params);
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error upserting permission_override:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert permission override' });
  }
});

// POST /api/user_permission_overrides/upsert - Upsert user permission overrides
router.post('/user_permission_overrides/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    const overrideData = data || req.body;
    
    if (!overrideData) {
      return res.status(400).json({ error: 'data is required' });
    }

    const { user_id, permission_key, is_enabled, reason, created_by } = overrideData;

    if (!user_id || !permission_key) {
      return res.status(400).json({ error: 'user_id and permission_key are required' });
    }

    const sql = `
      INSERT INTO user_permission_overrides (user_id, permission_key, is_enabled, reason, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (user_id, permission_key) DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        reason = EXCLUDED.reason,
        updated_at = NOW()
      RETURNING *
    `;
    const params = [user_id, permission_key, is_enabled !== false, reason || null, created_by || null];

    const { rows } = await pool.query(sql, params);
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error upserting user_permission_override:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert user permission override' });
  }
});

// POST /api/whatsapp_reactions/upsert - Upsert a reaction (insert or update on conflict)
router.post('/whatsapp_reactions/upsert', async (req: Request, res: Response) => {
  try {
    const data = req.body.data || req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    const { message_id, conversation_id, emoji, reactor_jid, is_from_me } = data;

    if (!message_id || !conversation_id || !emoji || !reactor_jid) {
      return res.status(400).json({ error: 'message_id, conversation_id, emoji, and reactor_jid are required' });
    }

    const sql = `
      INSERT INTO whatsapp_reactions (message_id, conversation_id, emoji, reactor_jid, is_from_me, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (message_id, reactor_jid) DO UPDATE SET
        emoji = EXCLUDED.emoji,
        is_from_me = EXCLUDED.is_from_me
      RETURNING *
    `;
    const params = [message_id, conversation_id, emoji, reactor_jid, is_from_me ?? false];

    const { rows } = await pool.query(sql, params);
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error upserting whatsapp_reaction:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert reaction' });
  }
});

// POST /api/ai_agent_configs - Create or Update AI Agent Config (upsert by sector_id)
router.post('/ai_agent_configs', async (req: Request, res: Response) => {
  try {
    console.log('[ai_agent_configs POST] Received request:', JSON.stringify(req.body).substring(0, 500));
    const data = req.body;
    if (!data.sector_id) {
      return res.status(400).json({ error: 'sector_id is required' });
    }

    // Transform arrays properly for PostgreSQL
    const workingDays = Array.isArray(data.working_days) 
      ? `{${data.working_days.join(',')}}` 
      : data.working_days || '{1,2,3,4,5}';
    const escalationKeywords = Array.isArray(data.escalation_keywords) 
      ? `{${data.escalation_keywords.map((k: string) => `"${k.replace(/"/g, '\\"')}"`).join(',')}}` 
      : data.escalation_keywords || '{}';

    // Use UPSERT to create or update if sector_id already exists
    const sql = `
      INSERT INTO ai_agent_configs (
        sector_id, agent_name, agent_image, persona_description, welcome_message,
        tone_of_voice, default_model, system_prompt, is_enabled, auto_reply_enabled,
        max_auto_replies, response_delay_seconds, hybrid_timeout_minutes,
        escalation_keywords, escalation_after_minutes, escalation_on_negative_sentiment,
        working_hours_start, working_hours_end, working_timezone, working_days,
        out_of_hours_message, business_context, faq_context, product_catalog
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
      )
      ON CONFLICT (sector_id) DO UPDATE SET
        agent_name = EXCLUDED.agent_name,
        agent_image = EXCLUDED.agent_image,
        persona_description = EXCLUDED.persona_description,
        welcome_message = EXCLUDED.welcome_message,
        tone_of_voice = EXCLUDED.tone_of_voice,
        default_model = EXCLUDED.default_model,
        system_prompt = EXCLUDED.system_prompt,
        is_enabled = EXCLUDED.is_enabled,
        auto_reply_enabled = EXCLUDED.auto_reply_enabled,
        max_auto_replies = EXCLUDED.max_auto_replies,
        response_delay_seconds = EXCLUDED.response_delay_seconds,
        hybrid_timeout_minutes = EXCLUDED.hybrid_timeout_minutes,
        escalation_keywords = EXCLUDED.escalation_keywords,
        escalation_after_minutes = EXCLUDED.escalation_after_minutes,
        escalation_on_negative_sentiment = EXCLUDED.escalation_on_negative_sentiment,
        working_hours_start = EXCLUDED.working_hours_start,
        working_hours_end = EXCLUDED.working_hours_end,
        working_timezone = EXCLUDED.working_timezone,
        working_days = EXCLUDED.working_days,
        out_of_hours_message = EXCLUDED.out_of_hours_message,
        business_context = EXCLUDED.business_context,
        faq_context = EXCLUDED.faq_context,
        product_catalog = EXCLUDED.product_catalog,
        updated_at = NOW()
      RETURNING *
    `;
    
    const params = [
      data.sector_id,
      data.agent_name || 'Assistente',
      data.agent_image || null,
      data.persona_description || null,
      data.welcome_message || null,
      data.tone_of_voice || 'professional',
      data.default_model || 'llama-3.3-70b-versatile',
      data.system_prompt || null,
      data.is_enabled ?? false,
      data.auto_reply_enabled ?? true,
      data.max_auto_replies ?? 5,
      data.response_delay_seconds ?? 2,
      data.hybrid_timeout_minutes ?? 5,
      escalationKeywords,
      data.escalation_after_minutes ?? 30,
      data.escalation_on_negative_sentiment ?? true,
      data.working_hours_start || '08:00',
      data.working_hours_end || '18:00',
      data.working_timezone || 'America/Sao_Paulo',
      workingDays,
      data.out_of_hours_message || null,
      data.business_context || null,
      data.faq_context || null,
      data.product_catalog || null
    ];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating ai_agent_config:', error);
    return res.status(500).json({ error: error.message || 'Failed to create AI agent config' });
  }
});

// PUT /api/ai_agent_configs/:id - Update AI Agent Config
router.put('/ai_agent_configs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    console.log('[ai_agent_configs PUT] Received request for id:', id, 'body:', JSON.stringify(data).substring(0, 500));

    // Transform arrays properly for PostgreSQL
    const workingDays = Array.isArray(data.working_days) 
      ? `{${data.working_days.join(',')}}` 
      : data.working_days;
    const escalationKeywords = Array.isArray(data.escalation_keywords) 
      ? `{${data.escalation_keywords.map((k: string) => `"${k.replace(/"/g, '\\"')}"`).join(',')}}` 
      : data.escalation_keywords;

    const sql = `
      UPDATE ai_agent_configs SET
        agent_name = COALESCE($2, agent_name),
        agent_image = $3,
        persona_description = $4,
        welcome_message = $5,
        tone_of_voice = COALESCE($6, tone_of_voice),
        default_model = COALESCE($7, default_model),
        system_prompt = $8,
        is_enabled = COALESCE($9, is_enabled),
        auto_reply_enabled = COALESCE($10, auto_reply_enabled),
        max_auto_replies = COALESCE($11, max_auto_replies),
        response_delay_seconds = COALESCE($12, response_delay_seconds),
        hybrid_timeout_minutes = COALESCE($13, hybrid_timeout_minutes),
        escalation_keywords = COALESCE($14, escalation_keywords),
        escalation_after_minutes = COALESCE($15, escalation_after_minutes),
        escalation_on_negative_sentiment = COALESCE($16, escalation_on_negative_sentiment),
        working_hours_start = COALESCE($17, working_hours_start),
        working_hours_end = COALESCE($18, working_hours_end),
        working_timezone = COALESCE($19, working_timezone),
        working_days = COALESCE($20, working_days),
        out_of_hours_message = $21,
        business_context = $22,
        faq_context = $23,
        product_catalog = $24,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    const params = [
      id,
      data.agent_name,
      data.agent_image ?? null,
      data.persona_description ?? null,
      data.welcome_message ?? null,
      data.tone_of_voice,
      data.default_model,
      data.system_prompt ?? null,
      data.is_enabled,
      data.auto_reply_enabled,
      data.max_auto_replies,
      data.response_delay_seconds,
      data.hybrid_timeout_minutes,
      escalationKeywords,
      data.escalation_after_minutes,
      data.escalation_on_negative_sentiment,
      data.working_hours_start,
      data.working_hours_end,
      data.working_timezone,
      workingDays,
      data.out_of_hours_message ?? null,
      data.business_context ?? null,
      data.faq_context ?? null,
      data.product_catalog ?? null
    ];

    const { rows } = await pool.query(sql, params);
    console.log('[ai_agent_configs PUT] Query result rows:', rows.length, rows[0] ? 'updated_at=' + rows[0].updated_at : 'no data');
    if (rows.length === 0) {
      return res.status(404).json({ error: 'AI agent config not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error updating ai_agent_config:', error);
    return res.status(500).json({ error: error.message || 'Failed to update AI agent config' });
  }
});

// Generic fallback for lightweight table queries (prevents 404s for missing optional tables)
// Matches simple table names composed of letters, numbers and underscores.
router.get('/:table', async (req: Request, res: Response) => {
  try {
    const table = String(req.params.table || '').trim();
    if (!/^[a-z0-9_]+$/i.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Basic paging and filter support
    const { limit, range, ...filters } = req.query;
    const params: any[] = [];
    const whereClauses: string[] = [];

    // UUID fields that may contain comma-separated values
    const uuidFields = ['id', 'conversation_id', 'contact_id', 'instance_id', 'user_id', 'assigned_to', 'sector_id'];

    // Build WHERE clauses from query parameters (simple equality filters)
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === 'string' && /^[a-z0-9_]+$/i.test(key)) {
        // Skip null/undefined string values
        if (value === 'null' || value === 'undefined') {
          continue;
        }
        
        // Check if this is a UUID field with multiple values (comma-separated)
        if (uuidFields.includes(key) && value.includes(',')) {
          const uuids = value.split(',').map(v => v.trim()).filter(v => v.length > 0);
          if (uuids.length > 0) {
            const placeholders = uuids.map((_, i) => `$${params.length + i + 1}`);
            params.push(...uuids);
            whereClauses.push(`${key} IN (${placeholders.join(', ')})`);
          }
        } else {
          params.push(value);
          whereClauses.push(`${key} = $${params.length}`);
        }
      }
    }

    let sql = `SELECT * FROM ${table}`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // Determine sort order - whatsapp_messages should be sorted by created_at ASC (milissegundos), others by created_at DESC
    const orderColumn = 'created_at';
    const orderDirection = table === 'whatsapp_messages' ? 'ASC' : 'DESC';

    if (range && typeof range === 'string') {
      const [fromStr, toStr] = range.split(':');
      const from = parseInt(fromStr || '0', 10);
      const to = parseInt(toStr || `${from + 19}`, 10);
      const lim = Math.max(0, to - from + 1);
      sql += ` ORDER BY ${orderColumn} ${orderDirection} LIMIT ${lim} OFFSET ${from}`;
    } else if (limit) {
      const lim = parseInt(String(limit), 10) || 20;
      sql += ` ORDER BY ${orderColumn} ${orderDirection} LIMIT ${lim}`;
    } else {
      sql += ` ORDER BY ${orderColumn} ${orderDirection} LIMIT 100`;
    }

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn(`Table ${table} not found, returning empty array`);
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error(`DB error fetching ${table}:`, dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error in generic table handler:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/ai_agent_sessions - Insert a new AI agent session
router.post('/ai_agent_sessions', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.conversation_id) {
      return res.status(400).json({ error: 'conversation_id is required' });
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const sql = `
      INSERT INTO ai_agent_sessions (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const { rows } = await pool.query(sql, values);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error inserting ai_agent_session:', error);
    return res.status(500).json({ error: error.message || 'Failed to insert AI agent session' });
  }
});

// POST /api/ai_agent_sessions/upsert - Upsert AI agent session
router.post('/ai_agent_sessions/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    const sessionData = data || req.body;

    if (!sessionData.conversation_id) {
      return res.status(400).json({ error: 'conversation_id is required' });
    }

    const columns = Object.keys(sessionData).filter(k => k !== 'id');
    const values = columns.map(k => sessionData[k]);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const updateClauses = columns.map(k => `${k} = EXCLUDED.${k}`);

    const sql = `
      INSERT INTO ai_agent_sessions (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (conversation_id) DO UPDATE SET ${updateClauses.join(', ')}, updated_at = NOW()
      RETURNING *
    `;

    const { rows } = await pool.query(sql, values);
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error upserting ai_agent_session:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert AI agent session' });
  }
});

// POST /api/whatsapp_messages - Insert a new message
router.post('/whatsapp_messages', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.conversation_id) {
      return res.status(400).json({ error: 'conversation_id is required' });
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const sql = `
      INSERT INTO whatsapp_messages (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const { rows } = await pool.query(sql, values);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error inserting whatsapp_message:', error);
    return res.status(500).json({ error: error.message || 'Failed to insert message' });
  }
});

// ===========================================
// GENERIC INSERT HANDLER
// ===========================================

// POST /api/:table - Generic insert for any table
router.post('/:table', async (req: Request, res: Response) => {
  try {
    const table = String(req.params.table || '').trim();
    if (!/^[a-z0-9_]+$/i.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Skip tables with specific handlers (handled before this route)
    const specificTables = ['whatsapp_instances', 'whatsapp_instance_secrets', 'whatsapp_messages', 
                           'sectors', 'user_sectors', 'sector_instances', 'sector_allowed_groups',
                           'ai_agent_sessions', 'ai_agent_configs'];
    if (specificTables.includes(table)) {
      return res.status(400).json({ error: 'Use specific endpoint for this table' });
    }

    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    try {
      const { rows } = await pool.query(sql, values);
      return res.status(201).json(rows[0]);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.error(`Table ${table} not found for POST`);
        return res.status(404).json({ error: 'Table not found' });
      }
      console.error(`DB error inserting into ${table}:`, dbErr);
      return res.status(500).json({ error: dbErr.message || 'Failed to insert row' });
    }
  } catch (error: any) {
    console.error('Error in generic POST handler:', error);
    return res.status(500).json({ error: error.message || 'Failed to insert' });
  }
});

// PUT /api/:table/:id - Generic update by ID for any table
router.put('/:table/:id', async (req: Request, res: Response) => {
  try {
    const table = String(req.params.table || '').trim();
    const id = req.params.id;
    
    if (!/^[a-z0-9_]+$/i.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Validate ID parameter
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ error: 'Invalid or missing ID parameter' });
    }

    // Skip tables with specific handlers
    const specificTables = ['whatsapp_instances', 'sectors', 'user_sectors', 'ai_agent_configs'];
    if (specificTables.includes(table)) {
      return res.status(400).json({ error: 'Use specific endpoint for this table' });
    }

    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    // Filter out updated_at from body to avoid duplicate assignment
    const filteredUpdates = { ...updates };
    delete filteredUpdates.updated_at;
    
    const columns = Object.keys(filteredUpdates);
    const values = Object.values(filteredUpdates);
    const setClauses = columns.map((col, i) => `${col} = $${i + 1}`);
    values.push(id);

    // Skip adding updated_at for tables that don't have it
    const tablesWithoutUpdatedAt = ['user_roles', 'whatsapp_conversations', 'whatsapp_messages'];
    const hasUpdatedAt = !tablesWithoutUpdatedAt.includes(table);
    
    const sql = `
      UPDATE ${table}
      SET ${setClauses.join(', ')}${hasUpdatedAt && setClauses.length > 0 ? ', updated_at = NOW()' : ''}
      WHERE id = $${values.length}
      RETURNING *
    `;

    try {
      const { rows } = await pool.query(sql, values);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Row not found' });
      }
      return res.status(200).json(rows[0]);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.error(`Table ${table} not found for PUT`);
        return res.status(404).json({ error: 'Table not found' });
      }
      console.error(`DB error updating ${table}:`, dbErr);
      return res.status(500).json({ error: dbErr.message || 'Failed to update row' });
    }
  } catch (error: any) {
    console.error('Error in generic PUT handler:', error);
    return res.status(500).json({ error: error.message || 'Failed to update' });
  }
});

// DELETE /api/:table/:id - Generic delete by ID for any table
router.delete('/:table/:id', async (req: Request, res: Response) => {
  try {
    const table = String(req.params.table || '').trim();
    const id = req.params.id;
    
    if (!/^[a-z0-9_]+$/i.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Skip tables with specific handlers
    const specificTables = ['whatsapp_instances', 'sectors'];
    if (specificTables.includes(table)) {
      return res.status(400).json({ error: 'Use specific endpoint for this table' });
    }

    const sql = `DELETE FROM ${table} WHERE id = $1`;

    try {
      const { rowCount } = await pool.query(sql, [id]);
      if (rowCount === 0) {
        return res.status(404).json({ error: 'Row not found' });
      }
      return res.status(200).json({ success: true });
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.error(`Table ${table} not found for DELETE`);
        return res.status(404).json({ error: 'Table not found' });
      }
      console.error(`DB error deleting from ${table}:`, dbErr);
      return res.status(500).json({ error: dbErr.message || 'Failed to delete row' });
    }
  } catch (error: any) {
    console.error('Error in generic DELETE handler:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete' });
  }
});

// PATCH /api/:table - Update rows by query filters (e.g. /whatsapp_instance_secrets?instance_id=...)
router.patch('/:table', async (req: Request, res: Response) => {
  try {
    const table = String(req.params.table || '').trim();
    if (!/^[a-z0-9_]+$/i.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const filters: any = { ...req.query };
    const updates: any = { ...req.body };

    // Prevent accidental full-table updates
    if (Object.keys(filters).length === 0) {
      return res.status(400).json({ error: 'At least one filter is required to update rows' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    const params: any[] = [];
    const setClauses: string[] = [];
    let idx = 0;

    for (const [k, v] of Object.entries(updates)) {
      idx += 1;
      params.push(v);
      setClauses.push(`${k} = $${idx}`);
    }

    const whereClauses: string[] = [];
    for (const [k, v] of Object.entries(filters)) {
      idx += 1;
      params.push(v as any);
      whereClauses.push(`${k} = $${idx}`);
    }

    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING *`;

    try {
      const { rows } = await pool.query(sql, params);
      return res.status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn(`Table ${table} not found for PATCH`);
        return res.status(404).json({ error: 'Table not found' });
      }
      console.error(`DB error patching ${table}:`, dbErr);
      return res.status(500).json({ error: dbErr.message || 'Failed to update rows' });
    }
  } catch (error: any) {
    console.error('Error in generic PATCH handler:', error);
    return res.status(500).json({ error: error.message || 'Failed to patch table' });
  }
});

export default router;