import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Pool } from 'pg';
import { getFile, getSignedDownloadUrl, uploadFile } from '../lib/storage';
import { buildGroqHeaders, groqEndpoint } from '../lib/groq';
import crypto from 'crypto';
import { wsEmit } from '../lib/websocket';
import { webhookEvents } from '../lib/webhookDispatcher';

const router = Router();

/**
 * Dispatch webhook endpoint - handles webhook dispatch requests
 * This is called by the client to dispatch webhooks for various events
 */
router.post('/dispatch-webhook', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { event, data } = req.body;
    
    if (!event) {
      return res.status(400).json({ error: 'event is required' });
    }
    
    console.log(`[dispatch-webhook] Dispatching event: ${event}`, data);
    
    // Get database pool
    const dbPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'livechat',
    });
    
    try {
      // Query active webhooks that subscribe to this event
      const webhooksResult = await dbPool.query(
        `SELECT id, name, url, secret, headers, retry_count, retry_delay 
         FROM webhooks 
         WHERE is_active = true 
         AND (events IS NULL OR $1 = ANY(events))`,
        [event]
      );
      
      const webhooks = webhooksResult.rows;
      console.log(`[dispatch-webhook] Found ${webhooks.length} webhooks for event: ${event}`);
      
      if (webhooks.length === 0) {
        return res.json({ success: true, message: `No webhooks subscribed to ${event}`, dispatched: 0 });
      }
      
      // Prepare payload
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data: data || {}
      };
      const payloadString = JSON.stringify(payload);
      
      // Dispatch to each webhook (fire-and-forget for non-blocking response)
      const dispatchPromises = webhooks.map(async (webhook: any) => {
        const startTime = Date.now();
        let success = false;
        let statusCode: number | null = null;
        let responseBody: string | null = null;
        let errorMessage: string | null = null;
        
        try {
          // Build headers
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Webhook-Event': event,
            'X-Webhook-Timestamp': payload.timestamp,
          };
          
          // Add signature if secret is configured
          if (webhook.secret) {
            const signature = crypto
              .createHmac('sha256', webhook.secret)
              .update(payloadString)
              .digest('hex');
            headers['X-Webhook-Signature'] = `sha256=${signature}`;
          }
          
          // Add custom headers if configured
          if (webhook.headers) {
            try {
              const customHeaders = typeof webhook.headers === 'string' 
                ? JSON.parse(webhook.headers) 
                : webhook.headers;
              Object.assign(headers, customHeaders);
            } catch (e) {
              console.warn(`[dispatch-webhook] Invalid custom headers for webhook ${webhook.id}`);
            }
          }
          
          // Send webhook with retry logic
          const maxRetries = webhook.retry_count || 3;
          const retryDelay = webhook.retry_delay || 1000;
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`[dispatch-webhook] Sending to ${webhook.url} (attempt ${attempt}/${maxRetries})`);
              
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
              
              const response = await fetch(webhook.url, {
                method: 'POST',
                headers,
                body: payloadString,
                signal: controller.signal,
              });
              
              clearTimeout(timeout);
              statusCode = response.status;
              
              try {
                responseBody = await response.text();
              } catch (e) {
                responseBody = null;
              }
              
              if (response.ok) {
                success = true;
                console.log(`[dispatch-webhook] Successfully sent to ${webhook.name} (${webhook.url})`);
                break;
              } else {
                errorMessage = `HTTP ${statusCode}: ${responseBody?.substring(0, 200)}`;
                console.warn(`[dispatch-webhook] Failed attempt ${attempt} for ${webhook.name}: ${errorMessage}`);
              }
            } catch (fetchError: any) {
              errorMessage = fetchError.message || 'Network error';
              console.warn(`[dispatch-webhook] Network error attempt ${attempt} for ${webhook.name}: ${errorMessage}`);
            }
            
            // Wait before retry (if not last attempt)
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
            }
          }
        } catch (error: any) {
          errorMessage = error.message || 'Unknown error';
          console.error(`[dispatch-webhook] Error dispatching to ${webhook.name}:`, error);
        }
        
        const duration = Date.now() - startTime;
        
        // Log the webhook dispatch
        try {
          await dbPool.query(
            `INSERT INTO webhook_logs (webhook_id, event, payload, response, status_code, success, error, duration)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              webhook.id, 
              event, 
              payloadString.substring(0, 10000), 
              responseBody?.substring(0, 10000) || null, 
              statusCode, 
              success, 
              errorMessage, 
              duration
            ]
          );
        } catch (logError) {
          console.error(`[dispatch-webhook] Failed to log webhook dispatch:`, logError);
        }
        
        return { webhookId: webhook.id, name: webhook.name, success, statusCode, error: errorMessage };
      });
      
      // Execute all dispatches in parallel
      const results = await Promise.all(dispatchPromises);
      
      const successCount = results.filter(r => r.success).length;
      console.log(`[dispatch-webhook] Dispatched ${event} to ${results.length} webhooks, ${successCount} successful`);
      
      res.json({ 
        success: true, 
        message: `Webhook ${event} dispatched`, 
        dispatched: results.length,
        successful: successCount,
        results 
      });
    } finally {
      await dbPool.end();
    }
  } catch (error) {
    console.error('[dispatch-webhook] Error:', error);
    res.status(500).json({ error: 'Failed to dispatch webhook' });
  }
});

// Database pool for direct queries
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'convo_insight',
});

// Prevent unhandled 'error' events from terminating the process when Postgres
// closes connections (e.g. restart or admin terminate). Log and allow pool
// to recover; the client code should handle failed queries as needed.
pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
});

// Evolution API Database pool (for direct import)
const evolutionPool = process.env.EVOLUTION_DATA_URL 
  ? new Pool({ connectionString: process.env.EVOLUTION_DATA_URL })
  : null;

if (evolutionPool) {
  evolutionPool.on('error', (err) => {
    console.error('[evolution-db] Unexpected error on idle client', err);
  });
}

/**
 * Helper function to get Evolution API auth headers
 * - Cloud provider: use Bearer Authorization
 * - Self-hosted / evolution_bot: use 'apikey' header
 */
function getEvolutionAuthHeaders(apiKey: string, providerType?: string): Record<string, string> {
  if (providerType === 'cloud') {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }
  return {
    'apikey': apiKey,
    'Content-Type': 'application/json'
  };
}

/**
 * Convert localhost URLs to docker network URLs when running inside a container
 * This is necessary because localhost inside a container refers to the container itself,
 * not the host machine.
 */
function resolveDockerUrl(url: string): string {
  // Map of localhost ports to docker service names
  const portToService: Record<string, string> = {
    '8082': 'evolution-api:8080',  // Evolution API
    '5678': 'n8n:5678',            // n8n
    '3001': 'typebot-builder:3000', // Typebot Builder
    '3002': 'typebot-viewer:3000',  // Typebot Viewer
    '9000': 'minio:9000',          // MinIO
    '11434': 'ollama:11434',       // Ollama
  };

  try {
    // If a scheme is missing (e.g. "192.168.3.39:9002"), assume http://
    const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url) ? url : `http://${url}`;
    const parsed = new URL(normalized);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    if (isLocalhost) {
      const service = portToService[parsed.port];
      if (service) {
        parsed.hostname = service.split(':')[0];
        parsed.port = service.split(':')[1];
        const result = parsed.toString().replace(/\/$/, ''); // Remove trailing slash
        console.log(`🔄 Resolved URL: ${url} -> ${result}`);
        return result;
      }
      // If no mapping found, try host.docker.internal as fallback
      parsed.hostname = 'host.docker.internal';
      const result = parsed.toString().replace(/\/$/, ''); // Remove trailing slash
      console.log(`🔄 Resolved URL to host.docker.internal: ${url} -> ${result}`);
      return result;
    }

    // Return normalized absolute URL (ensures a scheme is present), without trailing slash
    return parsed.toString().replace(/\/$/, '');
  } catch (e) {
    // If parsing fails for any reason, fallback to ensuring an http:// prefix
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
      return `http://${url}`;
    }
    return url;
  }
}

/**
 * Test endpoint to add a reaction (for debugging only)
 * POST /api/functions/test-add-reaction
 */
router.post('/test-add-reaction', authenticate, async (req: Request, res: Response) => {
  try {
    const { message_id, conversation_id, emoji } = req.body;

    if (!message_id || !conversation_id || !emoji) {
      return res.status(400).json({ 
        error: 'Missing required fields: message_id, conversation_id, emoji' 
      });
    }

    const dbPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'livechat',
    });

    try {
      const result = await dbPool.query(`
        INSERT INTO whatsapp_reactions (message_id, conversation_id, emoji, reactor_jid, is_from_me, created_at)
        VALUES ($1, $2, $3, 'test-reactor', false, NOW())
        RETURNING *
      `, [message_id, conversation_id, emoji]);

      await dbPool.end();
      return res.json({ success: true, reaction: result.rows[0] });
    } catch (dbErr: any) {
      await dbPool.end();
      return res.status(500).json({ error: dbErr.message });
    }
  } catch (error: any) {
    console.error('Error adding test reaction:', error);
    return res.status(500).json({ error: error.message || 'Failed to add test reaction' });
  }
});

/**
 * Test Evolution API connection
 * POST /api/functions/test-evolution-connection
 */
router.post('/test-evolution-connection', authenticate, async (req: Request, res: Response) => {
  try {
    const { api_url, api_key, instance_name, instance_id_external, provider_type } = req.body;

    console.log('🔍 Testing Evolution connection:', {
      provider_type,
      api_url,
      instance_name,
      instance_id_external: instance_id_external ? `${instance_id_external.substring(0, 8)}...` : null,
    });

    if (!api_url || !api_key || !instance_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: api_url, api_key, instance_name' 
      });
    }

    const headers = getEvolutionAuthHeaders(api_key, provider_type);
    
    // For cloud provider, use instance_id_external (UUID), otherwise use instance_name
    // evolution_bot and self_hosted both use instance_name
    const instanceIdentifier = provider_type === 'cloud' && instance_id_external 
      ? instance_id_external 
      : instance_name;

    // Resolve localhost URLs to docker network URLs
    const resolvedApiUrl = resolveDockerUrl(api_url);
    const fullUrl = `${resolvedApiUrl}/instance/connectionState/${instanceIdentifier}`;
    
    console.log('📡 Calling Evolution API:', {
      url: fullUrl,
      originalUrl: api_url,
      provider_type,
      headers: {
        ...headers,
        apikey: `${api_key.substring(0, 10)}...`
      }
    });

    const response = await fetch(fullUrl, { 
      method: 'GET',
      headers 
    });

    const responseText = await response.text();
    console.log('📥 Evolution API Response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText.substring(0, 500)
    });

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      console.error('❌ Evolution API error:', responseData);
      return res.json({
        success: false,
        error: responseData?.message || responseText || 'Connection test failed',
        status: response.status,
        details: responseData,
      });
    }

    console.log('✅ Connection test successful:', responseData);
    
    return res.json({ 
      success: true, 
      data: responseData,
      connectionState: responseData?.instance?.state || responseData?.state || 'unknown'
    });

  } catch (error: unknown) {
    console.error('❌ Error testing connection:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Check Evolution instance status
 * POST /api/functions/check-instances-status
 */
router.post('/check-instances-status', authenticate, async (req: Request, res: Response) => {
  try {
    const { instances } = req.body;

    if (!Array.isArray(instances) || instances.length === 0) {
      return res.status(400).json({ error: 'instances array is required' });
    }

    const results = await Promise.all(
      instances.map(async (instance: { api_url: string; api_key: string; instance_name: string; instance_id_external?: string; provider_type?: string }) => {
        try {
          const headers = getEvolutionAuthHeaders(instance.api_key, instance.provider_type);
          
          const instanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external 
            ? instance.instance_id_external 
            : instance.instance_name;

          const resolvedUrl = resolveDockerUrl(instance.api_url);
          const fullUrl = `${resolvedUrl}/instance/connectionState/${instanceIdentifier}`;
          
          const response = await fetch(fullUrl, { 
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });

          if (!response.ok) {
            return {
              instance_name: instance.instance_name,
              status: 'error',
              error: `HTTP ${response.status}`
            };
          }

          const data: any = await response.json();
          return {
            instance_name: instance.instance_name,
            status: 'ok',
            connectionState: data?.instance?.state || data?.state || 'unknown',
            data
          };
        } catch (error) {
          return {
            instance_name: instance.instance_name,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    return res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Error checking instances status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Test instance connection by instanceId (fetches secrets from DB)
 * POST /api/functions/test-instance-connection
 */
router.post('/test-instance-connection', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId, api_url, api_key, instance_name, instance_id_external, provider_type } = req.body;

    let finalApiUrl = api_url;
    let finalApiKey = api_key;
    let finalInstanceName = instance_name;
    let finalInstanceIdExternal = instance_id_external;
    let finalProviderType = provider_type;

    // If instanceId is provided, fetch data from database
    if (instanceId) {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'convo_insight',
      });

      // Fetch secrets
      const { rows: secretsRows } = await pool.query(
        'SELECT api_url, api_key FROM whatsapp_instance_secrets WHERE instance_id = $1',
        [instanceId]
      );

      if (secretsRows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Instance secrets not found' });
      }

      finalApiUrl = secretsRows[0].api_url;
      finalApiKey = secretsRows[0].api_key;

      // Fetch instance details
      const { rows: instanceRows } = await pool.query(
        'SELECT instance_name, provider_type, instance_id_external FROM whatsapp_instances WHERE id = $1',
        [instanceId]
      );

      if (instanceRows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Instance not found' });
      }

      const instance = instanceRows[0];
      finalInstanceName = instance.instance_name;
      finalProviderType = instance.provider_type || 'self_hosted';
      finalInstanceIdExternal = instance.instance_id_external;

      await pool.end();
    }

    if (!finalApiUrl || !finalApiKey || !finalInstanceName) {
      return res.status(400).json({ 
        error: 'Missing required fields: api_url, api_key, instance_name (or instanceId)' 
      });
    }

    const headers = getEvolutionAuthHeaders(finalApiKey, finalProviderType);
    const instanceIdentifier = finalProviderType === 'cloud' && finalInstanceIdExternal 
      ? finalInstanceIdExternal 
      : finalInstanceName;

    const resolvedApiUrl = resolveDockerUrl(finalApiUrl);
    const fullUrl = `${resolvedApiUrl}/instance/connectionState/${instanceIdentifier}`;
    
    console.log('🔍 Testing instance connection:', {
      instanceId,
      instanceIdentifier,
      url: fullUrl,
    });

    const response = await fetch(fullUrl, { 
      method: 'GET',
      headers 
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    // Determine the connection state and map to database status
    let newStatus = 'disconnected';
    let evolutionState = 'unknown';

    if (response.ok) {
      evolutionState = responseData?.instance?.state || responseData?.state || 'unknown';
      
      if (evolutionState === 'open') {
        newStatus = 'connected';
      } else if (evolutionState === 'connecting') {
        newStatus = 'connecting';
      }
    }

    // Update instance status in database if instanceId was provided
    if (instanceId) {
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_NAME || 'convo_insight',
        });

        await pool.query(
          'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
          [newStatus, instanceId]
        );
        await pool.end();
        console.log(`✅ Updated instance ${instanceId} status to: ${newStatus}`);
      } catch (dbError) {
        console.error('⚠️ Failed to update instance status in DB:', dbError);
        // Don't fail the request, just log the error
      }
    }

    if (!response.ok) {
      return res.json({
        success: false,
        error: responseData?.message || responseText || 'Connection test failed',
        status: response.status,
        details: responseData,
        connectionState: evolutionState,
        dbStatus: newStatus,
      });
    }

    return res.json({ 
      success: true, 
      data: responseData,
      connectionState: evolutionState,
      dbStatus: newStatus,
    });

  } catch (error: unknown) {
    console.error('❌ Error testing instance connection:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Get instance details by instanceId
 * POST /api/functions/get-instance-details
 */
router.post('/get-instance-details', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;

    if (!instanceId) {
      return res.status(400).json({ error: 'instanceId is required' });
    }

    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'convo_insight',
    });

    // Fetch instance
    const { rows: instanceRows } = await pool.query(
      'SELECT * FROM whatsapp_instances WHERE id = $1',
      [instanceId]
    );

    if (instanceRows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'Instance not found' });
    }

    // Fetch secrets (including webhook_base64 if present)
    const { rows: secretsRows } = await pool.query(
      'SELECT api_url, api_key, webhook_endpoint, COALESCE(webhook_base64, false) AS webhook_base64 FROM whatsapp_instance_secrets WHERE instance_id = $1',
      [instanceId]
    );

    await pool.end();

    return res.json({
      success: true,
      instance: instanceRows[0],
      secrets: secretsRows[0] || null,
    });

  } catch (error: unknown) {
    console.error('❌ Error getting instance details:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Configure Evolution instance webhooks
 * POST /api/functions/configure-evolution-instance
 */
router.post('/configure-evolution-instance', authenticate, async (req: Request, res: Response) => {
  try {
    const { 
      instanceId, 
      api_url, 
      api_key, 
      instanceIdentifier, 
      webhookUrl: providedWebhookUrl, 
      base64 = false, 
      events = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'MESSAGES_DELETE'],
      force = false 
    } = req.body;

    console.log('🔧 Configuring Evolution instance:', {
      instanceId,
      instanceIdentifier,
      providedWebhookUrl: providedWebhookUrl || null,
      events,
      force,
      hasApiUrl: !!api_url,
      hasApiKey: !!api_key,
    });

    let finalApiUrl = api_url;
    let finalApiKey = api_key;
    let finalInstanceIdentifier = instanceIdentifier;

    // Determine webhook URL: always prefer env APP_ORIGIN when set (override providedWebhookUrl),
    // otherwise fall back to providedWebhookUrl, request Origin, or request host.
    let webhookToUse: string | undefined;
    const appOrigin = process.env.APP_ORIGIN;
    const requestOrigin = req.get && req.get('origin');

    if (appOrigin) {
      // Always use APP_ORIGIN when configured to keep webhook host stable
      webhookToUse = `${appOrigin.replace(/\/$/, '')}/api/whatsapp/webhooks/evolution`;
    } else if (providedWebhookUrl) {
      webhookToUse = providedWebhookUrl;
    } else if (requestOrigin && !/localhost|127\.0\.0\.1/.test(requestOrigin)) {
      // Prefer the browser Origin header when it's a real host (not localhost)
      webhookToUse = `${requestOrigin.replace(/\/$/, '')}/api/whatsapp/webhooks/evolution`;
    } else if (req && req.protocol && req.get('host')) {
      webhookToUse = `${req.protocol}://${req.get('host')}/api/whatsapp/webhooks/evolution`;
    } else {
      webhookToUse = 'http://localhost:3000/api/whatsapp/webhooks/evolution';
    }

    // If instanceId is provided, fetch secrets from database
    if (instanceId && (!api_url || !api_key)) {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'convo_insight',
      });

      // Fetch secrets
      const { rows: secretsRows } = await pool.query(
        'SELECT api_url, api_key FROM whatsapp_instance_secrets WHERE instance_id = $1',
        [instanceId]
      );

      if (secretsRows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Instance secrets not found' });
      }

      finalApiUrl = secretsRows[0].api_url;
      finalApiKey = secretsRows[0].api_key;

      // Fetch instance details
      const { rows: instanceRows } = await pool.query(
        'SELECT instance_name, provider_type, instance_id_external FROM whatsapp_instances WHERE id = $1',
        [instanceId]
      );

      if (instanceRows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Instance not found' });
      }

      const instance = instanceRows[0];
      finalInstanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external
        ? instance.instance_id_external
        : instance.instance_name;

      await pool.end();
    }

    if (!finalApiUrl || !finalApiKey || !finalInstanceIdentifier) {
      return res.status(400).json({ 
        error: 'Missing required fields: api_url, api_key, instanceIdentifier (or instanceId)' 
      });
    }

    const headers = getEvolutionAuthHeaders(finalApiKey);

    // Build webhook configuration payload - Evolution API v2.x expects { webhook: {...} }
    const webhookPayload = {
      webhook: {
        enabled: true,
        url: webhookToUse,
        webhookBase64: base64,
        webhookByEvents: false,
        events: events,
      }
    };

    const resolvedApiUrl = resolveDockerUrl(finalApiUrl);
    const configUrl = `${resolvedApiUrl}/webhook/set/${finalInstanceIdentifier}`;
    
    console.log('📡 Setting Evolution webhook:', {
      url: configUrl,
      payload: webhookPayload,
    });

    const response = await fetch(configUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await response.text();
    console.log('📥 Evolution webhook response:', {
      status: response.status,
      body: responseText.substring(0, 500),
    });

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      console.error('❌ Evolution webhook configuration failed:', responseData);
      return res.json({
        success: false,
        error: responseData?.message || responseText || 'Failed to configure webhook',
        status: response.status,
        details: responseData,
      });
    }

    console.log('✅ Evolution webhook configured successfully');

    // Persist the webhook endpoint in the secrets table.
    // Prefer the explicit instanceId if provided; otherwise try to resolve by instance name (finalInstanceIdentifier).
    try {
      let targetInstanceId = instanceId;
      if (!targetInstanceId && finalInstanceIdentifier) {
        const { rows } = await pool.query(
          'SELECT id FROM whatsapp_instances WHERE instance_name = $1 LIMIT 1',
          [finalInstanceIdentifier]
        );
        if (rows && rows.length > 0) {
          targetInstanceId = rows[0].id;
        }
      }

      if (targetInstanceId) {
        await pool.query(
          `UPDATE whatsapp_instance_secrets SET webhook_endpoint = $1, webhook_base64 = $2 WHERE instance_id = $3`,
          [webhookToUse, base64 === true, targetInstanceId]
        );
        console.log(`[configure-evolution-instance] Persisted webhook endpoint for instance ${targetInstanceId}: ${webhookToUse}`);
      } else {
        console.warn('[configure-evolution-instance] No instance id found to persist webhook endpoint for identifier', finalInstanceIdentifier);
      }
    } catch (err) {
      console.warn('[configure-evolution-instance] Failed to persist webhook endpoint:', err);
    }
    
    return res.json({
      success: true,
      data: responseData,
      message: 'Webhook configured successfully',
    });

  } catch (error: unknown) {
    console.error('❌ Error configuring Evolution instance:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Sync all instance statuses with Evolution API
 * POST /api/functions/sync-instance-statuses
 */
router.post('/sync-instance-statuses', authenticate, async (req: Request, res: Response) => {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'convo_insight',
    });

    // Fetch all instances with their secrets
    const { rows: instances } = await pool.query(`
      SELECT 
        i.id, i.instance_name, i.provider_type, i.instance_id_external, i.status,
        s.api_url, s.api_key
      FROM whatsapp_instances i
      LEFT JOIN whatsapp_instance_secrets s ON i.id = s.instance_id
    `);

    console.log(`🔄 Syncing status for ${instances.length} instances`);

    const results: any[] = [];

    for (const instance of instances) {
      try {
        if (!instance.api_url || !instance.api_key) {
          results.push({
            instance_name: instance.instance_name,
            status: 'error',
            error: 'Missing API credentials'
          });
          continue;
        }

        const headers = getEvolutionAuthHeaders(instance.api_key, instance.provider_type);
        const instanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external
          ? instance.instance_id_external
          : instance.instance_name;

        const resolvedUrl = resolveDockerUrl(instance.api_url);
        const fullUrl = `${resolvedUrl}/instance/connectionState/${instanceIdentifier}`;

        const response = await fetch(fullUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          // Mark as disconnected
          await pool.query(
            'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
            ['disconnected', instance.id]
          );
          results.push({
            instance_name: instance.instance_name,
            status: 'disconnected',
            error: `HTTP ${response.status}`
          });
          continue;
        }

        const data: any = await response.json();
        const state = data?.instance?.state || data?.state || 'unknown';
        
        // Map Evolution state to our status
        let newStatus = 'disconnected';
        if (state === 'open') {
          newStatus = 'connected';
        } else if (state === 'connecting') {
          newStatus = 'connecting';
        }

        // Update status in database
        await pool.query(
          'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
          [newStatus, instance.id]
        );

        results.push({
          instance_name: instance.instance_name,
          previous_status: instance.status,
          new_status: newStatus,
          evolution_state: state
        });

      } catch (error) {
        // Mark as disconnected on error
        await pool.query(
          'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
          ['disconnected', instance.id]
        );
        results.push({
          instance_name: instance.instance_name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    await pool.end();

    console.log('✅ Status sync completed:', results);

    return res.json({
      success: true,
      synced: results.length,
      results
    });

  } catch (error: unknown) {
    console.error('❌ Error syncing instance statuses:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Update single instance status
 * POST /api/functions/update-instance-status
 */
router.post('/update-instance-status', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;

    if (!instanceId) {
      return res.status(400).json({ error: 'instanceId is required' });
    }

    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'convo_insight',
    });

    // Fetch instance with secrets
    const { rows } = await pool.query(`
      SELECT 
        i.id, i.instance_name, i.provider_type, i.instance_id_external, i.status,
        s.api_url, s.api_key
      FROM whatsapp_instances i
      LEFT JOIN whatsapp_instance_secrets s ON i.id = s.instance_id
      WHERE i.id = $1
    `, [instanceId]);

    if (rows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'Instance not found' });
    }

    const instance = rows[0];

    if (!instance.api_url || !instance.api_key) {
      await pool.end();
      return res.status(400).json({ error: 'Instance missing API credentials' });
    }

    const headers = getEvolutionAuthHeaders(instance.api_key);
    const instanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external
      ? instance.instance_id_external
      : instance.instance_name;

    const resolvedUrl = resolveDockerUrl(instance.api_url);
    const fullUrl = `${resolvedUrl}/instance/connectionState/${instanceIdentifier}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000)
    });

    let newStatus = 'disconnected';
    let evolutionState = 'unknown';

    if (response.ok) {
      const data: any = await response.json();
      evolutionState = data?.instance?.state || data?.state || 'unknown';
      
      if (evolutionState === 'open') {
        newStatus = 'connected';
      } else if (evolutionState === 'connecting') {
        newStatus = 'connecting';
      }
    }

    // Update status
    await pool.query(
      'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, instanceId]
    );

    await pool.end();

    return res.json({
      success: true,
      instance_name: instance.instance_name,
      previous_status: instance.status,
      new_status: newStatus,
      evolution_state: evolutionState
    });

  } catch (error: unknown) {
    console.error('❌ Error updating instance status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Setup project configuration
 * POST /api/functions/setup-project-config
 * Stores project credentials and configuration
 */
router.post('/setup-project-config', authenticate, async (req: Request, res: Response) => {
  try {
    console.log('[setup-project-config] Starting automatic project configuration...');

    // Get base URL from environment or request
    const projectUrl = process.env.VITE_API_URL || `http://localhost:${process.env.PORT || 3000}/api`;

    // Upsert project_url config
    await pool.query(`
      INSERT INTO project_config (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, ['project_url', projectUrl]);

    // Upsert anon_key config (if needed - this would be for Supabase compatibility)
    const anonKey = process.env.JWT_SECRET || 'local-api-key';
    await pool.query(`
      INSERT INTO project_config (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, ['anon_key', anonKey]);

    console.log('[setup-project-config] Configuration completed successfully!');

    return res.json({
      success: true,
      message: 'Project configuration completed successfully',
    });

  } catch (error: unknown) {
    console.error('[setup-project-config] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * Ensure user profile and role exist
 * POST /api/functions/ensure-user-profile
 * Creates profile and assigns default role if missing
 */
router.post('/ensure-user-profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('🔍 Checking profile/role for user:', userId);

    let profileCreated = false;
    let roleCreated = false;
    let profileAutoApproved = false;

    // Check if approval is required
    const { rows: approvalConfigRows } = await pool.query(
      "SELECT value FROM project_config WHERE key = 'require_account_approval'"
    );
    const requireApproval = approvalConfigRows[0]?.value === 'true';
    console.log('📋 Approval config:', { requireApproval });

    // Count existing profiles to determine if first user
    const { rows: countRows } = await pool.query('SELECT COUNT(*) as count FROM profiles');
    const profileCount = parseInt(countRows[0]?.count || '0');
    const isFirstUser = profileCount === 0;
    console.log('👤 Profile count:', profileCount, 'Is first user:', isFirstUser);

    // Check if profile exists
    const { rows: profileRows } = await pool.query(
      'SELECT id, is_approved FROM profiles WHERE id = $1',
      [userId]
    );
    const existingProfile = profileRows[0];

    if (!existingProfile) {
      console.log('⚠️ Profile missing, creating...');

      // First user always approved; others depend on config
      const isApproved = isFirstUser ? true : !requireApproval;
      console.log('📝 Creating profile with is_approved:', isApproved);

      // Get user info from auth token
      const fullName = req.user?.fullName || req.user?.email?.split('@')[0] || 'Usuário';
      const email = req.user?.email || '';

      // Create profile
      try {
        await pool.query(`
          INSERT INTO profiles (id, full_name, email, is_active, is_approved, created_at, updated_at)
          VALUES ($1, $2, $3, true, $4, NOW(), NOW())
        `, [userId, fullName, email, isApproved]);
        profileCreated = true;
        console.log('✅ Profile created with is_approved:', isApproved);
      } catch (profileError) {
        console.error('❌ Error creating profile:', profileError);
      }
    } else {
      // Profile exists - check if first/only user needs auto-approval fix
      if (existingProfile.is_approved === false || existingProfile.is_approved === null) {
        // Re-count to check if this is the only user
        const { rows: totalRows } = await pool.query('SELECT COUNT(*) as count FROM profiles');
        const totalProfiles = parseInt(totalRows[0]?.count || '0');

        // If only one profile exists and it's not approved, auto-approve (first admin fix)
        if (totalProfiles === 1) {
          console.log('🔧 Auto-approving first/only user...');
          try {
            await pool.query('UPDATE profiles SET is_approved = true WHERE id = $1', [userId]);
            profileAutoApproved = true;
            console.log('✅ First user auto-approved');
          } catch (approveError) {
            console.error('❌ Error auto-approving:', approveError);
          }
        }
      }
    }

    // Check if role exists
    const { rows: roleRows } = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [userId]
    );
    const existingRole = roleRows[0];

    if (!existingRole) {
      console.log('⚠️ Role missing, assigning...');

      // First user gets admin role, others get agent role
      const role = isFirstUser ? 'admin' : 'agent';

      try {
        await pool.query(`
          INSERT INTO user_roles (user_id, role, created_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
        `, [userId, role]);
        roleCreated = true;
        console.log('✅ Role assigned:', role);
      } catch (roleError) {
        console.error('❌ Error assigning role:', roleError);
      }
    }

    // Fetch final profile and role data
    const { rows: finalProfileRows } = await pool.query(`
      SELECT p.*, r.role 
      FROM profiles p 
      LEFT JOIN user_roles r ON p.id = r.user_id 
      WHERE p.id = $1
    `, [userId]);
    const finalProfile = finalProfileRows[0];

    return res.json({
      success: true,
      profileCreated,
      roleCreated,
      profileAutoApproved,
      profile: finalProfile ? {
        id: finalProfile.id,
        fullName: finalProfile.full_name,
        email: finalProfile.email,
        isApproved: finalProfile.is_approved,
        isActive: finalProfile.is_active,
        role: finalProfile.role,
      } : null,
    });

  } catch (error: unknown) {
    console.error('[ensure-user-profile] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Compose WhatsApp message with AI
 * POST /api/functions/compose-whatsapp-message
 * Enhanced version with all compose actions
 */
router.post('/compose-whatsapp-message', authenticate, async (req: Request, res: Response) => {
  try {
    const { message, action, targetLanguage } = req.body;

    if (!message || !action) {
      return res.status(400).json({ error: 'Message and action are required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(502).json({ error: 'GROQ_API_KEY not configured' });
    }

    let prompt = '';

    // Define prompts for each action
    switch (action) {
      case 'expand':
        prompt = `Você é um assistente de atendimento. Expanda esta mensagem curta em uma resposta completa e profissional, mantendo o mesmo significado mas adicionando contexto e detalhes úteis:

"${message}"

Responda apenas com o texto expandido, sem explicações.`;
        break;

      case 'rephrase':
        prompt = `Reformule esta mensagem mantendo exatamente o mesmo significado, mas usando palavras e estrutura diferentes:

"${message}"

Responda apenas com o texto reformulado.`;
        break;

      case 'my_tone':
        prompt = `Reescreva esta mensagem de forma profissional e amigável:

"${message}"

Responda apenas com a mensagem reescrita.`;
        break;

      case 'friendly':
        prompt = `Reescreva esta mensagem de forma mais casual, amigável e acolhedora. Use emojis apropriados:

"${message}"

Responda apenas com a versão amigável.`;
        break;

      case 'formal':
        prompt = `Reescreva esta mensagem de forma mais profissional e formal, removendo gírias e mantendo um tom corporativo:

"${message}"

Responda apenas com a versão formal.`;
        break;

      case 'fix_grammar':
        prompt = `Corrija todos os erros de gramática, ortografia e pontuação nesta mensagem, mantendo o tom e significado:

"${message}"

Responda apenas com o texto corrigido.`;
        break;

      case 'translate':
        const languageNames: Record<string, string> = {
          'en': 'inglês',
          'es': 'espanhol',
          'fr': 'francês',
          'de': 'alemão',
          'it': 'italiano',
          'pt': 'português'
        };
        const langName = languageNames[targetLanguage || 'en'] || targetLanguage;
        prompt = `Traduza esta mensagem para ${langName}, mantendo o tom e o contexto:

"${message}"

Responda apenas com a tradução.`;
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    console.log('Calling GROQ for composition action:', action);
    const model = action === 'fix_grammar' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';

    const groqResp = await fetch(groqEndpoint(), {
      method: 'POST',
      headers: buildGroqHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!groqResp.ok) {
      const errorText = await groqResp.text();
      console.error('GROQ API error:', errorText);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await groqResp.json();
    const composedText = data?.choices?.[0]?.message?.content || '';

    return res.json({
      success: true,
      composedText,
      action,
    });

  } catch (error: unknown) {
    console.error('[compose-whatsapp-message] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Get signed URL for media download
 * POST /api/functions/get-media-signed-url
 */
router.post('/get-media-signed-url', authenticate, async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'filePath é obrigatório' });
    }

    console.log('[get-media-signed-url] Generating URL for:', filePath);

    // Import storage utilities
    const { getSignedDownloadUrl } = await import('../lib/storage');

    const signedUrl = await getSignedDownloadUrl(filePath, 3600); // 1 hour expiry

    console.log('[get-media-signed-url] Generated URL successfully');

    return res.json({ signedUrl });
  } catch (error: unknown) {
    console.error('[get-media-signed-url] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Helper to replace template variables
 */
function replaceTemplateVariables(content: string, context: any): string {
  if (!context) return content;
  let result = content;
  
  if (context.clienteNome) result = result.replace(/\{\{clienteNome\}\}/g, context.clienteNome);
  if (context.clienteTelefone) result = result.replace(/\{\{clienteTelefone\}\}/g, context.clienteTelefone);
  if (context.atendenteNome) result = result.replace(/\{\{atendenteNome\}\}/g, context.atendenteNome);
  if (context.ticketNumero !== undefined) result = result.replace(/\{\{ticketNumero\}\}/g, String(context.ticketNumero));
  if (context.setorNome) result = result.replace(/\{\{setorNome\}\}/g, context.setorNome);
  
  const now = new Date();
  result = result.replace(/\{\{dataAtual\}\}/g, now.toLocaleDateString('pt-BR'));
  result = result.replace(/\{\{horaAtual\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  
  return result;
}

/**
 * Helper to build Evolution API request based on message type
 */
function buildEvolutionRequest(
  apiUrl: string,
  instanceName: string,
  number: string,
  body: any
): { endpoint: string; requestBody: any } {
  let baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  baseUrl = baseUrl.replace(/\/manager$/, '');

  switch (body.messageType) {
    case 'text': {
      const requestBody: any = { number, text: body.content };
      if (body.quotedMessageId) {
        requestBody.quoted = { key: { id: body.quotedMessageId } };
      }
      return { endpoint: `${baseUrl}/message/sendText/${instanceName}`, requestBody };
    }

    case 'audio': {
      let audioData: string | undefined;
      if (body.mediaBase64) {
        audioData = body.mediaBase64.startsWith('data:')
          ? body.mediaBase64.split(',')[1] || ''
          : body.mediaBase64;
      } else if (body.mediaUrl) {
        audioData = body.mediaUrl;
      }
      if (!audioData) throw new Error('Missing audio data');
      return {
        endpoint: `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`,
        requestBody: { number, audio: audioData },
      };
    }

    case 'image':
    case 'video':
    case 'document': {
      const requestBody: any = {
        number,
        mediatype: body.messageType,
        media: body.mediaBase64 || body.mediaUrl,
      };
      if (body.content) requestBody.caption = body.content;
      if (body.messageType === 'document' && body.fileName) {
        requestBody.fileName = body.fileName;
      }
      return { endpoint: `${baseUrl}/message/sendMedia/${instanceName}`, requestBody };
    }

    default:
      throw new Error(`Unsupported message type: ${body.messageType}`);
  }
}

/**
 * Send WhatsApp message (full-featured)
 * POST /api/functions/send-whatsapp-message
 * Supports text, audio, image, video, document, supervisor messages, skip_chat
 */
router.post('/send-whatsapp-message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      conversationId,
      content,
      messageType = 'text',
      mediaUrl,
      mediaBase64,
      mediaMimetype,
      fileName,
      quotedMessageId,
      skipAgentPrefix = false,
      templateContext,
      isSupervisorMessage = false,
      supervisorId,
      skip_chat = false
    } = req.body as any;

    console.log('[send-whatsapp-message] === REQUEST RECEIVED ===');
    console.log('[send-whatsapp-message] conversationId:', conversationId);
    console.log('[send-whatsapp-message] messageType:', messageType);
    console.log('[send-whatsapp-message] content (first 100 chars):', content?.substring(0, 100));
    console.log('[send-whatsapp-message] skipAgentPrefix:', skipAgentPrefix);
    console.log('[send-whatsapp-message] templateContext:', JSON.stringify(templateContext));
    console.log('[send-whatsapp-message] userId:', req.user?.userId);

    if (!conversationId || !messageType) {
      console.log('[send-whatsapp-message] Missing required fields');
      return res.status(400).json({ error: 'conversationId and messageType are required' });
    }

    if (messageType === 'text' && !content) {
      return res.status(400).json({ error: 'content is required for text messages' });
    }

    if (messageType !== 'text' && !mediaUrl && !mediaBase64) {
      return res.status(400).json({ error: 'mediaUrl or mediaBase64 is required for media messages' });
    }

    // Get conversation with contact and instance
    const convRes = await pool.query(
      `SELECT c.*, ct.phone_number as contact_phone, ct.name as contact_name, ct.metadata as contact_metadata,
              ct.remote_jid as contact_remote_jid, ct.is_group as contact_is_group,
              i.id as inst_id, i.instance_name, i.provider_type, i.instance_id_external
       FROM whatsapp_conversations c
       JOIN whatsapp_contacts ct ON ct.id = c.contact_id
       JOIN whatsapp_instances i ON i.id = c.instance_id
       WHERE c.id = $1 LIMIT 1`,
      [conversationId]
    );

    const conversation = convRes.rows[0];
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    // Get secrets
    const secRes = await pool.query('SELECT * FROM whatsapp_instance_secrets WHERE instance_id = $1 LIMIT 1', [conversation.inst_id]);
    const secrets = secRes.rows[0];
    if (!secrets) return res.status(404).json({ error: 'Instance secrets not found for instance id ' + conversation.inst_id });

    const providerType = conversation.provider_type || secrets.provider_type || 'self_hosted';
    const instanceIdentifier = providerType === 'cloud' && conversation.instance_id_external
      ? conversation.instance_id_external
      : conversation.instance_name;

    // Get agent name for prefix
    let agentName: string | null = null;
    if (!skipAgentPrefix && messageType === 'text' && req.user) {
      try {
        const profileRes = await pool.query('SELECT full_name FROM profiles WHERE id = $1 LIMIT 1', [req.user.userId]);
        agentName = profileRes.rows[0]?.full_name || null;
      } catch (_) {}
    }

    // Process content
    let processedContent = content || '';
    console.log('[send-whatsapp-message] Content before template processing:', processedContent?.substring(0, 100));
    if (templateContext) {
      processedContent = replaceTemplateVariables(processedContent, templateContext);
      console.log('[send-whatsapp-message] Content after template processing:', processedContent?.substring(0, 100));
    }
    if (agentName && messageType === 'text' && !skipAgentPrefix) {
      processedContent = `*[ ${agentName} ]*\n${processedContent}`;
    }
    console.log('[send-whatsapp-message] Final processed content:', processedContent?.substring(0, 150));

    // Get destination number - Priority: Group full_jid > senderPn from metadata > phone_number
    // For @lid contacts or when senderPn is available, use the proper identifier
    const rawMetadata = conversation.contact_metadata;
    const contactMetadata = typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : (rawMetadata || {});
    const senderPn = contactMetadata.sender_pn;
    const isGroup = conversation.contact_is_group;
    const contactRemoteJid = conversation.contact_remote_jid;
    
    console.log('[send-whatsapp-message] Contact info:', { isGroup, contactRemoteJid, fullJid: contactMetadata.full_jid, phone: conversation.contact_phone });
    
    let destNumber: string;
    
    // For groups, use full_jid from metadata (has phone-groupid@g.us format) for Evolution API
    if (isGroup && contactRemoteJid && contactRemoteJid.includes('@g.us')) {
      // Prefer full_jid from metadata if available (Evolution API needs complete JID)
      const fullJid = contactMetadata.full_jid;
      destNumber = fullJid || contactRemoteJid;
      console.log('[send-whatsapp-message] Group message, using JID:', destNumber);
    } else if (senderPn) {
      // Use senderPn (real phone number) if available
      destNumber = senderPn.replace(/\D/g, '');
      console.log('[send-whatsapp-message] Using senderPn for destination:', destNumber);
    } else if (conversation.contact_phone.includes('@lid')) {
      // For @lid contacts without senderPn, use the full lid identifier
      destNumber = conversation.contact_phone;
      console.log('[send-whatsapp-message] Using lidId for destination:', destNumber);
    } else {
      // Regular phone number
      destNumber = conversation.contact_phone.replace(/\D/g, '');
      console.log('[send-whatsapp-message] Using phone number for destination:', destNumber);
    }

    // Process media from local storage if mediaUrl is a local path (not http/https)
    let processedMediaBase64 = mediaBase64;
    let processedMediaUrl = mediaUrl;
    let s3UploadedKey: string | null = null;
    
    if (messageType !== 'text' && mediaUrl && !mediaBase64) {
      // Check if mediaUrl is a local storage path (not a full URL)
      const isLocalPath = !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://') && !mediaUrl.startsWith('data:');
      
      if (isLocalPath) {
        try {
          console.log('[send-whatsapp-message] Converting local storage path to base64:', mediaUrl);
          const fileBuffer = await getFile(mediaUrl);
          processedMediaBase64 = fileBuffer.toString('base64');
          // Try uploading the file to S3/MinIO so frontend can reference stable URL/filename
          try {
            const { uploadFile: s3UploadFile } = await import('../lib/storage');
            const path = require('path');
            const originalName = fileName || path.basename(mediaUrl || 'file');
            const safeName = originalName.replace(/\\|\//g, '_');
            const s3Key = `whatsapp-media/${instanceIdentifier}/${safeName}`;
            await s3UploadFile(s3Key, fileBuffer, mediaMimetype || 'application/octet-stream');
            s3UploadedKey = s3Key;
            processedMediaUrl = s3Key;
            console.log('[send-whatsapp-message] Uploaded attachment to S3 key:', s3Key);
          } catch (uploadErr) {
            console.warn('[send-whatsapp-message] S3 upload failed, continuing with local/base64 media:', uploadErr?.message || uploadErr);
          }
          console.log('[send-whatsapp-message] File converted to base64, size:', processedMediaBase64.length);
        } catch (fileError) {
          console.error('[send-whatsapp-message] Error reading file from storage:', fileError);
          return res.status(400).json({ error: 'Failed to read media file from storage' });
        }
      }
    }

    // Build request with processed media
    const { endpoint, requestBody } = buildEvolutionRequest(
      secrets.api_url || secrets.apiUrl,
      instanceIdentifier,
      destNumber,
      { ...req.body, content: processedContent, mediaBase64: processedMediaBase64, mediaUrl: processedMediaUrl }
    );

    const headers = getEvolutionAuthHeaders(secrets.api_key || secrets.apiKey, providerType);
    const targetUrl = resolveDockerUrl(endpoint);

    console.log('[send-whatsapp-message] Sending to:', targetUrl);

    let evolutionData: any = null;
    let usedFallback = false;
    
    try {
      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error('Evolution API error (send-whatsapp-message):', txt);
        
        // Try fallback for group text messages
        if (isGroup && messageType === 'text' && destNumber.includes('@g.us')) {
          console.log('[send-whatsapp-message] Evolution failed for group, trying fallback API...');
          const fallbackUrl = 'http://192.168.3.39:8088/send/text';
          const fallbackResp = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ jid: destNumber, text: processedContent }),
          });
          
          if (fallbackResp.ok) {
            const fallbackData = await fallbackResp.json();
            console.log('[send-whatsapp-message] Fallback API success:', JSON.stringify(fallbackData));
            evolutionData = fallbackData;
            usedFallback = true;
          } else {
            const fallbackTxt = await fallbackResp.text();
            console.error('[send-whatsapp-message] Fallback API also failed:', fallbackTxt);
            return res.status(500).json({ error: 'Failed to send message via Evolution API and fallback', detail: txt });
          }
        } else {
          return res.status(500).json({ error: 'Failed to send message via Evolution API', detail: txt });
        }
      } else {
        evolutionData = await resp.json();
      }
    } catch (err: any) {
      console.error('[send-whatsapp-message] Error calling Evolution API:', err?.message || err);
      
      // Try fallback for group text messages on network error
      if (isGroup && messageType === 'text' && destNumber.includes('@g.us')) {
        try {
          console.log('[send-whatsapp-message] Evolution network error for group, trying fallback API...');
          const fallbackUrl = 'http://192.168.3.39:8088/send/text';
          const fallbackResp = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ jid: destNumber, text: processedContent }),
          });
          
          if (fallbackResp.ok) {
            const fallbackData = await fallbackResp.json();
            console.log('[send-whatsapp-message] Fallback API success:', JSON.stringify(fallbackData));
            evolutionData = fallbackData;
            usedFallback = true;
          } else {
            const fallbackTxt = await fallbackResp.text();
            console.error('[send-whatsapp-message] Fallback API also failed:', fallbackTxt);
            return res.status(500).json({ error: 'Failed to call Evolution API and fallback', detail: err?.message || String(err) });
          }
        } catch (fallbackErr: any) {
          console.error('[send-whatsapp-message] Fallback API error:', fallbackErr?.message || fallbackErr);
          return res.status(500).json({ error: 'Failed to call Evolution API and fallback', detail: err?.message || String(err) });
        }
      } else {
        return res.status(500).json({ error: 'Failed to call Evolution API', detail: err?.message || String(err) });
      }
    }
    
    const messageId = evolutionData?.key?.id || evolutionData?.messageId || require('crypto').randomUUID();
    
    console.log('[send-whatsapp-message] Evolution response key:', JSON.stringify(evolutionData?.key));
    console.log('[send-whatsapp-message] Using message_id:', messageId, usedFallback ? '(via fallback)' : '');

    // Extract media URL from response
    let extractedMediaUrl: string | null = null;
    if (messageType === 'audio' && evolutionData.message?.audioMessage?.url) {
      extractedMediaUrl = evolutionData.message.audioMessage.url;
    } else if (messageType === 'image' && evolutionData.message?.imageMessage?.url) {
      extractedMediaUrl = evolutionData.message.imageMessage.url;
    } else if (messageType === 'video' && evolutionData.message?.videoMessage?.url) {
      extractedMediaUrl = evolutionData.message.videoMessage.url;
    } else if (messageType === 'document' && evolutionData.message?.documentMessage?.url) {
      extractedMediaUrl = evolutionData.message.documentMessage.url;
    }

    // If skip_chat, don't save message
    if (skip_chat) {
      console.log('[send-whatsapp-message] skip_chat=true, not saving message');
      return res.json({
        success: true,
        message: {
          id: messageId,
          message_id: messageId,
          content: processedContent || '',
          message_type: messageType,
          media_url: extractedMediaUrl || mediaUrl || null,
          media_mimetype: mediaMimetype || null,
          status: 'sent',
          is_from_me: true,
          timestamp: new Date().toISOString(),
          skipped_chat: true,
        }
      });
    }

    // Save message to database
    const messageContent = messageType === 'text' ? processedContent : (content || `Sent ${messageType}`);
    
    // Build remote_jid based on available identifiers
    let remoteJid: string;
    if (conversation.contact_phone.includes('@lid')) {
      remoteJid = conversation.contact_phone.includes('@') ? conversation.contact_phone : `${conversation.contact_phone}@lid`;
    } else {
      const phoneForJid = senderPn || conversation.contact_phone.replace(/\D/g, '');
      remoteJid = `${phoneForJid}@s.whatsapp.net`;
    }

    // Prefer storing S3 key if we uploaded, otherwise use evolution extracted URL or provided mediaUrl
    const storedMediaUrl = s3UploadedKey || extractedMediaUrl || mediaUrl || null;

    const insertRes = await pool.query(
      `INSERT INTO whatsapp_messages 
       (conversation_id, remote_jid, message_id, content, message_type, media_url, media_mimetype, 
        is_from_me, status, timestamp, created_at, quoted_message_id, is_supervisor_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'sent', NOW(), NOW(), $8, $9, $10)
       RETURNING *`,
      [
        conversationId,
        remoteJid,
        messageId,
        messageContent,
        messageType,
        storedMediaUrl,
        mediaMimetype || null,
        quotedMessageId || null,
        isSupervisorMessage || false,
        JSON.stringify({ fileName, supervisorId: isSupervisorMessage ? supervisorId : null, evolutionResponse: evolutionData })
      ]
    );

    // Update conversation
    await pool.query(
      `UPDATE whatsapp_conversations SET last_message_at = NOW(), last_message_preview = $1, updated_at = NOW() WHERE id = $2`,
      [messageContent.substring(0, 100), conversationId]
    );

    console.log('[send-whatsapp-message] Message sent and saved:', insertRes.rows[0]?.id);

    // Dispatch webhook for message_sent event
    webhookEvents.messageSent(conversationId, messageId, messageContent.substring(0, 500));

    return res.json({ success: true, message: insertRes.rows[0] });
  } catch (error) {
    console.error('[send-whatsapp-message] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Suggest smart replies for a conversation
 * POST /api/functions/suggest-smart-replies
 * Enhanced version with conversation context
 */
// Helper: robustly extract JSON from AI content (removes code fences and extracts first JSON object)
function parseJsonFromAI(content: string | undefined) {
  if (!content || typeof content !== 'string') return null;
  // Remove common code fences
  const fenceMatch = content.match(/```(?:json)?\n([\s\S]*?)```/i);
  let candidate = fenceMatch ? fenceMatch[1] : content;
  candidate = candidate.replace(/^\s*```.*\n?|```\s*$/g, '').trim();

  // If the content is not pure JSON, try to extract first {...}
  if (!candidate.startsWith('{')) {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      candidate = candidate.slice(first, last + 1);
    }
  }

  try {
    return JSON.parse(candidate);
  } catch (e) {
    try {
      // Last resort: try to locate a JSON substring by searching braces
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(candidate.slice(start, end + 1));
      }
    } catch (_) {}
  }
  return null;
}
router.post('/suggest-smart-replies', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    const defaultSuggestions = [
      { text: "Olá! Como posso ajudá-lo(a) hoje?", tone: "formal" },
      { text: "Oi! Em que posso te ajudar? 😊", tone: "friendly" },
      { text: "Oi! Qual sua dúvida?", tone: "direct" }
    ];

    if (!GROQ_API_KEY) {
      console.warn('GROQ_API_KEY not configured, returning default suggestions');
      return res.json({ suggestions: defaultSuggestions, context: null });
    }

    // Fetch last messages from conversation
    const { rows: messages } = await pool.query(`
      SELECT content, is_from_me, message_type, timestamp
      FROM whatsapp_messages
      WHERE conversation_id = $1
      ORDER BY timestamp DESC
      LIMIT 10
    `, [conversationId]);

    // Get contact name
    const { rows: conversationRows } = await pool.query(`
      SELECT c.name as contact_name
      FROM whatsapp_conversations conv
      JOIN whatsapp_contacts c ON conv.contact_id = c.id
      WHERE conv.id = $1
    `, [conversationId]);
    
    const contactName = conversationRows[0]?.contact_name || 'Cliente';

    // Filter text messages and reverse order
    const textMessages = messages.filter((m: any) => m.message_type === 'text' || !m.message_type).reverse();

    if (textMessages.length === 0) {
      return res.json({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } });
    }

    // Get last client message
    const lastClientMessage = textMessages.filter((m: any) => !m.is_from_me).pop();

    if (!lastClientMessage) {
      return res.json({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } });
    }

    // Build recent messages context
    const recentMessages = textMessages.slice(-8).map((m: any) =>
      `${m.is_from_me ? 'Você' : contactName}: ${m.content}`
    ).join('\n');

    const model = 'llama-3.1-8b-instant';

    const systemPrompt = `Você é um assistente que gera respostas CURTAS (até 2 frases) e ÚTEIS para atendimento ao cliente.

REGRAS:
- Foque em resolver ou encaminhar, não cumprimente à toa
- Varie o tom: formal, friendly, direct
- Use português do Brasil
- Se for sobre agendamento, proponha 1-2 opções de horário
- Se for instrução operacional, traga passos claros
- Seja objetivo e útil

CONTEXTO:
- Cliente: ${contactName}
- Última mensagem do cliente: "${lastClientMessage.content}"
- Histórico recente:
${recentMessages}`;

    try {
      const groqResp = await fetch(groqEndpoint(), {
        method: 'POST',
        headers: buildGroqHeaders(),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'GERE_UM_JSON: Retorne exatamente um JSON com a chave "suggestions" contendo 3 objetos com "text" e "tone" (formal|friendly|direct). Não inclua texto adicional.' }
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (groqResp.ok) {
        const data = await groqResp.json();
        const content = data?.choices?.[0]?.message?.content || '';
        const parsed = parseJsonFromAI(content);
        if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
          return res.json({
            suggestions: parsed.suggestions,
            context: { contactName, lastMessage: lastClientMessage.content }
          });
        } else {
          console.warn('AI response JSON parse failed, falling back to defaults');
        }
      } else {
        // Log rate limit or other Groq errors but still return defaults
        const errorBody = await groqResp.text().catch(() => '');
        console.warn(`[suggest-smart-replies] Groq API returned ${groqResp.status}:`, errorBody.substring(0, 200));
      }
    } catch (aiError) {
      console.error('AI call failed:', aiError);
    }

    return res.json({
      suggestions: defaultSuggestions,
      context: { contactName, lastMessage: lastClientMessage.content }
    });

  } catch (error: unknown) {
    console.error('[suggest-smart-replies] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * AI Agent respond to conversation
 * POST /api/functions/ai-agent-respond
 * Full implementation of AI agent auto-response
 */
router.post('/ai-agent-respond', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, messageId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI not configured' });
    }

    // Fetch conversation with sector
    const { rows: convRows } = await pool.query(`
      SELECT 
        c.*,
        s.name as sector_name
      FROM whatsapp_conversations c
      LEFT JOIN sectors s ON c.sector_id = s.id
      WHERE c.id = $1
    `, [conversationId]);

    const conversation = convRows[0];
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if in human mode
    if (conversation.conversation_mode === 'human') {
      return res.json({ skipped: true, reason: 'human_mode' });
    }

    // Fetch AI agent config for sector
    const { rows: configRows } = await pool.query(`
      SELECT * FROM ai_agent_configs 
      WHERE sector_id = $1 AND is_enabled = true
    `, [conversation.sector_id]);

    const config = configRows[0];
    if (!config) {
      return res.json({ skipped: true, reason: 'no_config' });
    }

    // Get contact info
    const { rows: contactRows } = await pool.query(
      'SELECT * FROM whatsapp_contacts WHERE id = $1',
      [conversation.contact_id]
    );
    const contact = contactRows[0];

    // Get recent messages
    const { rows: messages } = await pool.query(`
      SELECT content, is_from_me, message_type, created_at
      FROM whatsapp_messages
      WHERE conversation_id = $1 AND is_internal = false
      ORDER BY created_at DESC
      LIMIT 20
    `, [conversationId]);

    const reversedHistory = messages.reverse();

    // Build system prompt
    const systemPrompt = `Você é ${config.agent_name || 'um assistente virtual'} da empresa.
${config.persona_description || ''}

Tom de voz: ${config.tone_of_voice || 'profissional e amigável'}

${config.business_context ? `Contexto do negócio: ${config.business_context}` : ''}

${config.faq_context ? `FAQ: ${config.faq_context}` : ''}

REGRAS:
- Responda de forma concisa e útil
- Use português do Brasil
- Seja educado e profissional
- Se não souber algo, ofereça transferir para um atendente humano`;

    // Build messages for AI
    const aiMessages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...reversedHistory.map((msg: any) => ({
        role: msg.is_from_me ? 'assistant' : 'user',
        content: msg.content || '[mídia]'
      }))
    ];

    // Call AI
    const groqResp = await fetch(groqEndpoint(), {
      method: 'POST',
      headers: buildGroqHeaders(),
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: aiMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!groqResp.ok) {
      const errorText = await groqResp.text();
      console.error('GROQ API error:', errorText);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await groqResp.json();
    const aiResponse = data?.choices?.[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

    return res.json({
      success: true,
      response: aiResponse,
      shouldSend: true,
      agentName: config.agent_name,
    });

  } catch (error: unknown) {
    console.error('[ai-agent-respond] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

export default router;

/**
 * Mark messages as read (client viewed)
 * POST /api/functions/mark-messages-read
 * body: { conversationId: string, messageIds?: string[] }
 * - Sets conversation.unread_count = 0
 * - Updates whatsapp_messages.status = 'read' for the selected messages (non is_from_me)
 * - Attempts to notify the Evolution API (best-effort)
 * Note: No authentication required - internal operation validated by conversationId
 */
router.post('/mark-messages-read', async (req: Request, res: Response) => {
  try {
    const { conversationId, messageIds } = req.body as { conversationId?: string; messageIds?: string[] };

    if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });

    // Fetch conversation, contact and instance
    const { rows: convRows } = await pool.query(
      `SELECT c.id, c.instance_id, c.contact_id, ct.phone_number, ct.remote_jid as contact_remote_jid, 
              ct.metadata as contact_metadata, i.instance_name, i.provider_type
       FROM whatsapp_conversations c
       JOIN whatsapp_contacts ct ON ct.id = c.contact_id
       JOIN whatsapp_instances i ON i.id = c.instance_id
       WHERE c.id = $1 LIMIT 1`,
      [conversationId]
    );

    if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const conv = convRows[0];

    // Get messages that need to be marked as read (includes remote_jid and message_id for Evolution API)
    let messagesToMark: any[];
    if (Array.isArray(messageIds) && messageIds.length > 0) {
      const placeholders = messageIds.map((_, i) => `$${i + 2}`).join(',');
      const params: any[] = [conversationId, ...messageIds];
      const { rows } = await pool.query(
        `SELECT id, message_id, remote_jid FROM whatsapp_messages 
         WHERE conversation_id = $1 AND is_from_me = false AND message_id IN (${placeholders})`,
        params
      );
      messagesToMark = rows;
    } else {
      const { rows } = await pool.query(
        `SELECT id, message_id, remote_jid FROM whatsapp_messages 
         WHERE conversation_id = $1 AND is_from_me = false AND status <> 'read'`,
        [conversationId]
      );
      messagesToMark = rows;
    }

    // Update messages statuses to 'read' in database
    if (messagesToMark.length > 0) {
      const msgIds = messagesToMark.map(m => m.message_id);
      const placeholders = msgIds.map((_, i) => `$${i + 2}`).join(',');
      await pool.query(
        `UPDATE whatsapp_messages SET status = 'read' WHERE conversation_id = $1 AND message_id IN (${placeholders})`,
        [conversationId, ...msgIds]
      );
    }

    const marked = messagesToMark.map((r: any) => r.message_id);

    // Reset unread count on conversation
    await pool.query(`UPDATE whatsapp_conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`, [conversationId]);

    // Emit WebSocket event to update conversations list in real-time
    console.log('[mark-messages-read] Emitting WebSocket event for conversation:', conversationId);
    wsEmit.conversationUpdated(conversationId, { id: conversationId, unread_count: 0 });

    // Emit WebSocket event for each message status change
    for (const msg of messagesToMark) {
      wsEmit.messageStatusChanged(conversationId, msg.id, 'read');
    }
    console.log('[mark-messages-read] Emitted status events for', messagesToMark.length, 'messages');

    // Dispatch webhooks for message_read events (incoming_read: they sent, we/user read)
    for (const msg of messagesToMark) {
      webhookEvents.messageRead(msg.message_id, conversationId, 'incoming_read', 'user');
    }
    console.log('[mark-messages-read] Dispatched webhook events for', messagesToMark.length, 'messages');

    // Notify both Evolution API and fallback API (best-effort, don't fail if not reachable)
    
    // 1. Notify fallback API for each message (always, regardless of Evolution)
    console.log('[mark-messages-read] Notifying fallback API for', messagesToMark.length, 'messages');
    for (const msg of messagesToMark) {
      try {
        const fallbackUrl = `http://192.168.3.39:8088/messages/${msg.message_id}/read`;
        fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'accept': 'application/json' },
          signal: AbortSignal.timeout(3000),
        }).then(resp => {
          if (resp.ok) {
            console.log('[mark-messages-read] Fallback API notified for message:', msg.message_id);
          }
        }).catch(() => {});
      } catch (fallbackErr) {
        // Silent fail for fallback
      }
    }

    // 2. Notify Evolution API
    try {
      // Get instance secrets
      const { rows: secretRows } = await pool.query(
        'SELECT api_url, api_key FROM whatsapp_instance_secrets WHERE instance_id = $1 LIMIT 1',
        [conv.instance_id]
      );

      if (secretRows.length > 0 && messagesToMark.length > 0) {
        const secrets = secretRows[0];
        const providerType = conv.provider_type || 'self_hosted';
        const instanceIdentifier = conv.provider_type === 'cloud' && conv.instance_id_external
          ? conv.instance_id_external
          : conv.instance_name;

        const headers = getEvolutionAuthHeaders(secrets.api_key || secrets.apiKey, providerType as any);
        const resolvedApi = resolveDockerUrl(secrets.api_url || secrets.apiUrl);

        // Build remoteJid - Priority: contact.remote_jid (@lid) > senderPn > phone_number
        const contactMetadata = conv.contact_metadata || {};
        const senderPn = contactMetadata.sender_pn;
        let remoteJid: string;
        
        // Use contact's remote_jid field (stores @lid) if available
        if (conv.contact_remote_jid) {
          remoteJid = conv.contact_remote_jid;
        } else if (conv.phone_number.includes('@')) {
          remoteJid = conv.phone_number;
        } else if (senderPn) {
          remoteJid = `${senderPn}@s.whatsapp.net`;
        } else {
          remoteJid = `${conv.phone_number.replace(/\D/g, '')}@s.whatsapp.net`;
        }
        
        console.log('[mark-messages-read] Using remoteJid:', remoteJid);

        // Build readMessages array for Evolution API
        // Format: { remoteJid, fromMe: false, id: messageId }
        const readMessages = messagesToMark.map(msg => ({
          remoteJid: msg.remote_jid || remoteJid,
          fromMe: false,
          id: msg.message_id
        }));

        // Evolution API endpoint: /chat/markMessageAsRead/{instanceName}
        const target = `${resolvedApi}/chat/markMessageAsRead/${instanceIdentifier}`;
        const payload = { readMessages };

        console.log('[mark-messages-read] Calling Evolution API:', target, 'with', readMessages.length, 'messages');

        try {
          const resp = await fetch(target, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
          });

          if (resp.ok) {
            console.log('[mark-messages-read] Successfully notified Evolution at', target);
          } else {
            const txt = await resp.text().catch(() => '');
            console.warn('[mark-messages-read] Evolution endpoint returned non-OK:', target, resp.status, txt.substring ? txt.substring(0, 200) : txt);
          }
        } catch (err) {
          console.warn('[mark-messages-read] Evolution notify attempt failed:', err instanceof Error ? err.message : err);
        }
      }
    } catch (notifyErr) {
      console.warn('[mark-messages-read] Error attempting to notify Evolution:', notifyErr);
    }

    return res.json({ success: true, markedCount: marked.length, messageIds: marked });
  } catch (error) {
    console.error('[mark-messages-read] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Edit a WhatsApp message
 * POST /api/functions/edit-whatsapp-message
 * body: { messageId: string, conversationId: string, newContent: string }
 */
router.post('/edit-whatsapp-message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId, conversationId, newContent } = req.body;
    
    console.log('[edit-whatsapp-message] Request:', { messageId, conversationId, newContent: newContent?.substring(0, 50) });
    
    if (!messageId || !conversationId || !newContent) {
      return res.status(400).json({ 
        success: false, 
        error: 'messageId, conversationId, and newContent are required' 
      });
    }

    const userId = req.user!.userId;
    console.log('[edit-whatsapp-message] User ID:', userId);

    // Get user name for internal note
    const { rows: userRows } = await pool.query(
      `SELECT full_name FROM profiles WHERE id = $1`,
      [userId]
    );
    const userName = userRows[0]?.full_name || 'Usuário';
    console.log('[edit-whatsapp-message] User name:', userName);

    // Get the original message with conversation and instance info
    console.log('[edit-whatsapp-message] Looking up message...');
    const { rows: messageRows } = await pool.query(
      `SELECT m.id, m.content, m.message_id, m.is_from_me, m.remote_jid,
              c.instance_id,
              i.instance_name,
              s.api_url, s.api_key
       FROM whatsapp_messages m
       JOIN whatsapp_conversations c ON c.id = m.conversation_id
       JOIN whatsapp_instances i ON i.id = c.instance_id
       JOIN whatsapp_instance_secrets s ON s.instance_id = i.id
       WHERE (m.message_id = $1 OR m.id::text = $1) AND m.conversation_id = $2`,
      [messageId, conversationId]
    );
    console.log('[edit-whatsapp-message] Found messages:', messageRows.length);

    if (messageRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const message = messageRows[0];
    const originalContent = message.content;

    // Only allow editing own messages
    if (!message.is_from_me) {
      return res.status(403).json({ success: false, error: 'Cannot edit messages from contacts' });
    }

    // Call Evolution API to update message on WhatsApp
    let whatsappEditSuccess = false;
    try {
      const evolutionUrl = `${message.api_url}/chat/updateMessage/${message.instance_name}`;
      console.log('[edit-whatsapp-message] Calling Evolution API:', evolutionUrl);
      
      const evolutionPayload = {
        number: message.remote_jid,
        key: {
          remoteJid: message.remote_jid,
          fromMe: true,
          id: message.message_id
        },
        text: newContent
      };
      console.log('[edit-whatsapp-message] Payload:', JSON.stringify(evolutionPayload));
      
      const evolutionResponse = await fetch(evolutionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': message.api_key
        },
        body: JSON.stringify(evolutionPayload)
      });
      
      const evolutionResult = await evolutionResponse.text();
      console.log('[edit-whatsapp-message] Evolution response:', evolutionResponse.status, evolutionResult);
      
      if (evolutionResponse.ok) {
        whatsappEditSuccess = true;
      } else {
        console.warn('[edit-whatsapp-message] WhatsApp edit failed, updating locally only');
      }
    } catch (evolutionErr) {
      console.error('[edit-whatsapp-message] Evolution API error:', evolutionErr);
    }

    // Try to store edit history (table may not exist)
    try {
      await pool.query(
        `INSERT INTO whatsapp_message_edits (message_id, previous_content, new_content, edited_by, edited_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [messageId, originalContent, newContent, userId]
      );
    } catch (historyErr) {
      // Table may not exist, continue anyway
      console.warn('[edit-whatsapp-message] Could not save edit history:', historyErr);
    }

    // Update the message content locally
    await pool.query(
      `UPDATE whatsapp_messages 
       SET content = $1, 
           edited_at = NOW(),
           original_content = COALESCE(original_content, $2),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('edited', true, 'edited_at', NOW()::text, 'whatsapp_edit_success', ${whatsappEditSuccess})
       WHERE id = $3`,
      [newContent, originalContent, message.id]
    );

    // Create internal note about edit
    const whatsappStatus = whatsappEditSuccess ? '(editado no WhatsApp)' : '(apenas local)';
    const noteContent = `✏️ ${userName} editou uma mensagem ${whatsappStatus}\n\nAntes: "${originalContent?.substring(0, 150)}${(originalContent?.length || 0) > 150 ? '...' : ''}"\n\nDepois: "${newContent.substring(0, 150)}${newContent.length > 150 ? '...' : ''}"`;
    
    await pool.query(
      `INSERT INTO whatsapp_messages (
        conversation_id, content, message_type, is_from_me, is_internal, 
        sent_by, message_id, remote_jid, timestamp, status
       ) VALUES ($1, $2, 'text', true, true, $3, $4, $5, NOW(), 'sent')`,
      [
        conversationId, 
        noteContent, 
        userId, 
        `internal_edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        message.remote_jid
      ]
    );
    
    return res.json({ 
      success: true, 
      messageId,
      newContent,
      editedAt: new Date().toISOString(),
      whatsappEditSuccess
    });
  } catch (error: any) {
    console.error('[edit-whatsapp-message] Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

/**
 * Delete a WhatsApp message (soft delete)
 * POST /api/functions/delete-whatsapp-message
 * body: { messageId: string, conversationId: string, reason?: string }
 */
router.post('/delete-whatsapp-message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId, conversationId, reason } = req.body;
    
    if (!messageId || !conversationId) {
      return res.status(400).json({ 
        success: false, 
        error: 'messageId and conversationId are required' 
      });
    }

    // Get the original message
    const { rows: messageRows } = await pool.query(
      `SELECT id, content, message_id, is_from_me, message_type, remote_jid
       FROM whatsapp_messages
       WHERE message_id = $1 AND conversation_id = $2`,
      [messageId, conversationId]
    );

    if (messageRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const message = messageRows[0];
    const userId = req.user!.userId;
    
    // Get user name for internal note
    const { rows: userRows } = await pool.query(
      `SELECT full_name FROM profiles WHERE id = $1`,
      [userId]
    );
    const userName = userRows[0]?.full_name || 'Usuário';

    // Soft delete the message
    await pool.query(
      `UPDATE whatsapp_messages 
       SET deleted = true, 
           deleted_at = NOW(),
           deleted_by = $1
       WHERE id = $2`,
      [userId, message.id]
    );

    // Create internal note about deletion
    const noteContent = `🗑️ ${userName} excluiu uma mensagem${reason ? `: "${reason}"` : ''}\n\nConteúdo original: "${message.content?.substring(0, 200)}${(message.content?.length || 0) > 200 ? '...' : ''}"`;
    
    await pool.query(
      `INSERT INTO whatsapp_messages (
        conversation_id, content, message_type, is_from_me, is_internal, 
        sent_by, message_id, remote_jid, timestamp, status
       ) VALUES ($1, $2, 'text', true, true, $3, $4, $5, NOW(), 'sent')`,
      [
        conversationId, 
        noteContent, 
        userId, 
        `internal_delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        message.remote_jid
      ]
    );

    return res.json({ 
      success: true, 
      messageId,
      deletedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[delete-whatsapp-message] Error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * Analyze WhatsApp Sentiment using Groq AI
 * POST /api/functions/analyze-whatsapp-sentiment
 * body: { conversationId: string }
 */
router.post('/analyze-whatsapp-sentiment', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Get conversation with contact info
    const { rows: convRows } = await pool.query(
      `SELECT c.id, c.contact_id, ct.name as contact_name
       FROM whatsapp_conversations c
       JOIN whatsapp_contacts ct ON ct.id = c.contact_id
       WHERE c.id = $1 LIMIT 1`,
      [conversationId]
    );

    if (convRows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conv = convRows[0];

    // Get last 15 messages from contact (not from me)
    const { rows: messages } = await pool.query(
      `SELECT content, timestamp FROM whatsapp_messages
       WHERE conversation_id = $1 AND is_from_me = false AND content IS NOT NULL AND content != ''
       ORDER BY timestamp DESC LIMIT 15`,
      [conversationId]
    );

    if (messages.length < 2) {
      return res.json({
        success: false,
        message: 'Mínimo 2 mensagens necessárias para análise',
        messagesFound: messages.length,
      });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured (GROQ_API_KEY)' });
    }

    const prompt = `Analise o sentimento das seguintes mensagens de um cliente e retorne APENAS um JSON válido com:
- sentiment: "positive", "neutral" ou "negative"
- confidence_score: número de 0 a 1
- summary: resumo breve de 1-2 frases sobre o tom geral

Mensagens do cliente (mais recente primeiro):
${messages.map((m, i) => `${i + 1}. ${m.content}`).join('\n')}

Responda SOMENTE com o JSON, sem explicações adicionais.`;

    const aiResponse = await fetch(groqEndpoint(), {
      method: 'POST',
      headers: buildGroqHeaders(),
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      console.error('[analyze-sentiment] Groq API error:', aiResponse.status);
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0]?.message?.content || '';
    const analysis = parseJsonFromAI(analysisText);
    if (!analysis) {
      console.error('[analyze-sentiment] Failed to parse AI response:', analysisText.substring(0, 300));
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Save/update sentiment analysis
    await pool.query(
      `INSERT INTO whatsapp_sentiment_analysis (conversation_id, contact_id, sentiment, confidence_score, summary, messages_analyzed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         sentiment = EXCLUDED.sentiment,
         confidence_score = EXCLUDED.confidence_score,
         summary = EXCLUDED.summary,
         messages_analyzed = EXCLUDED.messages_analyzed`,
      [conversationId, conv.contact_id, analysis.sentiment, analysis.confidence_score || 0.8, analysis.summary || '', messages.length]
    );

    res.json({ 
      success: true, 
      sentiment: analysis.sentiment,
      confidence_score: analysis.confidence_score,
      summary: analysis.summary,
      messages_analyzed: messages.length 
    });
  } catch (error) {
    console.error('[analyze-whatsapp-sentiment] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Generate Conversation Summary using Groq AI
 * POST /api/functions/generate-conversation-summary
 * body: { conversationId: string }
 */
router.post('/generate-conversation-summary', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Get conversation details
    const { rows: convRows } = await pool.query(
      `SELECT c.id, c.contact_id, ct.name as contact_name
       FROM whatsapp_conversations c
       JOIN whatsapp_contacts ct ON ct.id = c.contact_id
       WHERE c.id = $1 LIMIT 1`,
      [conversationId]
    );

    if (convRows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conv = convRows[0];

    // Get messages from the conversation
    const { rows: messages } = await pool.query(
      `SELECT content, is_from_me, timestamp FROM whatsapp_messages
       WHERE conversation_id = $1 AND content IS NOT NULL AND content != ''
       ORDER BY timestamp ASC LIMIT 50`,
      [conversationId]
    );

    if (messages.length < 3) {
      return res.json({
        success: false,
        message: 'Mínimo 3 mensagens necessárias para gerar resumo',
        messagesFound: messages.length,
      });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured (GROQ_API_KEY)' });
    }

    const prompt = `Analise a conversa abaixo entre um atendente (Agente) e um cliente (${conv.contact_name || 'Cliente'}).
Retorne APENAS um JSON válido com:
- summary: resumo conciso da conversa (2-4 frases)
- key_points: array de até 5 pontos principais discutidos
- action_items: array de até 3 próximos passos ou pendências identificadas
- sentiment: sentimento geral do cliente ("positive", "neutral" ou "negative")

Conversa:
${messages.map(m => `${m.is_from_me ? 'Agente' : 'Cliente'}: ${m.content}`).join('\n')}

Responda SOMENTE com o JSON, sem explicações adicionais.`;

    const aiResponse = await fetch(groqEndpoint(), {
      method: 'POST',
      headers: buildGroqHeaders(),
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      console.error('[generate-summary] Groq API error:', aiResponse.status);
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const summaryText = aiData.choices[0]?.message?.content || '';
    const summaryData = parseJsonFromAI(summaryText);
    if (!summaryData) {
      console.error('[generate-summary] Failed to parse AI response:', summaryText.substring(0, 300));
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Get message time range
    const periodStart = messages[0]?.timestamp;
    const periodEnd = messages[messages.length - 1]?.timestamp;

    // Save summary
    const { rows: insertedRows } = await pool.query(
      `INSERT INTO whatsapp_conversation_summaries 
       (conversation_id, summary, key_points, action_items, sentiment_at_time, messages_count, period_start, period_end, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id`,
      [
        conversationId, 
        summaryData.summary || '', 
        JSON.stringify(summaryData.key_points || []), 
        JSON.stringify(summaryData.action_items || []),
        summaryData.sentiment || 'neutral',
        messages.length,
        periodStart,
        periodEnd
      ]
    );

    res.json({ 
      success: true, 
      id: insertedRows[0]?.id,
      summary: summaryData.summary,
      key_points: summaryData.key_points,
      action_items: summaryData.action_items,
      sentiment_at_time: summaryData.sentiment,
      messages_count: messages.length
    });
  } catch (error) {
    console.error('[generate-conversation-summary] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Categorize WhatsApp Conversation using Groq AI
 * POST /api/functions/categorize-whatsapp-conversation
 * body: { conversationId: string }
 */
router.post('/categorize-whatsapp-conversation', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Get conversation messages
    const { rows: messages } = await pool.query(
      `SELECT content, is_from_me FROM whatsapp_messages
       WHERE conversation_id = $1 AND content IS NOT NULL AND content != ''
       ORDER BY timestamp DESC LIMIT 20`,
      [conversationId]
    );

    if (messages.length < 2) {
      return res.json({
        success: false,
        message: 'Mínimo 2 mensagens necessárias para categorizar',
        messagesFound: messages.length,
      });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured (GROQ_API_KEY)' });
    }

    // Available topics
    const availableTopics = [
      'suporte_tecnico', 'vendas', 'financeiro', 'reclamacao', 'duvida_produto',
      'agendamento', 'cancelamento', 'elogio', 'parceria', 'orcamento',
      'pos_venda', 'entrega', 'troca_devolucao', 'garantia', 'outro'
    ];

    const prompt = `Analise a conversa e identifique os tópicos principais.
Escolha de 1 a 3 tópicos da lista: ${availableTopics.join(', ')}

Retorne APENAS um JSON válido com:
- topics: array com os tópicos identificados (máximo 3)
- confidence: número de 0 a 1
- reasoning: explicação breve (1 frase)

Conversa (mais recente primeiro):
${messages.map((m, i) => `${m.is_from_me ? 'Agente' : 'Cliente'}: ${m.content}`).join('\n')}

Responda SOMENTE com o JSON.`;

    const aiResponse = await fetch(groqEndpoint(), {
      method: 'POST',
      headers: buildGroqHeaders(),
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      console.error('[categorize] Groq API error:', aiResponse.status);
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const catText = aiData.choices[0]?.message?.content || '';
    const catData = parseJsonFromAI(catText);
    if (!catData) {
      console.error('[categorize] Failed to parse AI response:', catText.substring(0, 300));
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Filter only valid topics
    const validTopics = (catData.topics || []).filter((t: string) => availableTopics.includes(t)).slice(0, 3);

    // Update conversation with topics
    await pool.query(
      `UPDATE whatsapp_conversations SET 
         topics = $2,
         ai_confidence = $3,
         ai_reasoning = $4,
         categorized_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [conversationId, JSON.stringify(validTopics), catData.confidence || 0.8, catData.reasoning || '']
    );

    res.json({ 
      success: true, 
      topics: validTopics,
      confidence: catData.confidence,
      reasoning: catData.reasoning
    });
  } catch (error) {
    console.error('[categorize-whatsapp-conversation] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Import all conversations from Evolution API via PostgreSQL
 * POST /api/functions/import-instance-conversations
 * body: { instanceId: string }
 * 
 * This endpoint connects directly to Evolution API's PostgreSQL database
 * and imports chats, contacts, and messages into the livechat database.
 */
router.post('/import-instance-conversations', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;

    if (!instanceId) {
      return res.status(400).json({ error: 'instanceId is required' });
    }

    if (!evolutionPool) {
      return res.status(500).json({ 
        error: 'EVOLUTION_DATA_URL not configured. Please set this environment variable to connect to Evolution API database.' 
      });
    }

    console.log('[import-conversations] Starting PostgreSQL import for instance:', instanceId);

    // Get instance details from our database
    const { rows: instanceRows } = await pool.query(
      'SELECT * FROM whatsapp_instances WHERE id = $1',
      [instanceId]
    );

    if (instanceRows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const instance = instanceRows[0];
    const instanceName = instance.instance_name;

    // Get instance secrets for media download
    const { rows: secretsRows } = await pool.query(
      'SELECT * FROM whatsapp_instance_secrets WHERE instance_id = $1',
      [instanceId]
    );
    const secrets = secretsRows[0];
    const headers = secrets ? getEvolutionAuthHeaders(secrets.api_key, instance.provider_type) : {};
    const apiUrl = secrets ? resolveDockerUrl(secrets.api_url) : '';

    // Stats for response
    const stats = {
      evolutionInstanceId: '',
      chatsFound: 0,
      contactsCreated: 0,
      contactsUpdated: 0,
      conversationsCreated: 0,
      conversationsUpdated: 0,
      messagesImported: 0,
      mediaDownloaded: 0,
      errors: [] as string[],
    };

    // 1. Find Evolution instance by name
    console.log('[import-conversations] Finding Evolution instance by name:', instanceName);
    const { rows: evolutionInstances } = await evolutionPool.query(
      'SELECT id, name, "ownerJid", "profilePicUrl", number FROM "Instance" WHERE name = $1',
      [instanceName]
    );

    if (evolutionInstances.length === 0) {
      return res.status(404).json({ 
        error: `Evolution instance "${instanceName}" not found in Evolution API database` 
      });
    }

    const evolutionInstance = evolutionInstances[0];
    const evolutionInstanceId = evolutionInstance.id;
    stats.evolutionInstanceId = evolutionInstanceId;

    console.log(`[import-conversations] Found Evolution instance: ${evolutionInstanceId}`);

    // Get default sector for the instance
    const { rows: sectorRows } = await pool.query(
      'SELECT id FROM sectors WHERE instance_id = $1 AND is_default = true LIMIT 1',
      [instanceId]
    );
    const defaultSectorId = sectorRows[0]?.id || null;

    // 2. Fetch all chats from Evolution database
    console.log('[import-conversations] Fetching chats from Evolution PostgreSQL...');
    const { rows: chats } = await evolutionPool.query(
      `SELECT c.*, 
              (SELECT "profilePicUrl" FROM "Contact" WHERE "instanceId" = c."instanceId" AND "remoteJid" = c."remoteJid" LIMIT 1) as "profilePicUrl"
       FROM "Chat" c
       WHERE c."instanceId" = $1`,
      [evolutionInstanceId]
    );
    stats.chatsFound = chats.length;

    console.log(`[import-conversations] Found ${chats.length} chats in Evolution database`);

    // 3. Process each chat
    for (const chat of chats) {
      try {
        const remoteJid = chat.remoteJid || '';

        // Skip groups, broadcasts, and system chats
        if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast') || 
            remoteJid === '0@s.whatsapp.net' || remoteJid === 'status@broadcast') {
          console.log(`[import-conversations] Skipping: ${remoteJid}`);
          continue;
        }

        if (!remoteJid) {
          continue;
        }

        // Extract phone number from remoteJid
        const isLidFormat = remoteJid.includes('@lid');
        const phoneNumber = remoteJid.replace(/@.*$/, '');

        if (!phoneNumber) {
          continue;
        }

        console.log(`[import-conversations] Processing: phone=${phoneNumber}, remoteJid=${remoteJid}`);

        // Get contact info from Evolution Contact table
        const { rows: evolutionContacts } = await evolutionPool.query(
          'SELECT "pushName", "profilePicUrl" FROM "Contact" WHERE "instanceId" = $1 AND "remoteJid" = $2 LIMIT 1',
          [evolutionInstanceId, remoteJid]
        );
        
        const evolutionContact = evolutionContacts[0];
        let pushName = evolutionContact?.pushName || chat.name || phoneNumber;
        const profilePicUrl = evolutionContact?.profilePicUrl || chat.profilePicUrl || null;

        // Try to get a better name from incoming messages if pushName is just the phone
        if (pushName === phoneNumber || !pushName) {
          const { rows: nameMessages } = await evolutionPool.query(
            `SELECT "pushName" FROM "Message" 
             WHERE "instanceId" = $1 
               AND "key"->>'remoteJid' = $2 
               AND ("key"->>'fromMe')::boolean = false
               AND "pushName" IS NOT NULL 
               AND "pushName" != ''
               AND LOWER("pushName") NOT IN ('você', 'voce', 'you')
             LIMIT 1`,
            [evolutionInstanceId, remoteJid]
          );
          if (nameMessages[0]?.pushName) {
            pushName = nameMessages[0].pushName;
          }
        }

        // 3a. Create or update contact
        const { rows: existingContacts } = await pool.query(
          'SELECT id FROM whatsapp_contacts WHERE instance_id = $1 AND (remote_jid = $2 OR phone_number = $3)',
          [instanceId, remoteJid, phoneNumber]
        );

        let contactId: string;
        const metadata = {
          evolution_chat_id: chat.id,
          is_lid_format: isLidFormat,
        };

        if (existingContacts.length > 0) {
          contactId = existingContacts[0].id;
          await pool.query(
            `UPDATE whatsapp_contacts SET 
              name = COALESCE(NULLIF($1, phone_number), name, $1), 
              profile_picture_url = COALESCE($2, profile_picture_url),
              remote_jid = COALESCE($3, remote_jid),
              metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
              updated_at = NOW() 
             WHERE id = $5`,
            [pushName, profilePicUrl, remoteJid, JSON.stringify(metadata), contactId]
          );
          stats.contactsUpdated++;
        } else {
          const { rows: newContact } = await pool.query(
            `INSERT INTO whatsapp_contacts (instance_id, phone_number, remote_jid, name, profile_picture_url, is_group, metadata, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, false, $6::jsonb, NOW(), NOW()) 
             ON CONFLICT (instance_id, phone_number) DO UPDATE SET
               name = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
               profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, whatsapp_contacts.profile_picture_url),
               remote_jid = COALESCE(EXCLUDED.remote_jid, whatsapp_contacts.remote_jid),
               updated_at = NOW()
             RETURNING id`,
            [instanceId, phoneNumber, remoteJid, pushName, profilePicUrl, JSON.stringify(metadata)]
          );
          contactId = newContact[0].id;
          stats.contactsCreated++;
        }

        // 3b. Create or update conversation
        const { rows: existingConvs } = await pool.query(
          'SELECT id FROM whatsapp_conversations WHERE instance_id = $1 AND contact_id = $2',
          [instanceId, contactId]
        );

        let conversationId: string;
        const unreadCount = chat.unreadMessages || 0;

        if (existingConvs.length > 0) {
          conversationId = existingConvs[0].id;
          await pool.query(
            `UPDATE whatsapp_conversations SET 
              unread_count = $1,
              updated_at = NOW()
             WHERE id = $2`,
            [unreadCount, conversationId]
          );
          stats.conversationsUpdated++;
        } else {
          const { rows: newConv } = await pool.query(
            `INSERT INTO whatsapp_conversations (instance_id, contact_id, sector_id, status, unread_count, created_at, updated_at)
             VALUES ($1, $2, $3, 'active', $4, NOW(), NOW()) RETURNING id`,
            [instanceId, contactId, defaultSectorId, unreadCount]
          );
          conversationId = newConv[0].id;
          stats.conversationsCreated++;
        }

        // 3c. Fetch messages for this chat from Evolution database
        console.log(`[import-conversations] Fetching messages for ${phoneNumber}...`);
        const { rows: messages } = await evolutionPool.query(
          `SELECT id, "key", "pushName", "messageType", message, "contextInfo", "messageTimestamp", status
           FROM "Message" 
           WHERE "instanceId" = $1 AND "key"->>'remoteJid' = $2
           ORDER BY "messageTimestamp" DESC
           LIMIT 500`,
          [evolutionInstanceId, remoteJid]
        );

        console.log(`[import-conversations] Found ${messages.length} messages for ${phoneNumber}`);

        // Track best name found
        let foundContactName: string | null = null;

        // 3d. Import each message
        for (const msg of messages) {
          try {
            const msgKey = msg.key || {};
            const messageId = msgKey.id || msg.id || `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const isFromMe = msgKey.fromMe === true || msgKey.fromMe === 'true';
            const timestamp = msg.messageTimestamp 
              ? new Date(parseInt(msg.messageTimestamp) * 1000)
              : new Date();

            // Track contact name from incoming messages
            if (!isFromMe && msg.pushName && 
                msg.pushName.toLowerCase() !== 'você' && 
                msg.pushName.toLowerCase() !== 'voce' &&
                msg.pushName.toLowerCase() !== 'you' &&
                !foundContactName) {
              foundContactName = msg.pushName;
            }

            // Extract content and type from message JSON
            const message = msg.message || {};
            let content = '';
            let messageType = 'text';
            let mediaUrl: string | null = null;
            let mediaMimetype: string | null = null;
            let fileName: string | null = null;

            if (message.conversation) {
              content = message.conversation;
            } else if (message.extendedTextMessage?.text) {
              content = message.extendedTextMessage.text;
            } else if (message.imageMessage) {
              content = message.imageMessage.caption || '[Imagem]';
              messageType = 'image';
              mediaMimetype = message.imageMessage.mimetype || 'image/jpeg';
              mediaUrl = message.imageMessage.url;
            } else if (message.videoMessage) {
              content = message.videoMessage.caption || '[Vídeo]';
              messageType = 'video';
              mediaMimetype = message.videoMessage.mimetype || 'video/mp4';
              mediaUrl = message.videoMessage.url;
            } else if (message.audioMessage) {
              content = '[Áudio]';
              messageType = 'audio';
              mediaMimetype = message.audioMessage.mimetype || 'audio/ogg';
              mediaUrl = message.audioMessage.url;
            } else if (message.documentMessage) {
              content = message.documentMessage.fileName || '[Documento]';
              messageType = 'document';
              mediaMimetype = message.documentMessage.mimetype || 'application/octet-stream';
              fileName = message.documentMessage.fileName;
              mediaUrl = message.documentMessage.url;
            } else if (message.stickerMessage) {
              content = '[Sticker]';
              messageType = 'sticker';
              mediaMimetype = message.stickerMessage.mimetype || 'image/webp';
              mediaUrl = message.stickerMessage.url;
            } else if (message.locationMessage) {
              content = `[Localização: ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}]`;
              messageType = 'location';
            } else if (message.contactMessage) {
              content = `[Contato: ${message.contactMessage.displayName || 'Unknown'}]`;
              messageType = 'contact';
            } else if (message.reactionMessage) {
              content = `[Reação: ${message.reactionMessage.text || '❤'}]`;
              messageType = 'reaction';
            } else {
              // Try to extract text from any other message type
              const msgType = msg.messageType || 'unknown';
              content = `[${msgType}]`;
            }

            // Download media if URL available and we have API credentials
            if (mediaUrl && apiUrl && !mediaUrl.startsWith('whatsapp-media/')) {
              try {
                const instanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external
                  ? instance.instance_id_external
                  : instance.instance_name;

                const mediaResponse = await fetch(
                  `${apiUrl}/chat/getBase64FromMediaMessage/${instanceIdentifier}`,
                  {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      message: { key: msgKey },
                      convertToMp4: false,
                    }),
                  }
                );

                if (mediaResponse.ok) {
                  const mediaData = await mediaResponse.json();
                  if (mediaData.base64) {
                    const base64Data = mediaData.base64.includes(',')
                      ? mediaData.base64.split(',')[1]
                      : mediaData.base64;

                    const buffer = Buffer.from(base64Data, 'base64');
                    
                    const mimeToExt: Record<string, string> = {
                      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
                      'video/mp4': 'mp4', 'video/3gpp': '3gp',
                      'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
                      'application/pdf': 'pdf',
                    };
                    const ext = (mediaMimetype && mimeToExt[mediaMimetype]) || mediaMimetype?.split('/')[1] || 'bin';
                    const safeName = (fileName || `${messageId}`).replace(/[\\\/]/g, '_');
                    const s3Key = `whatsapp-media/${instance.instance_name}/${safeName}.${ext}`;

                    try {
                      await uploadFile(s3Key, buffer, mediaMimetype || 'application/octet-stream');
                      mediaUrl = s3Key;
                      stats.mediaDownloaded++;
                    } catch (uploadErr) {
                      console.warn('[import-conversations] S3 upload failed:', uploadErr);
                    }
                  }
                }
              } catch (mediaErr) {
                // Media download failed, keep original URL
              }
            }

            // Check if message already exists
            const { rows: existingMsgs } = await pool.query(
              'SELECT id FROM whatsapp_messages WHERE message_id = $1',
              [messageId]
            );

            if (existingMsgs.length === 0) {
              await pool.query(
                `INSERT INTO whatsapp_messages 
                 (conversation_id, remote_jid, message_id, content, message_type, media_url, media_mimetype, is_from_me, status, timestamp, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'received', $9, NOW())`,
                [conversationId, remoteJid, messageId, content, messageType, mediaUrl, mediaMimetype, isFromMe, timestamp]
              );
              stats.messagesImported++;
            }
          } catch (msgErr) {
            console.warn('[import-conversations] Error importing message:', msgErr);
          }
        }

        // Update contact name if we found a better one
        if (foundContactName && foundContactName !== phoneNumber) {
          await pool.query(
            `UPDATE whatsapp_contacts SET name = $1, updated_at = NOW() WHERE id = $2 AND (name = phone_number OR name LIKE '%@%' OR name = $3)`,
            [foundContactName, contactId, phoneNumber]
          );
        }

        // Update conversation's last message info
        const { rows: lastMsg } = await pool.query(
          `SELECT content, timestamp FROM whatsapp_messages 
           WHERE conversation_id = $1 
           ORDER BY timestamp DESC LIMIT 1`,
          [conversationId]
        );
        if (lastMsg[0]) {
          await pool.query(
            `UPDATE whatsapp_conversations SET 
              last_message_at = $1,
              last_message_preview = $2,
              updated_at = NOW()
             WHERE id = $3`,
            [lastMsg[0].timestamp, (lastMsg[0].content || '').substring(0, 100), conversationId]
          );
        }

      } catch (chatErr) {
        console.error('[import-conversations] Error processing chat:', chatErr);
        stats.errors.push(`Error processing chat: ${chatErr instanceof Error ? chatErr.message : 'Unknown'}`);
      }
    }

    console.log('[import-conversations] PostgreSQL import completed:', stats);

    return res.json({
      success: true,
      message: 'Import completed via PostgreSQL',
      stats,
    });

  } catch (error) {
    console.error('[import-instance-conversations] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});
