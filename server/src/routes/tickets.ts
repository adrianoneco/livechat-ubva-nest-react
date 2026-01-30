import { Router, Request, Response } from 'express';
import { db } from '../db';
import { tickets, slaConfig, slaViolations } from '../db/schema/tickets';
import { whatsappConversations } from '../db/schema/whatsapp';
import { authenticate, requireRole } from '../middleware/auth';
import { eq, and, sql, inArray, isNull } from 'drizzle-orm';
import { sendWhatsAppMessageInternal } from './whatsapp';

const router = Router();

// Get all tickets
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { status, sectorId, sector_id, conversation_id, conversationId } = req.query;

    // Support both camelCase and snake_case params
    const secId = sectorId || sector_id;
    const convId = conversationId || conversation_id;

    let query = db.select().from(tickets);

    if (status) {
      query = query.where(eq(tickets.status, status as string)) as any;
    }

    if (secId) {
      query = query.where(eq(tickets.sectorId, secId as string)) as any;
    }

    if (convId) {
      query = query.where(eq(tickets.conversationId, convId as string)) as any;
    }

    const allTickets = await query.orderBy(sql`${tickets.createdAt} DESC`);

    // Return array directly for apiClient compatibility
    res.json(allTickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ticket by ID
router.get('/:ticketId', authenticate, async (req: Request, res: Response) => {
  try {
    const ticketId = req.params.ticketId as string;

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Return ticket directly for apiClient compatibility
    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create ticket
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, sectorId, conversation_id, sector_id, priority } = req.body;

    // Support both camelCase (from routes) and snake_case (from apiClient)
    const convId = conversationId || conversation_id;
    const secId = sectorId || sector_id;

    if (!convId || !secId) {
      return res.status(400).json({ error: 'conversationId/conversation_id and sectorId/sector_id are required' });
    }

    const [ticket] = await db.insert(tickets).values({
      conversationId: convId,
      sectorId: secId,
      status: 'aberto',
    }).returning();

    // Return ticket directly (without wrapper) for apiClient compatibility
    res.json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ticket
router.put('/:ticketId', authenticate, async (req: Request, res: Response) => {
  try {
    const ticketId = req.params.ticketId as string;
    
    // Validate ticketId
    if (!ticketId || ticketId === 'undefined' || ticketId === 'null') {
      console.error('[tickets] Invalid ticketId:', ticketId);
      return res.status(400).json({ error: 'Valid ticketId is required' });
    }

    const updates = req.body;

    // If closing or reopening the ticket, fetch current ticket data first
    let ticketData: any = null;
    if (updates.status === 'finalizado' || updates.status === 'reaberto') {
      // Get ticket data before updating
      const ticketResult = await db.execute(sql`
        SELECT t.*, s.mensagem_encerramento, s.mensagem_reabertura, s.mensagem_boas_vindas, s.name as sector_name, 
               c.contact_id as conv_contact_id
        FROM tickets t
        LEFT JOIN sectors s ON s.id = t.sector_id
        LEFT JOIN whatsapp_conversations c ON c.id = t.conversation_id
        WHERE t.id = ${ticketId}
        LIMIT 1
      `);
      ticketData = ticketResult.rows?.[0] || ticketResult[0];

      console.log('[tickets] Status change:', {
        ticketId,
        newStatus: updates.status,
        hasTicketData: !!ticketData,
        hasMensagemEncerramento: !!ticketData?.mensagem_encerramento,
        hasMensagemReabertura: !!ticketData?.mensagem_reabertura,
        sectorName: ticketData?.sector_name,
      });

      if (updates.status === 'finalizado' && !updates.closedAt) {
        updates.closedAt = new Date();
        updates.closedBy = req.user!.userId;
      }
    }

    const [ticket] = await db
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, ticketId))
      .returning();

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Send message based on status change (closing or reopening)
    if (ticketData?.conversation_id) {
      let messageToSend: string | null = null;
      let messageType = '';

      if (updates.status === 'finalizado' && ticketData?.mensagem_encerramento) {
        messageToSend = ticketData.mensagem_encerramento;
        messageType = 'closing';
      } else if (updates.status === 'reaberto') {
        // Use reopen message if available, fallback to welcome message
        messageToSend = ticketData?.mensagem_reabertura || ticketData?.mensagem_boas_vindas || null;
        messageType = 'reopen';
      }

      if (messageToSend) {
        console.log(`[tickets] Sending ${messageType} message for ticket:`, ticketId);
        
        try {
          // Fetch contact info for template
          const contactResult = await db.execute(sql`
            SELECT ct.name, ct.phone_number
            FROM whatsapp_contacts ct
            JOIN whatsapp_conversations c ON c.contact_id = ct.id
            WHERE c.id = ${ticketData.conversation_id}
            LIMIT 1
          `);
          const contact = contactResult.rows?.[0] || contactResult[0];

          // Fetch agent name
          let atendenteNome = 'Atendente';
          if (req.user?.userId) {
            const profileResult = await db.execute(sql`
              SELECT full_name FROM profiles WHERE id = ${req.user.userId} LIMIT 1
            `);
            const profile = profileResult.rows?.[0] || profileResult[0];
            atendenteNome = profile?.full_name || 'Atendente';
          }

          const templateContext = {
            clienteNome: contact?.name || contact?.phone_number || 'Cliente',
            clienteTelefone: contact?.phone_number || '',
            atendenteNome,
            setorNome: ticketData?.sector_name || '',
            ticketNumero: ticketData?.numero || '',
          };

          console.log(`[tickets] Calling sendWhatsAppMessageInternal for ${messageType}:`, {
            conversationId: ticketData.conversation_id,
            contentPreview: messageToSend?.substring(0, 50),
            templateContext,
          });

          const sendResult = await sendWhatsAppMessageInternal(
            ticketData.conversation_id,
            messageToSend,
            templateContext
          );

          console.log('[tickets] sendWhatsAppMessageInternal result:', sendResult);

          if (!sendResult.success) {
            console.error(`[tickets] Failed to send ${messageType} message:`, sendResult.error);
          } else {
            console.log(`[tickets] ${messageType} message sent for ticket`, ticketId);
          }
        } catch (msgError) {
          console.error(`[tickets] Error sending ${messageType} message:`, msgError);
          // Continue - don't fail the status change
        }
      }
    }

    // Return ticket directly (without wrapper) for apiClient compatibility
    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Insert ticket event marker (server-side timestamp)
router.post('/event-marker', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, conversation_id, ticketNumber, ticket_number, eventType, event_type } = req.body;
    
    const convId = conversationId || conversation_id;
    const tickNum = ticketNumber || ticket_number;
    const evtType = eventType || event_type;

    if (!convId || !evtType) {
      return res.status(400).json({ error: 'conversationId and eventType are required' });
    }

    const validTypes = ['ticket_opened', 'ticket_closed', 'conversation_reopened'];
    if (!validTypes.includes(evtType)) {
      return res.status(400).json({ error: `eventType must be one of: ${validTypes.join(', ')}` });
    }

    const markerId = `${evtType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const content = evtType === 'conversation_reopened'
      ? `CONVERSATION_REOPENED:${tickNum || 0}`
      : `TICKET_EVENT:${tickNum || 0}`;

    // Insert with server timestamp (NOW())
    await db.execute(sql`
      INSERT INTO whatsapp_messages (
        conversation_id, message_id, remote_jid, content, message_type,
        is_from_me, status, timestamp, created_at
      ) VALUES (
        ${convId}, ${markerId}, 'system', ${content}, ${evtType},
        true, 'sent', NOW(), NOW()
      ) ON CONFLICT DO NOTHING
    `);

    console.log(`[tickets] Event marker inserted: ${evtType} for conversation ${convId}`);

    res.json({ success: true, markerId, eventType: evtType });
  } catch (error) {
    console.error('Error inserting event marker:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check SLA violations (cron job endpoint)
router.post('/sla/check-violations', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    console.log('[check-sla-violations] Starting SLA check...');

    // 1. Fetch all SLA configurations
    const slaConfigs = await db.select().from(slaConfig).where(eq(slaConfig.isActive, true));

    if (slaConfigs.length === 0) {
      console.log('[check-sla-violations] No SLA configs found');
      return res.json({ success: true, message: 'No SLA configs to check' });
    }

    // Create a map of sectorId -> SLA config for quick lookup
    const slaMap = new Map<string, typeof slaConfigs[0]>();
    for (const config of slaConfigs) {
      if (config.sectorId) {
        slaMap.set(config.sectorId, config);
      }
    }

    // 2. Fetch all open tickets
    const openTickets = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.status, ['aberto', 'em_atendimento']));

    console.log(`[check-sla-violations] Found ${openTickets.length} open tickets to check`);

    if (openTickets.length === 0) {
      return res.json({ success: true, message: 'No tickets to check' });
    }

    const now = new Date();
    const violations: { ticketId: string; violationType: string; expectedAt: Date }[] = [];

    for (const ticket of openTickets) {
      const ticketSlaConfig = slaMap.get(ticket.sectorId);
      if (!ticketSlaConfig) {
        continue;
      }

      const ticketCreatedAt = new Date(ticket.createdAt);

      // Check first response SLA (only if status is 'aberto')
      if (ticket.status === 'aberto' && ticketSlaConfig.firstResponseTimeMinutes) {
        const expectedFirstResponseAt = new Date(
          ticketCreatedAt.getTime() + ticketSlaConfig.firstResponseTimeMinutes * 60 * 1000
        );

        if (now > expectedFirstResponseAt) {
          // Check if violation already exists
          const [existingViolation] = await db
            .select()
            .from(slaViolations)
            .where(
              and(
                eq(slaViolations.ticketId, ticket.id),
                eq(slaViolations.violationType, 'first_response')
              )
            )
            .limit(1);

          if (!existingViolation) {
            violations.push({
              ticketId: ticket.id,
              violationType: 'first_response',
              expectedAt: expectedFirstResponseAt,
            });
          }
        }
      }

      // Check resolution SLA
      if (ticketSlaConfig.resolutionTimeMinutes) {
        const expectedResolutionAt = new Date(
          ticketCreatedAt.getTime() + ticketSlaConfig.resolutionTimeMinutes * 60 * 1000
        );

        if (now > expectedResolutionAt) {
          // Check if violation already exists
          const [existingViolation] = await db
            .select()
            .from(slaViolations)
            .where(
              and(
                eq(slaViolations.ticketId, ticket.id),
                eq(slaViolations.violationType, 'resolution')
              )
            )
            .limit(1);

          if (!existingViolation) {
            violations.push({
              ticketId: ticket.id,
              violationType: 'resolution',
              expectedAt: expectedResolutionAt,
            });
          }
        }
      }
    }

    console.log(`[check-sla-violations] Found ${violations.length} new violations`);

    // 3. Record violations
    for (const violation of violations) {
      // Get ticket to find sla config
      const [ticketRecord] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, violation.ticketId))
        .limit(1);

      const slaConfigForTicket = ticketRecord ? slaMap.get(ticketRecord.sectorId) : null;

      await db.insert(slaViolations).values({
        ticketId: violation.ticketId,
        slaConfigId: slaConfigForTicket?.id,
        violationType: violation.violationType,
      });
    }

    console.log('[check-sla-violations] SLA check completed successfully');

    res.json({
      success: true,
      ticketsChecked: openTickets.length,
      violationsFound: violations.length,
    });
  } catch (error) {
    console.error('[check-sla-violations] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get SLA config
router.get('/sla/config', authenticate, async (req: Request, res: Response) => {
  try {
    const { sectorId } = req.query;

    if (sectorId) {
      const [config] = await db
        .select()
        .from(slaConfig)
        .where(eq(slaConfig.sectorId, sectorId as string))
        .limit(1);
      return res.json({ config });
    }

    const configs = await db.select().from(slaConfig);
    res.json({ configs });
  } catch (error) {
    console.error('Error fetching SLA config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create/Update SLA config
router.post('/sla/config', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const {
      sectorId,
      firstResponseTimeMinutes,
      resolutionTimeMinutes,
      priorityEscalationEnabled,
      escalationThresholdMinutes,
      workingHoursStart,
      workingHoursEnd,
      workingDays,
    } = req.body;

    // Check if config exists for sector
    const [existing] = await db
      .select()
      .from(slaConfig)
      .where(eq(slaConfig.sectorId, sectorId))
      .limit(1);

    if (existing) {
      // Update
      const [updated] = await db
        .update(slaConfig)
        .set({
          firstResponseTimeMinutes,
          resolutionTimeMinutes,
          priorityEscalationEnabled,
          escalationThresholdMinutes,
          workingHoursStart,
          workingHoursEnd,
          workingDays,
          updatedAt: new Date(),
        })
        .where(eq(slaConfig.id, existing.id))
        .returning();

      return res.json({ success: true, config: updated });
    }

    // Create
    const [config] = await db.insert(slaConfig).values({
      sectorId,
      firstResponseTimeMinutes,
      resolutionTimeMinutes,
      priorityEscalationEnabled,
      escalationThresholdMinutes,
      workingHoursStart,
      workingHoursEnd,
      workingDays,
    }).returning();

    res.json({ success: true, config });
  } catch (error) {
    console.error('Error saving SLA config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get SLA violations
router.get('/sla/violations', authenticate, async (req: Request, res: Response) => {
  try {
    const { ticketId, violationType } = req.query;

    let query = db.select().from(slaViolations);

    if (ticketId) {
      query = query.where(eq(slaViolations.ticketId, ticketId as string)) as any;
    }

    if (violationType) {
      query = query.where(eq(slaViolations.violationType, violationType as string)) as any;
    }

    const allViolations = await query.orderBy(sql`${slaViolations.createdAt} DESC`);

    res.json({ violations: allViolations });
  } catch (error) {
    console.error('Error fetching SLA violations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
