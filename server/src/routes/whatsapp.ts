import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { db } from '../db';
import { 
  whatsappInstances, 
  whatsappInstanceSecrets,
  whatsappContacts,
  whatsappConversations,
  whatsappConversationNotes, 
  whatsappMessages,
  whatsappSentimentAnalysis,
  whatsappSentimentHistory,
  whatsappConversationSummaries,
  whatsappMacros,
  whatsappReactions
} from '../db/schema/index';
import { authenticate } from '../middleware/auth';
import { eq, and, desc, sql } from 'drizzle-orm';
import { uploadFile } from '../utils/fileUpload';
import { wsEmit } from '../lib/websocket';
import { webhookEvents } from '../lib/webhookDispatcher';
import crypto from 'crypto';

const router = Router();

// Database pool for webhook dispatch
const webhookPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'livechat',
});

webhookPool.on('error', (err) => {
  console.error('[webhook-pool] Unexpected error on idle client', err);
});

/**
 * Dispatch webhook event from server-side
 * This is called when events happen server-side (e.g., new message received)
 */
async function dispatchServerWebhook(event: string, data: any): Promise<void> {
  try {
    console.log(`[dispatchServerWebhook] Dispatching event: ${event}`);
    
    // Query active webhooks that subscribe to this event
    const webhooksResult = await webhookPool.query(
      `SELECT id, name, url, secret, headers, retry_count, retry_delay 
       FROM webhooks 
       WHERE is_active = true 
       AND (events IS NULL OR $1 = ANY(events))`,
      [event]
    );
    
    const webhooks = webhooksResult.rows;
    
    if (webhooks.length === 0) {
      console.log(`[dispatchServerWebhook] No webhooks subscribed to ${event}`);
      return;
    }
    
    console.log(`[dispatchServerWebhook] Found ${webhooks.length} webhooks for event: ${event}`);
    
    // Prepare payload
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data: data || {}
    };
    const payloadString = JSON.stringify(payload);
    
    // Dispatch to each webhook (fire-and-forget)
    for (const webhook of webhooks) {
      (async () => {
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
              console.warn(`[dispatchServerWebhook] Invalid custom headers for webhook ${webhook.id}`);
            }
          }
          
          // Send webhook with retry logic
          const maxRetries = webhook.retry_count || 3;
          const retryDelay = webhook.retry_delay || 1000;
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`[dispatchServerWebhook] Sending to ${webhook.url} (attempt ${attempt}/${maxRetries})`);
              
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 30000);
              
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
                console.log(`[dispatchServerWebhook] Successfully sent to ${webhook.name} (${webhook.url})`);
                break;
              } else {
                errorMessage = `HTTP ${statusCode}: ${responseBody?.substring(0, 200)}`;
                console.warn(`[dispatchServerWebhook] Failed attempt ${attempt} for ${webhook.name}: ${errorMessage}`);
              }
            } catch (fetchError: any) {
              errorMessage = fetchError.message || 'Network error';
              console.warn(`[dispatchServerWebhook] Network error attempt ${attempt} for ${webhook.name}: ${errorMessage}`);
            }
            
            // Wait before retry
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
            }
          }
        } catch (error: any) {
          errorMessage = error.message || 'Unknown error';
          console.error(`[dispatchServerWebhook] Error dispatching to ${webhook.name}:`, error);
        }
        
        const duration = Date.now() - startTime;
        
        // Log the webhook dispatch
        try {
          await webhookPool.query(
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
          console.error(`[dispatchServerWebhook] Failed to log webhook dispatch:`, logError);
        }
      })();
    }
  } catch (error) {
    console.error('[dispatchServerWebhook] Error:', error);
  }
}

// Evolution API Database pool (for fetching group info)
const evolutionPool = process.env.EVOLUTION_DATA_URL 
  ? new Pool({ connectionString: process.env.EVOLUTION_DATA_URL })
  : null;

if (evolutionPool) {
  evolutionPool.on('error', (err) => {
    console.error('[evolution-db-whatsapp] Unexpected error on idle client', err);
  });
}

// Helper to get group name and profile from Evolution API
async function getGroupInfoFromEvolution(remoteJid: string, instanceId?: number): Promise<{ name: string | null; profilePicUrl: string | null }> {
  // First try Evolution Database if available
  if (evolutionPool) {
    try {
      const { rows: chatRows } = await evolutionPool.query(
        'SELECT name FROM "Chat" WHERE "remoteJid" = $1 LIMIT 1',
        [remoteJid]
      );
      const { rows: contactRows } = await evolutionPool.query(
        'SELECT "profilePicUrl" FROM "Contact" WHERE "remoteJid" = $1 LIMIT 1',
        [remoteJid]
      );
      
      if (chatRows[0]?.name) {
        return { name: chatRows[0].name, profilePicUrl: contactRows[0]?.profilePicUrl || null };
      }
    } catch (err) {
      console.log('[getGroupInfoFromEvolution] DB fallback, trying API...');
    }
  }
  
  // Fallback: Use Evolution API to fetch group info
  if (instanceId) {
    try {
      const [instance] = await db
        .select()
        .from(whatsappInstances)
        .where(eq(whatsappInstances.id, instanceId))
        .limit(1);
      
      const [secrets] = await db
        .select()
        .from(whatsappInstanceSecrets)
        .where(eq(whatsappInstanceSecrets.instanceId, instanceId))
        .limit(1);
      
      if (instance && secrets) {
        const authHeader = secrets.providerType === 'cloud' 
          ? { 'Authorization': `Bearer ${secrets.apiKey}` }
          : { 'apikey': secrets.apiKey };
        
        const cleanAuthHeader = Object.fromEntries(
          Object.entries(authHeader).filter(([_, v]) => v !== undefined)
        ) as Record<string, string>;
        
        // Fetch group metadata from Evolution API
        const groupResponse = await fetch(
          `${secrets.apiUrl}/group/fetchAllGroups/${instance.instanceName}?getParticipants=false`,
          {
            method: 'GET',
            headers: cleanAuthHeader,
          }
        );
        
        if (groupResponse.ok) {
          const groups = await groupResponse.json();
          const groupJid = remoteJid.replace('@g.us', '');
          const group = groups.find((g: any) => g.id === remoteJid || g.id?.includes(groupJid));
          
          if (group) {
            console.log(`[getGroupInfoFromEvolution] Found group via API: ${group.subject}`);
            return { name: group.subject || null, profilePicUrl: group.pictureUrl || null };
          }
        }
      }
    } catch (err) {
      console.error('[getGroupInfoFromEvolution] API Error:', err);
    }
  }
  
  return { name: null, profilePicUrl: null };
}

// Sync all groups for an instance - updates names and profile pictures
router.post('/instances/:instanceId/sync-groups', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;
    
    const [instance] = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.id, Number(instanceId)))
      .limit(1);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const [secrets] = await db
      .select()
      .from(whatsappInstanceSecrets)
      .where(eq(whatsappInstanceSecrets.instanceId, instance.id))
      .limit(1);
    
    if (!secrets) {
      return res.status(404).json({ error: 'Instance secrets not found' });
    }
    
    const authHeader = secrets.providerType === 'cloud' 
      ? { 'Authorization': `Bearer ${secrets.apiKey}` }
      : { 'apikey': secrets.apiKey };
    
    const cleanAuthHeader = Object.fromEntries(
      Object.entries(authHeader).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>;
    
    // Fetch all groups from Evolution API
    const groupResponse = await fetch(
      `${secrets.apiUrl}/group/fetchAllGroups/${instance.instanceName}?getParticipants=false`,
      {
        method: 'GET',
        headers: cleanAuthHeader,
      }
    );
    
    if (!groupResponse.ok) {
      const errorText = await groupResponse.text();
      console.error('[sync-groups] Evolution API error:', errorText);
      return res.status(500).json({ error: 'Failed to fetch groups from Evolution API' });
    }
    
    const groups = await groupResponse.json();
    console.log(`[sync-groups] Found ${groups.length} groups`);
    
    let updated = 0;
    let created = 0;
    
    for (const group of groups) {
      const fullGroupJid = group.id; // e.g., "554192319253-1539103087@g.us"
      const groupName = group.subject;
      const groupPic = group.pictureUrl || null;
      
      if (!fullGroupJid || !fullGroupJid.includes('@g.us')) continue;
      
      // Extract just the group ID (after hyphen, before @g.us)
      const jidWithoutSuffix = fullGroupJid.replace(/@.*$/, ''); // "554192319253-1539103087"
      const groupOnlyId = jidWithoutSuffix.includes('-') 
        ? jidWithoutSuffix.split('-').pop() || jidWithoutSuffix
        : jidWithoutSuffix;
      const cleanGroupJid = `${groupOnlyId}@g.us`;
      
      // Check if we have this group as a contact (check both old and new format)
      const existingResult = await db.execute(sql`
        SELECT * FROM whatsapp_contacts
        WHERE instance_id = ${instance.id}
          AND (remote_jid = ${cleanGroupJid} OR remote_jid = ${fullGroupJid} OR phone_number = ${groupOnlyId} OR phone_number = ${jidWithoutSuffix})
        LIMIT 1
      `);
      const existingContact = existingResult.rows?.[0] || existingResult[0];
      
      if (existingContact) {
        // Update existing contact with real group name/pic and fix remote_jid format
        await db.execute(sql`
          UPDATE whatsapp_contacts
          SET name = COALESCE(${groupName}, name),
              profile_picture_url = COALESCE(${groupPic}, profile_picture_url),
              remote_jid = ${cleanGroupJid},
              phone_number = ${groupOnlyId},
              is_group = true,
              updated_at = NOW()
          WHERE id = ${existingContact.id}
        `);
        updated++;
      } else {
        // Create new group contact
        await db.execute(sql`
          INSERT INTO whatsapp_contacts (instance_id, phone_number, remote_jid, name, profile_picture_url, is_group, metadata, created_at, updated_at)
          VALUES (${instance.id}, ${groupOnlyId}, ${cleanGroupJid}, ${groupName}, ${groupPic}, true, ${JSON.stringify({ full_jid: fullGroupJid })}::jsonb, NOW(), NOW())
        `);
        created++;
      }
    }
    
    console.log(`[sync-groups] Synced ${groups.length} groups: ${updated} updated, ${created} created`);
    
    res.json({ 
      success: true, 
      total: groups.length,
      updated,
      created
    });
  } catch (error) {
    console.error('[sync-groups] Error:', error);
    res.status(500).json({ error: 'Failed to sync groups' });
  }
});

// Send WhatsApp message
router.post('/messages/send', authenticate, async (req: Request, res: Response) => {
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
      templateContext
    } = req.body;

    if (!conversationId || !messageType) {
      return res.status(400).json({ error: 'conversationId and messageType are required' });
    }

    // Get conversation and instance details
    const conversationResult = await db.execute(sql`
      SELECT 
        c.*,
        ct.phone_number as contact_phone,
        ct.name as contact_name,
        ct.metadata as contact_metadata,
        ct.remote_jid as contact_remote_jid,
        ct.is_group as contact_is_group
      FROM whatsapp_conversations c
      JOIN whatsapp_contacts ct ON ct.id = c.contact_id
      WHERE c.id = ${conversationId}
      LIMIT 1
    `);
    
    const conversation = conversationResult.rows?.[0] || conversationResult[0];

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Get destination number - Priority: Group remote_jid > senderPn from metadata > phone_number
    const contactMetadata = conversation.contact_metadata || {};
    const senderPn = contactMetadata.sender_pn;
    const isGroup = conversation.contact_is_group;
    const contactRemoteJid = conversation.contact_remote_jid;
    
    let destNumber: string;
    
    // For groups, use the full_jid from metadata (has phone-groupid format) or fallback to remote_jid
    if (isGroup && contactRemoteJid && contactRemoteJid.includes('@g.us')) {
      // Prefer full_jid from metadata if available (for Evolution API compatibility)
      const fullJid = contactMetadata.full_jid;
      destNumber = fullJid || contactRemoteJid;
      console.log('[whatsapp/messages/send] Group message, using:', destNumber);
    } else if (senderPn) {
      destNumber = senderPn.replace(/\D/g, '');
    } else if (conversation.contact_phone.includes('@lid')) {
      destNumber = conversation.contact_phone;
    } else {
      destNumber = conversation.contact_phone.replace(/\D/g, '');
    }

    const [instance] = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.id, conversation.instance_id))
      .limit(1);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const [secrets] = await db
      .select()
      .from(whatsappInstanceSecrets)
      .where(eq(whatsappInstanceSecrets.instanceId, instance.id))
      .limit(1);

    if (!secrets) {
      return res.status(404).json({ error: 'Instance secrets not found' });
    }

    // Prepare message content
    let finalContent = content || '';
    
    // Replace template variables if provided
    if (templateContext) {
      finalContent = replaceTemplateVariables(finalContent, templateContext);
    }

    // Add agent prefix if not skipped
    if (!skipAgentPrefix && req.user) {
      const user = req.user;
      const profilesTable = (await import('../db/schema')).profiles;
      const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, user.userId));
      if (profile) {
        finalContent = `*${profile.fullName}*: ${finalContent}`;
      }
    }

    // Send message via Evolution API
    const evolutionPayload: any = {
      number: destNumber,
      text: finalContent,
    };

    if (messageType !== 'text' && mediaUrl) {
      evolutionPayload.mediaUrl = mediaUrl;
    }

    if (quotedMessageId) {
      evolutionPayload.quoted = { key: { id: quotedMessageId } };
    }

    console.log('[whatsapp/messages/send] Sending to:', destNumber, 'isGroup:', isGroup);

    const authHeader = secrets.providerType === 'cloud' 
      ? { 'Authorization': `Bearer ${secrets.apiKey}` }
      : { 'apikey': secrets.apiKey };

    // Filter undefined values from auth header
    const cleanAuthHeader = Object.fromEntries(
      Object.entries(authHeader).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>;

    let result: any = null;
    let usedFallback = false;

    const response = await fetch(
      `${secrets.apiUrl}/message/sendText/${instance.instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...cleanAuthHeader,
        },
        body: JSON.stringify(evolutionPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Evolution API error:', errorText);
      
      // Try fallback for group text messages
      if (isGroup && messageType === 'text' && destNumber.includes('@g.us')) {
        console.log('[whatsapp/messages/send] Evolution failed for group, trying fallback API...');
        try {
          const fallbackUrl = 'http://192.168.3.39:8088/send/text';
          const fallbackResp = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ jid: destNumber, text: finalContent }),
          });
          
          if (fallbackResp.ok) {
            result = await fallbackResp.json();
            console.log('[whatsapp/messages/send] Fallback API success:', JSON.stringify(result));
            usedFallback = true;
          } else {
            const fallbackTxt = await fallbackResp.text();
            console.error('[whatsapp/messages/send] Fallback API also failed:', fallbackTxt);
            return res.status(500).json({ error: 'Failed to send message' });
          }
        } catch (fallbackErr: any) {
          console.error('[whatsapp/messages/send] Fallback API error:', fallbackErr?.message || fallbackErr);
          return res.status(500).json({ error: 'Failed to send message' });
        }
      } else {
        return res.status(500).json({ error: 'Failed to send message' });
      }
    } else {
      result = await response.json();
    }

    console.log('[whatsapp/messages/send] Message sent successfully', usedFallback ? '(via fallback)' : '');

    // Build remote_jid based on available identifiers
    let remoteJid: string;
    if (conversation.contact_phone.includes('@lid')) {
      remoteJid = conversation.contact_phone.includes('@') ? conversation.contact_phone : `${conversation.contact_phone}@lid`;
    } else {
      const phoneForJid = senderPn || conversation.contact_phone.replace(/\D/g, '');
      remoteJid = `${phoneForJid}@s.whatsapp.net`;
    }

    // Save message to database
    const [message] = await db.insert(whatsappMessages).values({
      conversationId,
      remoteJid,
      content: finalContent,
      isFromMe: true,
      messageType,
      messageId: result.key?.id || crypto.randomUUID(),
      status: 'sent',
      timestamp: new Date(),
      metadata: { evolutionResponse: result },
    }).returning();

    // Update conversation last message
    await db.execute(sql`
      UPDATE whatsapp_conversations
      SET 
        last_message_at = NOW(),
        last_message_preview = ${finalContent.substring(0, 100)},
        unread_count = 0,
        updated_at = NOW()
      WHERE id = ${conversationId}
    `);
    
    // Emit WebSocket events for real-time updates
    wsEmit.messageCreated(conversationId, {
      ...message,
      conversation_id: conversationId,
    });
    
    wsEmit.conversationUpdated(conversation.instance_id, {
      id: conversationId,
      last_message_at: new Date().toISOString(),
      last_message_preview: finalContent.substring(0, 100),
      unread_count: 0,
    });

    res.json({ success: true, message, evolutionResponse: result });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Evolution webhook endpoint
router.post('/webhooks/evolution', async (req: Request, res: Response) => {
  try {
    const { event: rawEvent, instance, data } = req.body;
    
    // Normalize event name to lowercase (Evolution sends UPPERCASE, we expect lowercase)
    const event = rawEvent?.toLowerCase?.().replace(/_/g, '.') || rawEvent;

    // Log ALL events including status updates
    if (event === 'messages.update') {
      console.log(`[Webhook] *** STATUS UPDATE EVENT *** from instance: ${instance}`);
      console.log(`[Webhook] Status update data:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[Webhook] Received event: ${rawEvent} -> ${event} from instance: ${instance}`);
    };
    console.log(`[Webhook] Full payload:`, JSON.stringify(req.body, null, 2));

    // Get instance from database
    const [instanceRecord] = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.instanceName, instance))
      .limit(1);

    if (!instanceRecord) {
      console.warn(`Instance not found: ${instance}`);
      return res.json({ received: true, warning: 'Instance not found' });
    }

    // Handle different event types
    switch (event) {
      case 'messages.upsert':
        await handleMessageUpsert(instanceRecord, data);
        break;
      case 'messages.update':
        await handleMessageUpdate(instanceRecord, data);
        break;
      case 'messages.delete':
        await handleMessageDelete(instanceRecord, data);
        break;
      case 'connection.update':
        await handleConnectionUpdate(instanceRecord, data);
        break;
      case 'send.message':
        // Evolution v2 may send reactions via send.message event
        if (data?.message?.reactionMessage) {
          console.log(`[Webhook] Reaction via send.message event`);
          await handleMessageUpsert(instanceRecord, data);
        } else {
          console.log(`[Webhook] Ignoring send.message (not a reaction)`);
        }
        break;
      default:
        console.log(`Unhandled event type: ${event}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Test instance connection
router.post('/instances/:instanceId/test', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;

    const [instance] = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const [secrets] = await db
      .select()
      .from(whatsappInstanceSecrets)
      .where(eq(whatsappInstanceSecrets.instanceId, instanceId))
      .limit(1);

    if (!secrets) {
      return res.status(404).json({ error: 'Instance secrets not found' });
    }

    const authHeader = secrets.providerType === 'cloud'
      ? { 'Authorization': `Bearer ${secrets.apiKey}` }
      : { 'apikey': secrets.apiKey };

    // Filter undefined values from auth header
    const cleanAuthHeader2 = Object.fromEntries(
      Object.entries(authHeader).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>;

    const response = await fetch(
      `${secrets.apiUrl}/instance/connectionState/${instance.instanceName}`,
      {
        method: 'GET',
        headers: cleanAuthHeader2,
      }
    );

    if (!response.ok) {
      return res.status(500).json({ success: false, error: 'Failed to check connection' });
    }

    const connectionData = await response.json();

    // Update instance status
    await db
      .update(whatsappInstances)
      .set({
        status: connectionData.state === 'open' ? 'connected' : 'disconnected',
        updatedAt: new Date(),
      })
      .where(eq(whatsappInstances.id, instanceId));

    res.json({ success: true, connectionState: connectionData });
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check instances status
router.get('/instances/check-status', authenticate, async (req: Request, res: Response) => {
  try {
    const instances = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.isActive, true));

    const statusChecks = await Promise.all(
      instances.map(async (instance) => {
        try {
          const [secrets] = await db
            .select()
            .from(whatsappInstanceSecrets)
            .where(eq(whatsappInstanceSecrets.instanceId, instance.id))
            .limit(1);

          if (!secrets) return { instanceId: instance.id, error: 'No secrets found' };

          const authHeader = secrets.providerType === 'cloud'
            ? { 'Authorization': `Bearer ${secrets.apiKey}` }
            : { 'apikey': secrets.apiKey };

          const response = await fetch(
            `${secrets.apiUrl}/instance/connectionState/${instance.instanceName}`,
            { 
              method: 'GET', 
              headers: Object.fromEntries(
                Object.entries(authHeader).filter(([_, v]) => v !== undefined)
              ) as HeadersInit 
            }
          );

          if (!response.ok) {
            return { instanceId: instance.id, error: 'Failed to check' };
          }

          const data = await response.json();
          
          // Update database
          await db
            .update(whatsappInstances)
            .set({ 
              status: data.state === 'open' ? 'connected' : 'disconnected',
              updatedAt: new Date() 
            })
            .where(eq(whatsappInstances.id, instance.id));

          return {
            instanceId: instance.id,
            instanceName: instance.instanceName,
            status: data.state,
            success: true,
          };
        } catch (error) {
          return { instanceId: instance.id, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      })
    );

    res.json({ statusChecks });
  } catch (error) {
    console.error('Error checking instances:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit message
router.put('/messages/:messageId', authenticate, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const [message] = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.id, messageId))
      .limit(1);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Update message
    const [updated] = await db
      .update(whatsappMessages)
      .set({
        content,
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, messageId))
      .returning();

    res.json({ success: true, message: updated });
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analyze sentiment
router.post('/sentiment/analyze', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Get conversation to obtain contactId
    const [conversation] = await db
      .select()
      .from(whatsappConversationNotes)
      .where(eq(whatsappConversationNotes.id, conversationId))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const contactId = conversation.contactId;

    // Get last 10 messages from contact
    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.conversationId, conversationId),
          eq(whatsappMessages.isFromMe, false)
        )
      )
      .orderBy(desc(whatsappMessages.timestamp))
      .limit(10);

    if (messages.length < 3) {
      return res.json({
        success: false,
        message: 'Mínimo 3 mensagens necessário para análise',
        messagesFound: messages.length,
      });
    }

    // Call AI service for sentiment analysis (placeholder)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const prompt = `Analise o sentimento das seguintes mensagens e retorne um JSON com:
- sentiment: "positive", "neutral" ou "negative"
- confidence: número de 0 a 1
- summary: resumo breve
- reasoning: explicação

Mensagens:
${messages.map((m, i) => `${i + 1}. ${m.content}`).join('\n')}`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0]?.message?.content || '{}';
    const analysis = JSON.parse(analysisText.replace(/```json\n?|\n?```/g, ''));

    // Save analysis
    await db.insert(whatsappSentimentAnalysis).values({
      conversationId,
      contactId,
      sentiment: analysis.sentiment,
      messagesAnalyzed: messages.length,
    });

    // Save history
    await db.insert(whatsappSentimentHistory).values({
      conversationId,
      contactId,
      sentiment: analysis.sentiment,
      messagesAnalyzed: messages.length,
    });

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate conversation summary
router.post('/conversations/:conversationId/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(desc(whatsappMessages.timestamp))
      .limit(50);

    if (messages.length === 0) {
      return res.json({ success: false, message: 'No messages found' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const prompt = `Resuma a seguinte conversa em português, destacando:
- Assunto principal
- Principais pontos discutidos
- Ações necessárias
- Tom da conversa

Mensagens:
${messages.reverse().map((m) => `${m.isFromMe ? 'Atendente' : 'Cliente'}: ${m.content}`).join('\n')}`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      }),
    });

    if (!aiResponse.ok) {
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices[0]?.message?.content || 'Sem resumo disponível';

    // Save summary
    await db.insert(whatsappConversationSummaries).values({
      conversationId: Array.isArray(conversationId) ? conversationId[0] : conversationId,
      summary,
    });

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Categorize conversation
router.post('/conversations/:conversationId/categorize', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { category, subcategory } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    await db
      .update(whatsappConversationNotes)
      .set({
        category,
        subcategory,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversationNotes.id, conversationId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error categorizing conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fix contact names
router.post('/contacts/fix-names', authenticate, async (req: Request, res: Response) => {
  try {
    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(sql`name LIKE '%@%' OR name = phone_number`);

    let fixed = 0;
    for (const contact of contacts) {
      const cleanName = contact.phoneNumber.replace(/\D/g, '');
      await db
        .update(whatsappContacts)
        .set({ name: cleanName })
        .where(eq(whatsappContacts.id, contact.id));
      fixed++;
    }

    res.json({ success: true, fixed });
  } catch (error) {
    console.error('Error fixing names:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync contact profiles
router.post('/contacts/sync-profiles', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;

    // Implementation would fetch contacts from Evolution API and sync
    res.json({ success: true, message: 'Sync initiated' });
  } catch (error) {
    console.error('Error syncing contacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
function replaceTemplateVariables(content: string, context: any): string {
  let result = content;
  
  if (context.clienteNome) result = result.replace(/\{\{clienteNome\}\}/g, context.clienteNome);
  if (context.clienteTelefone) result = result.replace(/\{\{clienteTelefone\}\}/g, context.clienteTelefone);
  if (context.atendenteNome) result = result.replace(/\{\{atendenteNome\}\}/g, context.atendenteNome);
  if (context.ticketNumero) result = result.replace(/\{\{ticketNumero\}\}/g, String(context.ticketNumero));
  if (context.setorNome) result = result.replace(/\{\{setorNome\}\}/g, context.setorNome);
  
  const now = new Date();
  result = result.replace(/\{\{dataAtual\}\}/g, now.toLocaleDateString('pt-BR'));
  result = result.replace(/\{\{horaAtual\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  
  return result;
}

/**
 * Send WhatsApp message from webhook handler (no auth required)
 * Used for automatic ticket welcome/reopen/closing messages
 */
async function sendWhatsAppMessageInternal(
  conversationId: string,
  content: string,
  templateContext?: any
): Promise<{ success: boolean; error?: string }> {
  console.log('[sendWhatsAppMessageInternal] === FUNCTION CALLED ===');
  console.log('[sendWhatsAppMessageInternal] conversationId:', conversationId);
  console.log('[sendWhatsAppMessageInternal] content (first 100 chars):', content?.substring(0, 100));
  console.log('[sendWhatsAppMessageInternal] templateContext:', JSON.stringify(templateContext));

  try {
    // Get conversation with contact and instance
    const convResult = await db.execute(sql`
      SELECT c.*, ct.phone_number as contact_phone, ct.name as contact_name, ct.metadata as contact_metadata,
             ct.is_group as contact_is_group, ct.remote_jid as contact_remote_jid,
             i.id as inst_id, i.instance_name, i.provider_type, i.instance_id_external
      FROM whatsapp_conversations c
      JOIN whatsapp_contacts ct ON ct.id = c.contact_id
      JOIN whatsapp_instances i ON i.id = c.instance_id
      WHERE c.id = ${conversationId}
      LIMIT 1
    `);
    
    const conversation = convResult.rows?.[0] || convResult[0];
    console.log('[sendWhatsAppMessageInternal] Conversation found:', !!conversation, 'instance:', conversation?.instance_name);
    
    if (!conversation) {
      console.log('[sendWhatsAppMessageInternal] ERROR: Conversation not found');
      return { success: false, error: 'Conversation not found' };
    }

    // Get secrets
    const secResult = await db.execute(sql`
      SELECT * FROM whatsapp_instance_secrets WHERE instance_id = ${conversation.inst_id} LIMIT 1
    `);
    const secrets = secResult.rows?.[0] || secResult[0];
    if (!secrets) {
      return { success: false, error: 'Instance secrets not found' };
    }

    const providerType = conversation.provider_type || secrets.provider_type || 'self_hosted';
    const instanceIdentifier = providerType === 'cloud' && conversation.instance_id_external
      ? conversation.instance_id_external
      : conversation.instance_name;

    // Get destination number - Priority: Group full_jid > senderPn from metadata > phone_number
    const contactMetadata = conversation.contact_metadata || {};
    const senderPn = contactMetadata.sender_pn;
    const isGroup = conversation.contact_is_group;
    const contactRemoteJid = conversation.contact_remote_jid;
    
    let destNumber: string;
    
    // For groups, use full_jid from metadata (has phone-groupid@g.us format) for Evolution API
    if (isGroup && contactRemoteJid && String(contactRemoteJid).includes('@g.us')) {
      const fullJid = contactMetadata.full_jid;
      destNumber = fullJid || contactRemoteJid;
      console.log('[sendWhatsAppMessageInternal] Group message, using JID:', destNumber);
    } else if (senderPn) {
      destNumber = String(senderPn).replace(/\D/g, '');
      console.log('[sendWhatsAppMessageInternal] Using senderPn:', destNumber);
    } else if (String(conversation.contact_phone).includes('@lid')) {
      destNumber = conversation.contact_phone;
      console.log('[sendWhatsAppMessageInternal] Using lidId:', destNumber);
    } else {
      destNumber = String(conversation.contact_phone).replace(/\D/g, '');
      console.log('[sendWhatsAppMessageInternal] Using phone number:', destNumber);
    }

    // Process content with template variables
    let processedContent = content;
    console.log('[sendWhatsAppMessageInternal] Content before template processing:', processedContent?.substring(0, 100));
    if (templateContext) {
      processedContent = replaceTemplateVariables(processedContent, templateContext);
      console.log('[sendWhatsAppMessageInternal] Content after template processing:', processedContent?.substring(0, 100));
    }

    // Build API URL
    let apiUrl = (secrets.api_url || secrets.apiUrl || '').replace(/\/manager$/, '');
    if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
    
    // Resolve Docker URL (host.docker.internal -> localhost for local dev)
    let targetUrl = apiUrl;
    if (process.env.NODE_ENV !== 'production' && apiUrl.includes('host.docker.internal')) {
      targetUrl = apiUrl.replace('host.docker.internal', 'localhost');
    }
    
    const endpoint = `${targetUrl}/message/sendText/${instanceIdentifier}`;
    const apiKey = secrets.api_key || secrets.apiKey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(providerType === 'cloud' ? { 'Authorization': `Bearer ${apiKey}` } : { 'apikey': apiKey })
    };

    console.log(`[sendWhatsAppMessageInternal] === SENDING REQUEST ===`);
    console.log(`[sendWhatsAppMessageInternal] Endpoint: ${endpoint}`);
    console.log(`[sendWhatsAppMessageInternal] Destination: ${destNumber}`);
    console.log(`[sendWhatsAppMessageInternal] Provider type: ${providerType}`);
    console.log(`[sendWhatsAppMessageInternal] Is group: ${isGroup}`);
    console.log(`[sendWhatsAppMessageInternal] Text (first 100 chars): ${processedContent?.substring(0, 100)}`);

    let responseData: any = null;
    let usedFallback = false;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number: destNumber, text: processedContent })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[sendWhatsAppMessageInternal] Evolution API error:', response.status, errText);
      
      // Try fallback for group text messages
      if (isGroup && destNumber.includes('@g.us')) {
        console.log('[sendWhatsAppMessageInternal] Evolution failed for group, trying fallback API...');
        try {
          const fallbackUrl = 'http://192.168.3.39:8088/send/text';
          const fallbackResp = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ jid: destNumber, text: processedContent }),
          });
          
          if (fallbackResp.ok) {
            responseData = await fallbackResp.json();
            console.log('[sendWhatsAppMessageInternal] Fallback API success:', JSON.stringify(responseData));
            usedFallback = true;
          } else {
            const fallbackTxt = await fallbackResp.text();
            console.error('[sendWhatsAppMessageInternal] Fallback API also failed:', fallbackTxt);
            return { success: false, error: `Evolution API error: ${response.status}` };
          }
        } catch (fallbackErr: any) {
          console.error('[sendWhatsAppMessageInternal] Fallback API error:', fallbackErr?.message || fallbackErr);
          return { success: false, error: `Evolution API error: ${response.status}` };
        }
      } else {
        return { success: false, error: `Evolution API error: ${response.status}` };
      }
    } else {
      responseData = await response.json();
    }

    const keyId = responseData?.key?.id || responseData?.messageId || `auto_${Date.now()}`;
    console.log(`[sendWhatsAppMessageInternal] Message sent successfully: ${keyId}${usedFallback ? ' (via fallback)' : ''}`);

    // Insert message into database
    await db.execute(sql`
      INSERT INTO whatsapp_messages (
        conversation_id, remote_jid, message_id, content, message_type,
        is_from_me, status, timestamp, created_at
      ) VALUES (
        ${conversationId}, 'system', ${keyId}, ${processedContent}, 'text',
        true, 'sent', NOW(), NOW()
      ) ON CONFLICT DO NOTHING
    `);

    // Emit WebSocket event
    wsEmit.messageCreated(conversationId, {
      id: keyId,
      conversation_id: conversationId,
      message_id: keyId,
      content: processedContent,
      message_type: 'text',
      is_from_me: true,
      status: 'sent',
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error('[sendWhatsAppMessageInternal] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Apply assignment rules to auto-assign agent to conversation
 * Called after new conversation is created or incoming message to unassigned conversation
 */
async function applyAssignmentRule(
  conversation: any,
  isFromMe: boolean
): Promise<void> {
  // Only apply assignment rules for incoming messages (not from agent)
  if (isFromMe) {
    return;
  }

  try {
    const conversationId = conversation.id;
    const instanceId = conversation.instance_id;
    const sectorId = conversation.sector_id;
    const assignedTo = conversation.assigned_to;

    // Skip if already assigned
    if (assignedTo) {
      console.log('[applyAssignmentRule] Conversation already assigned to:', assignedTo);
      return;
    }

    console.log('[applyAssignmentRule] Looking for assignment rule for instance:', instanceId, 'sector:', sectorId);

    // Find matching active assignment rule
    // Priority: sector-specific rule > instance-wide rule
    let ruleResult;
    if (sectorId) {
      // First try sector-specific rule
      ruleResult = await db.execute(sql`
        SELECT * FROM assignment_rules
        WHERE instance_id = ${instanceId}
          AND sector_id = ${sectorId}
          AND is_active = true
        LIMIT 1
      `);
    }

    let rule = ruleResult?.rows?.[0] || ruleResult?.[0];

    // If no sector-specific rule, try instance-wide rule (sector_id IS NULL)
    if (!rule) {
      const instanceRuleResult = await db.execute(sql`
        SELECT * FROM assignment_rules
        WHERE instance_id = ${instanceId}
          AND sector_id IS NULL
          AND is_active = true
        LIMIT 1
      `);
      rule = instanceRuleResult.rows?.[0] || instanceRuleResult[0];
    }

    if (!rule) {
      console.log('[applyAssignmentRule] No active assignment rule found');
      return;
    }

    console.log('[applyAssignmentRule] Found rule:', rule.name, 'type:', rule.rule_type);

    let assignedAgentId: string | null = null;

    if (rule.rule_type === 'fixed') {
      // Fixed assignment - always assign to the same agent
      assignedAgentId = rule.fixed_agent_id;
      console.log('[applyAssignmentRule] Fixed assignment to agent:', assignedAgentId);
    } else if (rule.rule_type === 'round_robin') {
      // Round-robin assignment - cycle through agents
      const agents = rule.round_robin_agents || [];
      if (agents.length === 0) {
        console.log('[applyAssignmentRule] Round-robin rule has no agents configured');
        return;
      }

      const currentIndex = rule.round_robin_last_index || 0;
      const nextIndex = (currentIndex + 1) % agents.length;
      assignedAgentId = agents[nextIndex];

      // Update the last index for next assignment
      await db.execute(sql`
        UPDATE assignment_rules
        SET round_robin_last_index = ${nextIndex}, updated_at = NOW()
        WHERE id = ${rule.id}
      `);
      console.log('[applyAssignmentRule] Round-robin assignment to agent:', assignedAgentId, 'next index:', nextIndex);
    }

    if (assignedAgentId) {
      // Update conversation with assigned agent
      await db.execute(sql`
        UPDATE whatsapp_conversations
        SET assigned_to = ${assignedAgentId}, updated_at = NOW()
        WHERE id = ${conversationId}
      `);

      console.log('[applyAssignmentRule] Assigned conversation', conversationId, 'to agent', assignedAgentId);

      // Emit WebSocket event for real-time update
      wsEmit.conversationUpdated(instanceId, {
        id: conversationId,
        assigned_to: assignedAgentId,
      });
    }
  } catch (error) {
    console.error('[applyAssignmentRule] Error applying assignment rule:', error);
  }
}

/**
 * Check if auto-ticket should be created and create it with welcome message
 * Called after new incoming message is saved
 */
async function checkAndCreateAutoTicket(
  conversation: any,
  contact: any,
  isGroupMessage: boolean,
  isFromMe: boolean
): Promise<void> {
  console.log('[checkAndCreateAutoTicket] === FUNCTION CALLED ===');
  console.log('[checkAndCreateAutoTicket] conversationId:', conversation?.id);
  console.log('[checkAndCreateAutoTicket] sectorId:', conversation?.sector_id);
  console.log('[checkAndCreateAutoTicket] isGroupMessage:', isGroupMessage);
  console.log('[checkAndCreateAutoTicket] isFromMe:', isFromMe);
  console.log('[checkAndCreateAutoTicket] contactName:', contact?.name);

  // Only create tickets for incoming messages (not from agent)
  if (isFromMe) {
    console.log('[checkAndCreateAutoTicket] Skipping - message is from agent (isFromMe=true)');
    return;
  }

  try {
    const conversationId = conversation.id;
    const sectorId = conversation.sector_id;

    if (!sectorId) {
      console.log('[checkAndCreateAutoTicket] No sector assigned to conversation, skipping auto-ticket');
      return;
    }

    // Get sector configuration
    const sectorResult = await db.execute(sql`
      SELECT id, name, gera_ticket_usuarios, gera_ticket_grupos, mensagem_boas_vindas
      FROM sectors
      WHERE id = ${sectorId}
      LIMIT 1
    `);
    const sector = sectorResult.rows?.[0] || sectorResult[0];

    if (!sector) {
      console.log('[checkAndCreateAutoTicket] Sector not found:', sectorId);
      return;
    }

    // Check if auto-ticket is enabled for this type of message
    const shouldCreateTicket = isGroupMessage 
      ? sector.gera_ticket_grupos === true
      : sector.gera_ticket_usuarios === true;

    console.log('[checkAndCreateAutoTicket] Sector config:', {
      sectorName: sector.name,
      gera_ticket_usuarios: sector.gera_ticket_usuarios,
      gera_ticket_grupos: sector.gera_ticket_grupos,
      hasMensagemBoasVindas: !!sector.mensagem_boas_vindas,
      mensagemBoasVindasPreview: sector.mensagem_boas_vindas?.substring(0, 50),
      shouldCreateTicket,
    });

    if (!shouldCreateTicket) {
      console.log(`[checkAndCreateAutoTicket] Auto-ticket disabled for ${isGroupMessage ? 'groups' : 'users'} in sector ${sector.name}`);
      return;
    }

    // Check if there's already an active ticket for this conversation
    const existingTicketResult = await db.execute(sql`
      SELECT id, status, numero FROM tickets
      WHERE conversation_id = ${conversationId}
        AND status IN ('aberto', 'em_atendimento', 'reaberto')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const existingTicket = existingTicketResult.rows?.[0] || existingTicketResult[0];

    if (existingTicket) {
      console.log(`[checkAndCreateAutoTicket] Active ticket already exists: ${existingTicket.id} (status: ${existingTicket.status})`);
      return;
    }

    // Create new ticket
    console.log(`[checkAndCreateAutoTicket] Creating auto-ticket for conversation ${conversationId} in sector ${sector.name}`);
    
    const ticketInsertResult = await db.execute(sql`
      INSERT INTO tickets (conversation_id, sector_id, status, created_at)
      VALUES (${conversationId}, ${sectorId}, 'aberto', NOW())
      RETURNING id, numero
    `);
    const newTicket = ticketInsertResult.rows?.[0] || ticketInsertResult[0];

    if (!newTicket) {
      console.error('[checkAndCreateAutoTicket] Failed to create ticket');
      return;
    }

    console.log(`[checkAndCreateAutoTicket] Ticket created: ${newTicket.id} (numero: ${newTicket.numero})`);

    // Insert ticket opened event marker
    const markerId = `ticket_opened-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await db.execute(sql`
      INSERT INTO whatsapp_messages (
        conversation_id, message_id, remote_jid, content, message_type,
        is_from_me, status, timestamp, created_at
      ) VALUES (
        ${conversationId}, ${markerId}, 'system', ${'TICKET_EVENT:' + newTicket.numero}, 'ticket_opened',
        true, 'sent', NOW(), NOW()
      ) ON CONFLICT DO NOTHING
    `);

    // Send welcome message if configured
    console.log('[checkAndCreateAutoTicket] Checking welcome message:', {
      hasMensagemBoasVindas: !!sector.mensagem_boas_vindas,
      mensagemBoasVindasContent: sector.mensagem_boas_vindas?.substring(0, 100),
    });

    if (sector.mensagem_boas_vindas) {
      const templateContext = {
        clienteNome: contact?.name || contact?.phone_number || 'Cliente',
        clienteTelefone: contact?.phone_number || '',
        atendenteNome: 'Sistema',
        setorNome: sector.name || '',
        ticketNumero: newTicket.numero || '',
      };

      console.log('[checkAndCreateAutoTicket] Calling sendWhatsAppMessageInternal with:', {
        conversationId,
        contentPreview: sector.mensagem_boas_vindas?.substring(0, 50),
        templateContext,
      });

      const sendResult = await sendWhatsAppMessageInternal(
        conversationId,
        sector.mensagem_boas_vindas,
        templateContext
      );

      console.log('[checkAndCreateAutoTicket] sendWhatsAppMessageInternal result:', sendResult);

      if (!sendResult.success) {
        console.error('[checkAndCreateAutoTicket] Failed to send welcome message:', sendResult.error);
      } else {
        console.log('[checkAndCreateAutoTicket] Welcome message sent for ticket', newTicket.numero);
      }
    } else {
      console.log('[checkAndCreateAutoTicket] No welcome message configured for sector');
    }

    // Emit ticket created event via WebSocket
    wsEmit.conversationUpdated(conversation.instance_id, {
      id: conversationId,
      ticket_created: true,
      ticket_id: newTicket.id,
      ticket_numero: newTicket.numero,
    });

  } catch (error) {
    console.error('[checkAndCreateAutoTicket] Error:', error);
  }
}

/**
 * Check if AI agent should respond and trigger auto-response
 * Called after new incoming message is saved
 */
async function checkAndTriggerAIResponse(
  conversation: any,
  contact: any,
  isFromMe: boolean,
  messageContent: string
): Promise<void> {
  // Only trigger AI for incoming messages from customers
  if (isFromMe) {
    return;
  }

  try {
    const sectorId = conversation.sector_id;
    if (!sectorId) {
      return;
    }

    // Check if sector has AI agent enabled
    const aiConfigResult = await db.execute(sql`
      SELECT ac.*, s.tipo_atendimento 
      FROM ai_agent_configs ac
      JOIN sectors s ON s.id = ac.sector_id
      WHERE ac.sector_id = ${sectorId} 
        AND ac.is_enabled = true
      LIMIT 1
    `);
    const aiConfig = aiConfigResult.rows?.[0] || aiConfigResult[0];

    if (!aiConfig) {
      return;
    }

    // Check conversation mode - don't respond if in human mode
    if (conversation.conversation_mode === 'human') {
      console.log('[checkAndTriggerAIResponse] Skipping - conversation in human mode');
      return;
    }

    // For hybrid mode, only respond after the timeout counted from the
    // customer's last message. If a human replied after the customer's
    // last message, skip the AI.
    if (conversation.conversation_mode === 'hybrid') {
      const hybridTimeout = aiConfig.hybrid_timeout_minutes || 5;

      // Get last customer message
      const lastCustomerResult = await db.execute(sql`
        SELECT created_at FROM whatsapp_messages
        WHERE conversation_id = ${conversation.id}
          AND is_from_me = false
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const lastCustomer = lastCustomerResult.rows?.[0] || lastCustomerResult[0];

      if (!lastCustomer) {
        // No customer message to respond to
        console.log('[checkAndTriggerAIResponse] Hybrid mode - no customer message found, skipping AI.');
        return;
      }

      // Get last human response (exclude AI messages)
      const lastHumanResult = await db.execute(sql`
        SELECT created_at FROM whatsapp_messages
        WHERE conversation_id = ${conversation.id}
          AND is_from_me = true
          AND (metadata->>'sender' IS NULL OR metadata->>'sender' != 'ai')
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const lastHuman = lastHumanResult.rows?.[0] || lastHumanResult[0];

      // Get last AI response
      const lastAIResult = await db.execute(sql`
        SELECT created_at FROM whatsapp_messages
        WHERE conversation_id = ${conversation.id}
          AND is_from_me = true
          AND metadata->>'sender' = 'ai'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const lastAI = lastAIResult.rows?.[0] || lastAIResult[0];

      const lastCustomerTime = new Date(lastCustomer.created_at);
      const lastHumanTime = lastHuman ? new Date(lastHuman.created_at) : null;
      const lastAITime = lastAI ? new Date(lastAI.created_at) : null;

      // If human replied after customer's last message, let human handle it
      if (lastHumanTime && lastHumanTime.getTime() > lastCustomerTime.getTime()) {
        console.log('[checkAndTriggerAIResponse] Hybrid mode - human replied after customer, skipping AI.');
        return;
      }

      // If AI already replied after customer's last message, don't send another response
      if (lastAITime && lastAITime.getTime() > lastCustomerTime.getTime()) {
        console.log('[checkAndTriggerAIResponse] Hybrid mode - AI already replied after customer, skipping duplicate.');
        return;
      }

      const now = new Date();
      const diffMinutes = (now.getTime() - lastCustomerTime.getTime()) / (1000 * 60);
      if (diffMinutes < hybridTimeout) {
        console.log(`[checkAndTriggerAIResponse] Hybrid mode - last customer message ${diffMinutes.toFixed(1)} min ago, waiting ${hybridTimeout} min. Skipping AI.`);
        return;
      }

      console.log(`[checkAndTriggerAIResponse] Hybrid mode - last customer message ${diffMinutes.toFixed(1)} min ago, timeout is ${hybridTimeout} min. AI will respond.`);
    }

    // Check auto_reply_enabled
    if (!aiConfig.auto_reply_enabled) {
      console.log('[checkAndTriggerAIResponse] Skipping - auto_reply_enabled is false');
      return;
    }

    // Check working hours if configured
    const now = new Date();
    const timezone = aiConfig.working_timezone || 'America/Sao_Paulo';
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const currentHour = localTime.getHours();
    const currentMinute = localTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const currentDay = localTime.getDay();

    // If working_days is empty array, treat as "all days enabled"
    // PostgreSQL arrays may return strings, so convert to numbers for comparison
    const workingDays = (Array.isArray(aiConfig.working_days) && aiConfig.working_days.length > 0) 
      ? aiConfig.working_days.map((d: any) => typeof d === 'string' ? parseInt(d, 10) : d)
      : [0, 1, 2, 3, 4, 5, 6];
    const startTime = aiConfig.working_hours_start || '08:00';
    const endTime = aiConfig.working_hours_end || '18:00';

    const isWorkingDay = workingDays.includes(currentDay);
    const isWorkingHours = currentTimeStr >= startTime && currentTimeStr <= endTime;
    
    console.log(`[checkAndTriggerAIResponse] Working hours check: day=${currentDay}, time=${currentTimeStr}, workingDays=${JSON.stringify(workingDays)}, hours=${startTime}-${endTime}, isWorkingDay=${isWorkingDay}, isWorkingHours=${isWorkingHours}`);

    if (!isWorkingDay || !isWorkingHours) {
      // Send out of hours message if configured
      if (aiConfig.out_of_hours_message) {
        console.log('[checkAndTriggerAIResponse] Outside working hours, sending out of hours message');
        await sendWhatsAppMessageInternal(conversation.id, aiConfig.out_of_hours_message, {
          clienteNome: contact?.name || 'Cliente',
        });
      }
      return;
    }

    // Check escalation keywords
    const escalationKeywords: string[] = aiConfig.escalation_keywords || [];
    const contentLower = messageContent.toLowerCase();
    const shouldEscalate = escalationKeywords.some(kw => contentLower.includes(kw.toLowerCase()));

    if (shouldEscalate) {
      console.log('[checkAndTriggerAIResponse] Escalation keyword detected, switching to human mode');
      await db.execute(sql`
        UPDATE whatsapp_conversations 
        SET conversation_mode = 'human', updated_at = NOW() 
        WHERE id = ${conversation.id}
      `);
      return;
    }

    // Generate AI response
    console.log('[checkAndTriggerAIResponse] Generating AI response for conversation:', conversation.id);

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      console.error('[checkAndTriggerAIResponse] GROQ_API_KEY not configured');
      return;
    }

    // Get recent messages for context
    const recentMessagesResult = await db.execute(sql`
      SELECT content, is_from_me, message_type
      FROM whatsapp_messages
      WHERE conversation_id = ${conversation.id} AND is_internal = false
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const recentMessages = (recentMessagesResult.rows || []).reverse();

    // Build system prompt
    const agentName = aiConfig.agent_name || 'Assistente Virtual';
    const systemPrompt = `Você é ${agentName}${aiConfig.persona_description ? `. ${aiConfig.persona_description}` : ''}.

Tom de voz: ${aiConfig.tone_of_voice === 'professional' ? 'profissional e cortês' : aiConfig.tone_of_voice === 'friendly' ? 'amigável e acolhedor' : 'casual e descontraído'}

${aiConfig.business_context ? `Contexto do negócio: ${aiConfig.business_context}` : ''}

${aiConfig.faq_context ? `FAQ: ${aiConfig.faq_context}` : ''}

${aiConfig.system_prompt ? aiConfig.system_prompt : ''}

REGRAS IMPORTANTES:
- Responda de forma concisa e útil
- Use português do Brasil
- Seja educado e ${aiConfig.tone_of_voice === 'professional' ? 'profissional' : 'simpático'}
- Se não souber algo, ofereça transferir para um atendente humano
- Não invente informações que não estão no contexto fornecido`;

    // Build conversation history
    const history = recentMessages.map((msg: any) => ({
      role: msg.is_from_me ? 'assistant' : 'user',
      content: msg.content || '[mídia]',
    }));

    // Call GROQ API
    const model = aiConfig.default_model || 'llama-3.3-70b-versatile';
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[checkAndTriggerAIResponse] GROQ API error:', groqResponse.status, errText);
      return;
    }

    const groqData = await groqResponse.json();
    const aiResponseText = groqData.choices?.[0]?.message?.content;

    if (!aiResponseText) {
      console.error('[checkAndTriggerAIResponse] Empty response from GROQ');
      return;
    }

    // Add response delay if configured
    const delaySeconds = aiConfig.response_delay_seconds || 2;
    if (delaySeconds > 0) {
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
    }

    // Send the AI response with agent name header
    const formattedResponse = `_${agentName}_\n\n${aiResponseText}`;
    const sendResult = await sendWhatsAppMessageInternal(conversation.id, formattedResponse);

    if (sendResult.success) {
      console.log('[checkAndTriggerAIResponse] AI response sent successfully');
      
      // Log the AI response
      await db.execute(sql`
        INSERT INTO ai_agent_logs (
          config_id, conversation_id, message_content, response_content, 
          model_used, created_at
        ) VALUES (
          ${aiConfig.id}, ${conversation.id}, ${messageContent}, ${aiResponseText},
          ${model}, NOW()
        )
      `);
    } else {
      console.error('[checkAndTriggerAIResponse] Failed to send AI response:', sendResult.error);
    }

  } catch (error) {
    console.error('[checkAndTriggerAIResponse] Error:', error);
  }
}

async function handleMessageUpsert(instance: any, data: any) {
  // Implementation for message upsert webhook
  console.log('Handling message upsert for instance:', instance.instanceName);
  
  try {
    const key = data.key;
    const message = data.message;
    const pushNameRaw = data.pushName || '';
    // Treat certain push names as non-informative (device owner labels like 'Você' or generic 'Unknown')
    const isMeaningfulPushName = (n: string) => {
      if (!n) return false;
      const lower = n.trim().toLowerCase();
      const blacklist = ['unknown', 'você', 'voce', 'you', 'me', 'eu'];
      return !blacklist.includes(lower);
    };
    const pushName = isMeaningfulPushName(pushNameRaw) ? pushNameRaw : null;
    const messageTimestamp = data.messageTimestamp;
    const messageType = data.messageType || 'text';
    const isFromMe = key?.fromMe || false;
    
    // Extract all identifiers for contact lookup
    // Support multiple possible key names sent by Evolution/webhook payloads.
    // Priority for lookup: 1) explicit phone_number field (ddi+ddd+number),
    // 2) senderPn (key.senderPn), 3) remoteJid (key.remoteJid or key.remote__jid),
    // 4) remote_lid / lid id (@lid)
    const remoteJid = key?.remoteJid || key?.remote_jid || key?.remote__jid || '';
    const altRemoteLid = key?.remote_lid || data?.remote_lid || message?.remote_lid || null;

    // phone_number may be present directly on key/data/message (format: ddi+ddd+number)
    const explicitPhone = (key?.phone_number || data?.phone_number || message?.phone_number || null);

    const senderPnRaw = key?.senderPn || key?.sender_pn || null;
    const senderPn = senderPnRaw ? senderPnRaw.replace(/@.*$/, '') : null; // remove suffix if present

    // Determine lidId from explicit fields or from remoteJid
    const lidId = altRemoteLid
      ? String(altRemoteLid).replace(/@.*$/, '')
      : (remoteJid && remoteJid.includes('@lid') ? remoteJid.replace(/@.*$/, '') : null);

    // Extract phone from remoteJid when it's not a lid id
    const remoteJidPhone = remoteJid && !remoteJid.includes('@lid') ? remoteJid.replace(/@.*$/, '') : null;

    // Primary phone number source
    const phoneNumber = explicitPhone ? String(explicitPhone).replace(/\D/g, '') : (senderPn || remoteJidPhone || '');
    
    console.log(`[handleMessageUpsert] Contact identifiers: senderPn=${senderPn}, remoteJidPhone=${remoteJidPhone}, lidId=${lidId}, phoneNumber=${phoneNumber}`);

    // Normalize message_type: imageMessage -> image, audioMessage -> audio, etc.
    const normalizeMessageType = (type: string): string => {
      return type.replace(/Message$/, '').toLowerCase();
    };

    // Extract message content and media info BEFORE group check (needed for both)
    let content = '';
    let normalizedType = normalizeMessageType(messageType);
    let mediaUrl: string | null = null;
    let mediaMimetype: string | null = null;
    
    // Extract media URL from Evolution webhook payload
    if (data.message?.mediaUrl) {
      mediaUrl = data.message.mediaUrl;
    } else if (data?.mediaUrl) {
      mediaUrl = data.mediaUrl;
    } else if (message?.imageMessage?.url) {
      mediaUrl = message.imageMessage.url;
    } else if (message?.audioMessage?.url) {
      mediaUrl = message.audioMessage.url;
    } else if (message?.videoMessage?.url) {
      mediaUrl = message.videoMessage.url;
    } else if (message?.documentMessage?.url) {
      mediaUrl = message.documentMessage.url;
    } else if (message?.stickerMessage?.url) {
      mediaUrl = message.stickerMessage.url;
    }
    
    // Extract content based on message type
    if (message?.conversation) {
      content = message.conversation;
      normalizedType = 'text';
    } else if (message?.extendedTextMessage?.text) {
      content = message.extendedTextMessage.text;
      normalizedType = 'text';
    } else if (message?.imageMessage) {
      content = message.imageMessage.caption || '[Image]';
      mediaMimetype = message.imageMessage.mimetype || 'image/jpeg';
      normalizedType = 'image';
    } else if (message?.videoMessage) {
      content = message.videoMessage.caption || '[Video]';
      mediaMimetype = message.videoMessage.mimetype || 'video/mp4';
      normalizedType = 'video';
    } else if (message?.audioMessage) {
      content = '[Audio]';
      mediaMimetype = message.audioMessage.mimetype || 'audio/ogg';
      normalizedType = 'audio';
    } else if (message?.documentMessage) {
      content = message.documentMessage.fileName || '[Document]';
      mediaMimetype = message.documentMessage.mimetype || 'application/octet-stream';
      normalizedType = 'document';
    } else if (message?.stickerMessage) {
      content = '[Sticker]';
      mediaMimetype = message.stickerMessage.mimetype || 'image/webp';
      normalizedType = 'sticker';
    } else if (message?.locationMessage) {
      content = '[Location]';
      normalizedType = 'location';
    } else if (message?.liveLocationMessage) {
      content = '[Live Location]';
      normalizedType = 'liveLocation';
    } else if (message?.contactMessage) {
      content = '[Contact]';
      normalizedType = 'contact';
    } else if (message?.contactsArrayMessage) {
      content = '[Contacts]';
      normalizedType = 'contacts';
    } else if (message?.pollCreationMessage || message?.pollCreationMessageV3) {
      const poll = message.pollCreationMessage || message.pollCreationMessageV3;
      content = poll?.name || '[Poll]';
      normalizedType = 'poll';
    } else if (message?.pollUpdateMessage) {
      content = '[Poll Update]';
      normalizedType = 'pollUpdate';
    } else if (message?.buttonsMessage || message?.buttonsResponseMessage) {
      content = message.buttonsMessage?.contentText || message.buttonsResponseMessage?.selectedButtonId || '[Buttons]';
      normalizedType = 'buttons';
    } else if (message?.listMessage || message?.listResponseMessage) {
      content = message.listMessage?.title || message.listResponseMessage?.title || '[List]';
      normalizedType = 'list';
    } else if (message?.templateMessage || message?.templateButtonReplyMessage) {
      content = message.templateMessage?.hydratedTemplate?.hydratedContentText || '[Template]';
      normalizedType = 'template';
    } else {
      content = '[Message]';
    }

    // Detect group messages (WhatsApp group JIDs end with @g.us)
    const isGroupMessage = (remoteJid && remoteJid.includes('@g.us')) || (altRemoteLid && String(altRemoteLid).includes('@g.us')) || !!message?.groupParticipant;

    // If this is a group message, handle as a group contact/conversation
    if (isGroupMessage) {
      // Get full group JID (e.g., "554192319253-1539103087@g.us")
      const fullGroupJid = remoteJid && remoteJid.includes('@g.us') ? remoteJid : (altRemoteLid ? String(altRemoteLid) : null);
      
      // Extract just the group ID part (after the hyphen, before @g.us)
      // Format: "phone-groupid@g.us" -> we want just "groupid"
      let groupOnlyId: string;
      if (fullGroupJid) {
        const jidWithoutSuffix = fullGroupJid.replace(/@.*$/, ''); // "554192319253-1539103087"
        // If there's a hyphen, get the part after it (the actual group ID)
        groupOnlyId = jidWithoutSuffix.includes('-') 
          ? jidWithoutSuffix.split('-').pop() || jidWithoutSuffix
          : jidWithoutSuffix;
      } else {
        groupOnlyId = `group_${Date.now()}`;
      }
      
      // Use the clean group ID for remote_jid  
      const contactRemoteJid = `${groupOnlyId}@g.us`;
      const contactPhone = groupOnlyId;
      
      console.log(`[handleMessageUpsert] Group JID parsing: full=${fullGroupJid}, extracted=${groupOnlyId}, final=${contactRemoteJid}`);
      
      // Try to get group name and profile from Evolution API (use full JID for API call)
      const evolutionGroupInfo = await getGroupInfoFromEvolution(fullGroupJid || contactRemoteJid, instance.id);
      const groupName = evolutionGroupInfo.name || (isMeaningfulPushName(pushNameRaw) ? pushNameRaw : null);
      const groupProfilePic = evolutionGroupInfo.profilePicUrl || null;
      
      console.log(`[handleMessageUpsert] Group info: name=${groupName}, pic=${groupProfilePic ? 'yes' : 'no'}`);

      // Try find existing group contact by remote_jid or phone_number
      const result = await db.execute(sql`
        SELECT * FROM whatsapp_contacts
        WHERE instance_id = ${instance.id}
          AND (remote_jid = ${contactRemoteJid} OR phone_number = ${contactPhone})
        LIMIT 1
      `);
      let contact = result.rows?.[0] || result[0];

      if (!contact) {
        // Create group contact - use groupName or a readable default
        const displayName = groupName || `Grupo ${groupOnlyId.substring(0, 8)}...`;
        const insertRes = await db.execute(sql`
          INSERT INTO whatsapp_contacts (instance_id, phone_number, remote_jid, name, profile_picture_url, is_group, metadata, created_at, updated_at)
          VALUES (${instance.id}, ${contactPhone}, ${contactRemoteJid}, ${displayName}, ${groupProfilePic}, true, ${JSON.stringify({ group_id: groupOnlyId, full_jid: fullGroupJid })}::jsonb, NOW(), NOW())
          RETURNING *
        `);
        contact = insertRes.rows?.[0] || insertRes[0];
        console.log(`[handleMessageUpsert] Created group contact: id=${contact?.id} name=${displayName}`);
      } else {
        // Ensure contact is marked as group and update name/profile if we have better info
        await db.execute(sql`
          UPDATE whatsapp_contacts
          SET is_group = true,
              name = COALESCE(${evolutionGroupInfo.name}, name),
              profile_picture_url = COALESCE(${groupProfilePic}, profile_picture_url),
              remote_jid = COALESCE(${contactRemoteJid}, remote_jid),
              updated_at = NOW()
          WHERE id = ${contact.id}
        `);
      }

      // Find or create conversation linked to this group contact
      const existingConvResult = await db.execute(sql`
        SELECT * FROM whatsapp_conversations
        WHERE instance_id = ${instance.id} AND contact_id = ${contact.id}
        LIMIT 1
      `);
      let conversation = existingConvResult.rows?.[0] || existingConvResult[0];

      if (!conversation) {
        const sectorResult = await db.execute(sql`
          SELECT id FROM sectors WHERE instance_id = ${instance.id} AND is_default = true AND is_active = true LIMIT 1
        `);
        const defaultSector = sectorResult.rows?.[0] || sectorResult[0];
        const newConvResult = await db.execute(sql`
          INSERT INTO whatsapp_conversations (instance_id, contact_id, status, unread_count, sector_id, last_message_at, last_message_preview, created_at, updated_at)
          VALUES (${instance.id}, ${contact.id}, 'active', 1, ${defaultSector?.id || null}, NOW(), ${content.substring(0,100)}, NOW(), NOW())
          RETURNING *
        `);
        conversation = newConvResult.rows?.[0] || newConvResult[0];
        
        // Dispatch webhook for new group conversation
        if (conversation) {
          dispatchServerWebhook('new_conversation', {
            conversation_id: conversation.id,
            contact_id: contact.id,
            contact_name: contact?.name || groupOnlyId,
            remote_jid: contactRemoteJid,
            instance_id: instance.id,
            instance_name: instance.name,
            sector_id: defaultSector?.id || null,
            is_group: true,
          });
        }
      } else {
        const unreadIncrement = isFromMe ? 0 : 1;
        await db.execute(sql`
          UPDATE whatsapp_conversations
          SET last_message_at = NOW(),
              last_message_preview = ${content.substring(0,100)},
              unread_count = unread_count + ${unreadIncrement},
              status = 'active',
              updated_at = NOW()
          WHERE id = ${conversation.id}
        `);
      }

      // Insert message linked to the group conversation
      const messageId = key?.id || `msg_${Date.now()}`;
      const timestamp = messageTimestamp ? new Date(messageTimestamp * 1000).toISOString() : new Date().toISOString();
      await db.execute(sql`
        INSERT INTO whatsapp_messages (
          conversation_id, remote_jid, message_id, content, message_type, media_url, media_mimetype, is_from_me, status, timestamp, created_at
        ) VALUES (
          ${conversation.id}, ${contactRemoteJid}, ${messageId}, ${content}, ${normalizedType}, ${mediaUrl}, ${mediaMimetype}, ${isFromMe}, 'received', ${timestamp}, NOW()
        ) ON CONFLICT DO NOTHING
      `);

      // Emit events
      wsEmit.messageCreated(conversation.id, {
        id: messageId,
        conversation_id: conversation.id,
        message_id: messageId,
        content,
        message_type: normalizedType,
        media_url: mediaUrl,
        media_mimetype: mediaMimetype,
        is_from_me: isFromMe,
        status: 'received',
        timestamp,
        remote_jid: contactRemoteJid,
      });

      wsEmit.conversationUpdated(instance.id, {
        id: conversation.id,
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0,100),
        unread_count: (conversation.unread_count || 0) + (isFromMe ? 0 : 1),
      });

      // Dispatch webhook for new group message (only for incoming messages)
      if (!isFromMe) {
        dispatchServerWebhook('new_message', {
          conversation_id: conversation.id,
          message_id: messageId,
          content: content.substring(0, 500),
          from_me: isFromMe,
          message_type: normalizedType,
          contact_name: contact?.name || groupOnlyId,
          remote_jid: contactRemoteJid,
          instance_id: instance.id,
          instance_name: instance.name,
          is_group: true,
        });
      }

      // Apply assignment rules and check auto-ticket for groups
      await applyAssignmentRule(conversation, isFromMe);
      await checkAndCreateAutoTicket(conversation, contact, true, isFromMe);
      
      // Check and trigger AI auto-response if configured (for groups too)
      await checkAndTriggerAIResponse(conversation, contact, isFromMe, content);

      console.log(`[handleMessageUpsert] Group message processed for group ${groupOnlyId}`);
      return;
    }

    // Skip if no identifier found
    if (!phoneNumber && !lidId) {
      console.log('No phone number or lidId found, skipping message');
      return;
    }
    
    // Check if we have media content that needs to be downloaded
    const isMediaMessage = ['imageMessage', 'audioMessage', 'videoMessage', 'documentMessage', 'stickerMessage'].some(
      mt => message?.[mt]
    );
    
    // Detect if mediaUrl is a WhatsApp CDN URL (temporary, expires quickly)
    const isWhatsAppCdnUrl = mediaUrl && (
      mediaUrl.includes('mmg.whatsapp.net') || 
      mediaUrl.includes('enc.whatsapp.net') ||
      mediaUrl.includes('.whatsapp.net/')
    );
    
    // Detect if mediaUrl is from Evolution's MinIO (internal Docker URL or external IP)
    const isEvolutionMinioUrl = mediaUrl && (
      mediaUrl.includes('minio:9000') || 
      mediaUrl.includes('localhost:9000') ||
      mediaUrl.includes('127.0.0.1:9000') ||
      mediaUrl.includes('192.168.3.39:9000') ||
      (mediaUrl.includes(':9000') && mediaUrl.includes('/evolution'))
    );
    
    // If media is from Evolution's MinIO, download and re-upload to our S3
    if (isEvolutionMinioUrl && mediaUrl) {
      console.log(`[handleMessageUpsert] Evolution MinIO URL detected: ${mediaUrl}`);
      try {
        // URL is already external, just ensure http:// prefix
        const fullUrl = mediaUrl.startsWith('http') 
          ? mediaUrl 
          : `http://${mediaUrl}`;
        
        console.log(`[handleMessageUpsert] Downloading from external URL: ${fullUrl}`);
        
        // Download the file
        const downloadResponse = await fetch(fullUrl);
        if (downloadResponse.ok) {
          const buffer = Buffer.from(await downloadResponse.arrayBuffer());
          
          // Determine extension and filename
          const urlPath = new URL(fullUrl).pathname;
          const originalFilename = urlPath.split('/').pop() || `media_${key?.id || Date.now()}`;
          
          // Get the mimetype from message or infer from extension
          const contentType = downloadResponse.headers.get('content-type') || mediaMimetype || 'application/octet-stream';
          
          // Upload to our S3
          const { uploadFile: s3UploadFile } = await import('../lib/storage');
          const s3Key = `whatsapp-media/${instance.instanceName}/${originalFilename}`;
          
          await s3UploadFile(s3Key, buffer, contentType);
          mediaUrl = s3Key;
          mediaMimetype = contentType;
          console.log(`[handleMessageUpsert] Media re-uploaded to S3 key: ${s3Key}`);
        } else {
          console.warn(`[handleMessageUpsert] Failed to download from Evolution MinIO: ${downloadResponse.status}`);
        }
      } catch (minioError) {
        console.error('[handleMessageUpsert] Error handling Evolution MinIO URL:', minioError);
      }
    }
    
    // Always fetch and save media locally if:
    // 1. No mediaUrl at all but has media content, OR
    // 2. mediaUrl is a WhatsApp CDN URL (which expires)
    if (((!mediaUrl || isWhatsAppCdnUrl) && isMediaMessage && key?.id)) {
      console.log(`[handleMessageUpsert] ${isWhatsAppCdnUrl ? 'WhatsApp CDN URL detected' : 'No mediaUrl'}, fetching from Evolution API`);
      try {
        // Get instance secrets
        const [secrets] = await db
          .select()
          .from(whatsappInstanceSecrets)
          .where(eq(whatsappInstanceSecrets.instanceId, instance.id))
          .limit(1);
        
        if (secrets) {
          const authHeader = secrets.providerType === 'cloud'
            ? { 'Authorization': `Bearer ${secrets.apiKey}` }
            : { 'apikey': secrets.apiKey };
          
          // Try to get media as base64 from Evolution API
          const mediaResponse = await fetch(
            `${secrets.apiUrl}/chat/getBase64FromMediaMessage/${instance.instanceName}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...Object.fromEntries(Object.entries(authHeader).filter(([_, v]) => v !== undefined)),
              },
              body: JSON.stringify({
                message: { key },
                convertToMp4: false,
              }),
            }
          );
          
          if (mediaResponse.ok) {
            const mediaData = await mediaResponse.json();
            if (mediaData.base64) {
              // Determine file extension from mimetype
              const mimeToExt: Record<string, string> = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'video/mp4': 'mp4',
                'video/3gpp': '3gp',
                'audio/ogg': 'ogg',
                'audio/mpeg': 'mp3',
                'audio/mp4': 'm4a',
                'application/pdf': 'pdf',
              };
              const ext = (mediaMimetype && mimeToExt[mediaMimetype]) || mediaMimetype?.split('/')[1] || 'bin';
              const fileName = `${key.id}.${ext}`;
              
              // Use correct storage path based on environment
              const baseStorageDir = process.env.NODE_ENV === 'production' ? '/app/storage' : `${process.cwd()}/../storage`;
              const storageDir = `${baseStorageDir}/whatsapp-media/${instance.instanceName}`;
              const filePath = `${storageDir}/${fileName}`;
              
              // Prefer uploading to S3/MinIO so the frontend can request a signed URL.
              const base64Data = mediaData.base64.includes(',')
                ? mediaData.base64.split(',')[1]
                : mediaData.base64;

              const buffer = Buffer.from(base64Data, 'base64');

              try {
                const { uploadFile: s3UploadFile } = await import('../lib/storage');

                // Use original document filename when available, otherwise fallback to key.id.ext
                const originalName = (message?.documentMessage?.fileName) || fileName || `${key.id}.${ext}`;
                // Sanitize filename by removing path separators
                const safeName = originalName.replace(/\\|\//g, '_');
                const s3Key = `whatsapp-media/${instance.instanceName}/${safeName}`;

                await s3UploadFile(s3Key, buffer, mediaMimetype || 'application/octet-stream');

                // Store S3 key (not a full URL) - frontend will request a signed URL via functions/get-media-signed-url
                mediaUrl = s3Key;
                console.log(`[handleMessageUpsert] Media uploaded to S3 key: ${s3Key}`);
              } catch (uploadErr) {
                console.error('[handleMessageUpsert] S3 upload failed, falling back to local storage:', uploadErr);
                // Fallback to local storage
                const fs = await import('fs');
                if (!fs.existsSync(storageDir)) {
                  fs.mkdirSync(storageDir, { recursive: true });
                }
                fs.writeFileSync(filePath, buffer);
                mediaUrl = `/storage/whatsapp-media/${instance.instanceName}/${fileName}`;
                console.log(`[handleMessageUpsert] Media saved locally as fallback: ${mediaUrl}`);
              }
            }
          } else {
            console.log(`[handleMessageUpsert] Failed to fetch media from Evolution: ${mediaResponse.status}`);
            // Keep the original WhatsApp URL as fallback if download fails
            if (isWhatsAppCdnUrl) {
              console.log('[handleMessageUpsert] Keeping WhatsApp URL as fallback');
            }
          }
        }
      } catch (mediaError) {
        console.error('[handleMessageUpsert] Error fetching media:', mediaError);
        // Keep the original URL as fallback
      }
    }
    
    // Content was already extracted above, before group check
    // Update mimetype from message if not already set
    if (!mediaMimetype) {
      if (message?.imageMessage?.mimetype) {
        mediaMimetype = message.imageMessage.mimetype;
      } else if (message?.videoMessage?.mimetype) {
        mediaMimetype = message.videoMessage.mimetype;
      } else if (message?.audioMessage?.mimetype) {
        mediaMimetype = message.audioMessage.mimetype;
      } else if (message?.documentMessage?.mimetype) {
        mediaMimetype = message.documentMessage.mimetype;
      } else if (message?.stickerMessage?.mimetype) {
        mediaMimetype = message.stickerMessage.mimetype;
      }
    }
    
    // Handle protocol messages (delete, edit, etc.)
    if (message?.protocolMessage) {
      const protoType = message.protocolMessage?.type;
      if (protoType === 5 || protoType === 'MESSAGE_EDIT') {
        console.log('[handleMessageUpsert] Skipping protocol message (edit)');
        return;
      }
    }

    // Handle reaction messages - save to whatsapp_reactions table
    if (message?.reactionMessage) {
      console.log('[handleMessageUpsert] *** REACTION MESSAGE DETECTED ***');
      console.log('[handleMessageUpsert] Full data:', JSON.stringify({ key, reactionMessage: message.reactionMessage, participant: key?.participant || data?.participant }, null, 2));
      try {
        const reactionEmoji = message.reactionMessage.text || '';
        const reactedMessageId = message.reactionMessage.key?.id;
        
        // For group messages, the reactor is in key.participant or data.participant
        // For individual chats, it's the remoteJid/senderPn
        const isGroupReaction = remoteJid && remoteJid.includes('@g.us');
        const groupParticipant = key?.participant || data?.participant || null;
        
        console.log(`[handleMessageUpsert] Emoji: "${reactionEmoji}", ReactedMessageId: ${reactedMessageId}, isGroup: ${isGroupReaction}, participant: ${groupParticipant}`);
        
        if (reactedMessageId) {
          // Find the conversation for this reacted message
          const msgResult = await db.execute(sql`
            SELECT conversation_id FROM whatsapp_messages 
            WHERE message_id = ${reactedMessageId} 
            LIMIT 1
          `);
          const msgRow = msgResult.rows?.[0] || msgResult[0];
          
          if (msgRow?.conversation_id) {
            // For groups, use participant (the person who reacted)
            // For individual chats, use remoteJid/senderPn (the contact)
            const reactorJid = isGroupReaction 
              ? (groupParticipant ? groupParticipant.replace(/@.*$/, '') : (senderPn || phoneNumber))
              : (senderPn || remoteJid?.replace(/@.*$/, '') || phoneNumber);
            
            console.log(`[handleMessageUpsert] reactorJid resolved to: ${reactorJid} (conversation_id: ${msgRow.conversation_id})`);
            
            // Always delete existing reaction from this reactor first
            await db.execute(sql`
              DELETE FROM whatsapp_reactions 
              WHERE message_id = ${reactedMessageId} 
                AND reactor_jid = ${reactorJid}
            `);
            
            // Empty emoji text means just removing the reaction (already done above)
            if (reactionEmoji.trim() !== '') {
              // Insert new reaction
              await db.execute(sql`
                INSERT INTO whatsapp_reactions (message_id, conversation_id, emoji, reactor_jid, is_from_me, created_at)
                VALUES (${reactedMessageId}, ${msgRow.conversation_id}, ${reactionEmoji}, ${reactorJid}, ${isFromMe}, NOW())
              `);
              console.log(`[handleMessageUpsert] Reaction ${reactionEmoji} saved for message ${reactedMessageId}`);
            } else {
              console.log(`[handleMessageUpsert] Reaction removed for message ${reactedMessageId}`);
            }
            
            // Emit WebSocket event for real-time updates
            wsEmit.messageUpdated(msgRow.conversation_id, {
              message_id: reactedMessageId,
              reaction: { emoji: reactionEmoji, reactor_jid: reactorJid, is_from_me: isFromMe }
            });
          } else {
            console.log(`[handleMessageUpsert] Could not find conversation for reacted message ${reactedMessageId}`);
          }
        }
      } catch (reactionError) {
        console.error('[handleMessageUpsert] Error processing reaction:', reactionError);
      }
      return;
    }
    
    // Extract quoted message ID from contextInfo (for replies)
    let quotedMessageId: string | null = null;
    const contextInfo = message?.extendedTextMessage?.contextInfo 
      || message?.imageMessage?.contextInfo 
      || message?.videoMessage?.contextInfo 
      || message?.audioMessage?.contextInfo 
      || message?.documentMessage?.contextInfo
      || message?.stickerMessage?.contextInfo;
    
    if (contextInfo?.stanzaId) {
      quotedMessageId = contextInfo.stanzaId;
      console.log(`[handleMessageUpsert] Found quoted message ID: ${quotedMessageId}`);
    }
    
    console.log(`Media extraction: url=${mediaUrl}, mimetype=${mediaMimetype}, type=${normalizedType}, phone=${phoneNumber}`)

    // 1. Find contact by priority: senderPn > remoteJid > lidId (in metadata)
    let contact: any = null;
    
    // Try to find by senderPn first (most reliable - actual phone number)
    // Check both phone_number field AND metadata->sender_pn
    if (senderPn) {
      const result = await db.execute(sql`
        SELECT * FROM whatsapp_contacts 
        WHERE instance_id = ${instance.id} 
          AND (phone_number = ${senderPn} OR metadata->>'sender_pn' = ${senderPn})
        LIMIT 1
      `);
      contact = result.rows?.[0] || result[0];
      if (contact) {
        console.log(`[handleMessageUpsert] Found contact by senderPn: ${senderPn}`);
        // Update phone_number and remote_jid if needed
        const needsUpdate = contact.phone_number !== senderPn || (remoteJid.includes('@lid') && contact.remote_jid !== remoteJid);
        if (needsUpdate) {
          const newRemoteJid = remoteJid.includes('@lid') ? remoteJid : contact.remote_jid;
          await db.execute(sql`
            UPDATE whatsapp_contacts 
            SET phone_number = ${senderPn},
                remote_jid = COALESCE(${newRemoteJid}, remote_jid),
                metadata = jsonb_set(
                  jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sender_pn}', ${JSON.stringify(senderPn)}::jsonb),
                  '{alternate_ids}', 
                  COALESCE(metadata->'alternate_ids', '[]'::jsonb) || ${JSON.stringify([contact.phone_number])}::jsonb
                ),
                updated_at = NOW()
            WHERE id = ${contact.id}
          `);
          console.log(`[handleMessageUpsert] Updated contact: phone=${senderPn}, remote_jid=${newRemoteJid}`);
        }
      }
    }
    
    // If not found by senderPn, try remoteJid phone (if different from senderPn)
    if (!contact && remoteJidPhone && remoteJidPhone !== senderPn) {
      const result = await db.execute(sql`
        SELECT * FROM whatsapp_contacts 
        WHERE instance_id = ${instance.id} AND phone_number = ${remoteJidPhone}
        LIMIT 1
      `);
      contact = result.rows?.[0] || result[0];
      if (contact) {
        console.log(`[handleMessageUpsert] Found contact by remoteJid phone: ${remoteJidPhone}`);
        // Update contact with senderPn if we have it
        if (senderPn) {
          await db.execute(sql`
            UPDATE whatsapp_contacts 
            SET phone_number = ${senderPn},
                metadata = jsonb_set(
                  jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sender_pn}', ${JSON.stringify(senderPn)}::jsonb),
                  '{alternate_ids}', 
                  COALESCE(metadata->'alternate_ids', '[]'::jsonb) || ${JSON.stringify([remoteJidPhone])}::jsonb
                ),
                updated_at = NOW()
            WHERE id = ${contact.id}
          `);
          console.log(`[handleMessageUpsert] Updated contact phone from ${remoteJidPhone} to ${senderPn}`);
        }
      }
    }
    
    // If not found, try by remote_jid field (stores @lid identifier)
    if (!contact && remoteJid) {
      const result = await db.execute(sql`
        SELECT * FROM whatsapp_contacts 
        WHERE instance_id = ${instance.id} 
          AND remote_jid = ${remoteJid}
        LIMIT 1
      `);
      contact = result.rows?.[0] || result[0];
      if (contact) {
        console.log(`[handleMessageUpsert] Found contact by remote_jid: ${remoteJid}`);
        // Update with senderPn if available
        if (senderPn && contact.phone_number !== senderPn) {
          await db.execute(sql`
            UPDATE whatsapp_contacts 
            SET phone_number = ${senderPn},
                metadata = jsonb_set(
                  jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sender_pn}', ${JSON.stringify(senderPn)}::jsonb),
                  '{alternate_ids}', 
                  COALESCE(metadata->'alternate_ids', '[]'::jsonb) || ${JSON.stringify([contact.phone_number])}::jsonb
                ),
                updated_at = NOW()
            WHERE id = ${contact.id}
          `);
          console.log(`[handleMessageUpsert] Updated contact phone from ${contact.phone_number} to ${senderPn}`);
        }
      }
    }
    
    // If not found, try lidId in metadata (legacy support)
    if (!contact && lidId) {
      const result = await db.execute(sql`
        SELECT * FROM whatsapp_contacts 
        WHERE instance_id = ${instance.id} 
          AND (phone_number = ${lidId}
               OR metadata->>'lid_id' = ${lidId} 
               OR metadata->'alternate_ids' ? ${lidId})
        LIMIT 1
      `);
      contact = result.rows?.[0] || result[0];
      if (contact) {
        console.log(`[handleMessageUpsert] Found contact by lidId (legacy): ${lidId}`);
        // Update remote_jid field and senderPn if available
        await db.execute(sql`
          UPDATE whatsapp_contacts 
          SET remote_jid = ${remoteJid},
              phone_number = COALESCE(${senderPn}, phone_number),
              metadata = jsonb_set(
                jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sender_pn}', ${JSON.stringify(senderPn || '')}::jsonb),
                '{alternate_ids}', 
                COALESCE(metadata->'alternate_ids', '[]'::jsonb) || ${JSON.stringify([contact.phone_number])}::jsonb
              ),
              updated_at = NOW()
          WHERE id = ${contact.id}
        `);
        console.log(`[handleMessageUpsert] Updated contact with remote_jid: ${remoteJid}`);
      }
    }
    
    // HEURISTIC: If still not found and we have lidId (incoming message without senderPn),
    // check if there's an active conversation with a message sent TO a contact recently
    // This handles the case where agent sends to phone@s.whatsapp.net but client responds via @lid
    if (!contact && lidId && !senderPn && !isFromMe) {
      console.log(`[handleMessageUpsert] Trying heuristic: looking for active conversation with recent outbound message`);
      
      // Find active conversations with messages sent by agent in the last 30 minutes
      // where the contact doesn't have a remote_jid yet
      const heuristicResult = await db.execute(sql`
        SELECT DISTINCT ct.* FROM whatsapp_contacts ct
        JOIN whatsapp_conversations conv ON conv.contact_id = ct.id
        JOIN whatsapp_messages m ON m.conversation_id = conv.id
        WHERE conv.instance_id = ${instance.id}
          AND conv.status != 'resolved'
          AND m.is_from_me = true
          AND m.created_at > NOW() - INTERVAL '30 minutes'
          AND ct.phone_number != ${lidId}
          AND ct.remote_jid IS NULL
        ORDER BY m.created_at DESC
        LIMIT 1
      `);
      
      const potentialContact = heuristicResult.rows?.[0] || heuristicResult[0];
      if (potentialContact) {
        console.log(`[handleMessageUpsert] Heuristic found potential contact: ${potentialContact.phone_number} (${potentialContact.name}), linking with remote_jid: ${remoteJid}`);
        
        // Update the existing contact to include this remote_jid and lidId
        await db.execute(sql`
          UPDATE whatsapp_contacts 
          SET remote_jid = ${remoteJid},
              metadata = jsonb_set(
                jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lid_id}', ${JSON.stringify(lidId)}::jsonb),
                '{alternate_ids}', 
                COALESCE(metadata->'alternate_ids', '[]'::jsonb) || ${JSON.stringify([lidId])}::jsonb
              ),
              updated_at = NOW()
          WHERE id = ${potentialContact.id}
        `);
        
        contact = potentialContact;
        console.log(`[handleMessageUpsert] Heuristic: Associated remote_jid ${remoteJid} with existing contact ${contact.phone_number}`);
      }
    }
    
    // If still not found, create new contact
    if (!contact) {
      // Prefer senderPn as phone_number, fall back to remoteJidPhone, then lidId
      const contactPhone = senderPn || remoteJidPhone || lidId || '';
      // Store @lid remoteJid in dedicated field
      const contactRemoteJid = remoteJid.includes('@lid') ? remoteJid : null;
      const metadata = {
        lid_id: lidId,
        sender_pn: senderPn,
        alternate_ids: [senderPn, remoteJidPhone, lidId].filter((v, i, a) => v && a.indexOf(v) === i), // unique values only
      };
      
      console.log(`[handleMessageUpsert] Creating new contact with phone=${contactPhone}, remote_jid=${contactRemoteJid}`);
      
      // Perform upsert without relying on ON CONFLICT to avoid DB errors when
      // the required unique index is missing in some environments.
      const existingRes = await db.execute(sql`
        SELECT * FROM whatsapp_contacts WHERE instance_id = ${instance.id} AND phone_number = ${contactPhone} LIMIT 1
      `);
      const existing = existingRes.rows?.[0] || existingRes[0];

      if (existing) {
        // Merge metadata and update remote_jid/name if needed
        const mergedMetadata = JSON.stringify({
          ...((existing.metadata) || {}),
          ...metadata,
          alternate_ids: Array.from(new Set([...(existing.metadata?.alternate_ids || []), ...(metadata.alternate_ids || [])].filter(Boolean)))
        });

        await db.execute(sql`
          UPDATE whatsapp_contacts
          SET remote_jid = COALESCE(${contactRemoteJid}, remote_jid),
              name = COALESCE(${pushName}, name),
              metadata = ${mergedMetadata}::jsonb,
              updated_at = NOW()
          WHERE id = ${existing.id}
        `);

        const refreshed = await db.execute(sql`SELECT * FROM whatsapp_contacts WHERE id = ${existing.id} LIMIT 1`);
        contact = refreshed.rows?.[0] || refreshed[0];
      } else {
        const insertRes = await db.execute(sql`
          INSERT INTO whatsapp_contacts (instance_id, phone_number, remote_jid, name, is_group, metadata, created_at, updated_at)
          VALUES (${instance.id}, ${contactPhone}, ${contactRemoteJid}, ${pushName}, false, ${JSON.stringify(metadata)}::jsonb, NOW(), NOW())
          RETURNING *
        `);
        contact = insertRes.rows?.[0] || insertRes[0];
      }
      console.log(`[handleMessageUpsert] Created/upserted contact: ${contactPhone}, id=${contact?.id}`);
    } else {
      // Update contact name if pushName is available and different
      if (pushName && contact.name !== pushName) {
        await db.execute(sql`
          UPDATE whatsapp_contacts 
          SET name = ${pushName}, updated_at = NOW()
          WHERE id = ${contact.id}
        `);
      }
      
      // If this is an outgoing message (is_from_me=true), update contact metadata with remote_jid
      // This helps link the contact's phone number with any @lid or other identifiers in responses
      if (isFromMe && remoteJid) {
        const currentMetadata = contact.metadata || {};
        const lastRemoteJid = currentMetadata.last_remote_jid;
        
        // Only update if different from current
        if (lastRemoteJid !== remoteJid) {
          await db.execute(sql`
            UPDATE whatsapp_contacts 
            SET metadata = jsonb_set(
                  COALESCE(metadata, '{}'::jsonb), 
                  '{last_remote_jid}', 
                  ${JSON.stringify(remoteJid)}::jsonb
                ),
                updated_at = NOW()
            WHERE id = ${contact.id}
          `);
          console.log(`[handleMessageUpsert] Updated contact metadata with last_remote_jid: ${remoteJid}`);
        }
      }
    }
    
    if (!contact) {
      console.error('Failed to get/create contact');
      return;
    }

    // 2. Find or create conversation
    const existingConvResult = await db.execute(sql`
      SELECT * FROM whatsapp_conversations 
      WHERE instance_id = ${instance.id} AND contact_id = ${contact.id}
      LIMIT 1
    `);
    
    let conversation = existingConvResult.rows?.[0] || existingConvResult[0];
    
    if (!conversation) {
      // Get default sector for this instance
      const sectorResult = await db.execute(sql`
        SELECT id FROM sectors 
        WHERE instance_id = ${instance.id} AND is_default = true AND is_active = true
        LIMIT 1
      `);
      const defaultSector = sectorResult.rows?.[0] || sectorResult[0];
      
      const newConvResult = await db.execute(sql`
        INSERT INTO whatsapp_conversations (instance_id, contact_id, status, unread_count, sector_id, last_message_at, last_message_preview, created_at, updated_at)
        VALUES (${instance.id}, ${contact.id}, 'active', 1, ${defaultSector?.id || null}, NOW(), ${content.substring(0, 100)}, NOW(), NOW())
        RETURNING *
      `);
      conversation = newConvResult.rows?.[0] || newConvResult[0];
      
      // Dispatch webhook for new conversation
      if (conversation) {
        dispatchServerWebhook('new_conversation', {
          conversation_id: conversation.id,
          contact_id: contact.id,
          contact_name: contact?.name || null,
          contact_phone: phoneNumber,
          remote_jid: remoteJid,
          instance_id: instance.id,
          instance_name: instance.name,
          sector_id: defaultSector?.id || null,
        });
      }
    } else {
      // Update conversation
      const unreadIncrement = isFromMe ? 0 : 1;
      await db.execute(sql`
        UPDATE whatsapp_conversations
        SET 
          last_message_at = NOW(),
          last_message_preview = ${content.substring(0, 100)},
          unread_count = unread_count + ${unreadIncrement},
          status = 'active',
          updated_at = NOW()
        WHERE id = ${conversation.id}
      `);
    }

    if (!conversation) {
      console.error('Failed to get/create conversation');
      return;
    }

    // 3. Insert message (check if already exists by message_id)
    const messageId = key?.id || `msg_${Date.now()}`;
    const timestamp = messageTimestamp 
      ? new Date(messageTimestamp * 1000).toISOString()
      : new Date().toISOString();

    await db.execute(sql`
      INSERT INTO whatsapp_messages (
        conversation_id, remote_jid, message_id, content, message_type, 
        media_url, media_mimetype, is_from_me, status, timestamp, quoted_message_id, created_at
      )
      VALUES (
        ${conversation.id}, ${remoteJid}, ${messageId}, ${content}, ${normalizedType},
        ${mediaUrl}, ${mediaMimetype}, ${isFromMe}, 'received', ${timestamp}, ${quotedMessageId}, NOW()
      )
      ON CONFLICT DO NOTHING
    `);

    console.log(`Message saved: ${messageId} from ${phoneNumber} type=${normalizedType} (media: ${mediaUrl ? 'yes' : 'no'}) quoted=${quotedMessageId || 'none'}`);
    
    // Emit WebSocket event for real-time updates
    wsEmit.messageCreated(conversation.id, {
      id: messageId,
      conversation_id: conversation.id,
      message_id: messageId,
      content,
      message_type: normalizedType,
      media_url: mediaUrl,
      media_mimetype: mediaMimetype,
      is_from_me: isFromMe,
      status: 'received',
      timestamp,
      remote_jid: remoteJid,
      quoted_message_id: quotedMessageId,
    });
    
    // Also emit conversation update
    wsEmit.conversationUpdated(instance.id, {
      id: conversation.id,
      last_message_at: new Date().toISOString(),
      last_message_preview: content.substring(0, 100),
      unread_count: (conversation.unread_count || 0) + (isFromMe ? 0 : 1),
    });

    // Dispatch webhook for new message (only for incoming messages from customers)
    if (!isFromMe) {
      dispatchServerWebhook('new_message', {
        conversation_id: conversation.id,
        message_id: messageId,
        content: content.substring(0, 500),
        from_me: isFromMe,
        message_type: normalizedType,
        contact_phone: phoneNumber,
        contact_name: contact?.name || null,
        remote_jid: remoteJid,
        instance_id: instance.id,
        instance_name: instance.name,
      });
    }

    // Check and create auto-ticket if sector is configured for it
    // Refresh conversation to get sector_id
    const refreshedConvResult = await db.execute(sql`
      SELECT * FROM whatsapp_conversations WHERE id = ${conversation.id} LIMIT 1
    `);
    const refreshedConv = refreshedConvResult.rows?.[0] || refreshedConvResult[0];
    
    if (refreshedConv) {
      // Apply assignment rules and check auto-ticket for individual conversations
      await applyAssignmentRule(refreshedConv, isFromMe);
      await checkAndCreateAutoTicket(refreshedConv, contact, false, isFromMe);
      
      // Check and trigger AI auto-response if configured
      await checkAndTriggerAIResponse(refreshedConv, contact, isFromMe, content);
    }
  } catch (error) {
    console.error('Error handling message upsert:', error);
  }
}

async function handleMessageUpdate(instance: any, data: any) {
  // Handle message status updates (delivery, read receipts, etc.)
  // Evolution sends updates like:
  // - status: "DELIVERY_ACK" (delivered)
  // - status: "READ" (read by recipient)
  // - status: "PLAYED" (audio played)
  
  try {
    console.log('[handleMessageUpdate] Received update:', JSON.stringify(data, null, 2));
    
    // data can be an array or a single object
    const updates = Array.isArray(data) ? data : [data];
    
    for (const update of updates) {
      // Extract message ID and status from various Evolution formats
      // Evolution sends different IDs:
      // - keyId: The WhatsApp key ID (e.g., "3EB0...") - this is what we store as message_id
      // - messageId: Evolution's internal ID
      // - key.id: WhatsApp key ID in nested format
      const keyId = update.keyId || update.key?.id || update.id?.id;
      const evolutionMessageId = update.messageId;
      const remoteJid = update.key?.remoteJid || update.id?.remoteJid || update.remoteJid;
      
      // Status can be in different places depending on Evolution version
      let status = update.status || update.update?.status;
      
      // Convert status numbers to string if needed
      if (typeof status === 'number') {
        // WhatsApp status codes: 0=error, 1=pending, 2=server ack, 3=delivery ack/delivered, 4=read, 5=played
        const statusMap: Record<number, string> = {
          0: 'error',
          1: 'pending', 
          2: 'sent',
          3: 'delivered',
          4: 'read',
          5: 'read',  // played is also considered read for our purposes
        };
        status = statusMap[status] || 'sent';
      } else if (typeof status === 'string') {
        // Convert Evolution status strings to our format
        const statusStringMap: Record<string, string> = {
          'DELIVERY_ACK': 'delivered',
          'READ': 'read',
          'PLAYED': 'read',
          'SERVER_ACK': 'sent',
          'PENDING': 'sending',
          'ERROR': 'error',
        };
        status = statusStringMap[status.toUpperCase()] || status.toLowerCase();
      }
      
      if (!keyId && !evolutionMessageId) {
        console.log('[handleMessageUpdate] No message ID found in update, skipping');
        continue;
      }
      
      // Status priority map - higher number = more advanced status
      // We should NEVER downgrade a status (e.g., from 'read' back to 'sent')
      const statusPriority: Record<string, number> = {
        'error': 0,
        'pending': 1,
        'sending': 2,
        'sent': 3,
        'delivered': 4,
        'read': 5,
      };
      
      const newPriority = statusPriority[status] ?? 3;
      
      console.log(`[handleMessageUpdate] Updating message keyId=${keyId} evolutionId=${evolutionMessageId} to status: ${status} (priority: ${newPriority})`);
      
      // Try to update by keyId first (this is what we store as message_id from Evolution responses)
      // Only update if new status is higher priority than current
      let updated: any = null;
      
      // Try update by known identifiers. Attempt several strategies to handle
      // cases where message was stored under a different id or metadata contains
      // the evolution key.
      if (keyId) {
        const result = await db.execute(sql`
          UPDATE whatsapp_messages
          SET status = ${status}
          WHERE message_id = ${keyId}
            AND COALESCE(
              CASE status
                WHEN 'error' THEN 0
                WHEN 'pending' THEN 1
                WHEN 'sending' THEN 2
                WHEN 'sent' THEN 3
                WHEN 'delivered' THEN 4
                WHEN 'read' THEN 5
                ELSE 3
              END, 0
            ) < ${newPriority}
          RETURNING id, conversation_id, status as old_status
        `);
        updated = result.rows?.[0] || result[0];
      }

      // If not found by keyId, try evolutionMessageId
      if (!updated && evolutionMessageId) {
        const result = await db.execute(sql`
          UPDATE whatsapp_messages
          SET status = ${status}
          WHERE message_id = ${evolutionMessageId}
            AND COALESCE(
              CASE status
                WHEN 'error' THEN 0
                WHEN 'pending' THEN 1
                WHEN 'sending' THEN 2
                WHEN 'sent' THEN 3
                WHEN 'delivered' THEN 4
                WHEN 'read' THEN 5
                ELSE 3
              END, 0
            ) < ${newPriority}
          RETURNING id, conversation_id, status as old_status
        `);
        updated = result.rows?.[0] || result[0];
      }

      // If still not found, attempt to match by metadata that may include the
      // evolution response (e.g., metadata->'evolutionResponse'). This handles
      // cases where the stored message_id differs but evolution key is embedded
      // in the metadata JSON.
      if (!updated && keyId) {
        try {
          const metaMatch = await db.execute(sql`
            UPDATE whatsapp_messages
            SET status = ${status}
            WHERE metadata::text LIKE ${'%' + keyId + '%'}
              AND COALESCE(
                CASE status
                  WHEN 'error' THEN 0
                  WHEN 'pending' THEN 1
                  WHEN 'sending' THEN 2
                  WHEN 'sent' THEN 3
                  WHEN 'delivered' THEN 4
                  WHEN 'read' THEN 5
                  ELSE 3
                END, 0
              ) < ${newPriority}
            RETURNING id, conversation_id, message_id, metadata
          `);
          updated = metaMatch.rows?.[0] || metaMatch[0];
        } catch (e) {
          // ignore metadata search errors
        }
      }
      
      if (updated) {
        console.log(`[handleMessageUpdate] Message updated to ${status}, id=${updated.id}`);
        
        // Handle read participants for groups (Evolution sends participant info in group read receipts)
        const participant = update.participant || update.key?.participant;
        if (status === 'read' && participant && remoteJid?.includes('@g.us')) {
          // This is a group read receipt - track who read the message
          try {
            const readParticipant = {
              jid: participant,
              timestamp: new Date().toISOString(),
            };
            
            // Append to read_participants array (avoid duplicates)
            await db.execute(sql`
              UPDATE whatsapp_messages
              SET read_participants = CASE
                WHEN read_participants IS NULL THEN ${JSON.stringify([readParticipant])}::jsonb
                WHEN NOT (read_participants @> ${JSON.stringify([{ jid: participant }])}::jsonb)
                THEN read_participants || ${JSON.stringify(readParticipant)}::jsonb
                ELSE read_participants
              END
              WHERE id = ${updated.id}
            `);
            console.log(`[handleMessageUpdate] Added read participant ${participant} to message ${updated.id}`);
          } catch (rpErr) {
            console.warn('[handleMessageUpdate] Failed to update read_participants:', rpErr);
          }
        }
        
        // Emit WebSocket event for real-time status update
        wsEmit.messageStatusChanged(updated.conversation_id, updated.id, status);
        
        // Dispatch webhook for message status changes
        if (status === 'delivered') {
          webhookEvents.messageDelivered(keyId || evolutionMessageId, updated.conversation_id);
        } else if (status === 'read') {
          // Outgoing read: We sent message, they (recipient) read it
          webhookEvents.messageRead(keyId || evolutionMessageId, updated.conversation_id, 'outgoing_read', 'recipient');
          
          // Also notify fallback API for read status
          const msgId = keyId || evolutionMessageId;
          if (msgId) {
            try {
              const fallbackUrl = `http://192.168.3.39:8088/messages/${msgId}/read`;
              fetch(fallbackUrl, {
                method: 'POST',
                headers: { 'accept': 'application/json' },
                signal: AbortSignal.timeout(3000),
              }).then(resp => {
                if (resp.ok) {
                  console.log(`[handleMessageUpdate] Fallback API notified for read status: ${msgId}`);
                }
              }).catch(() => {});
            } catch (e) {
              // Silent fail for fallback
            }
          }
        }
        
        // If message was read, we might want to update conversation unread count
        // but only if it's an incoming message being marked as read by us
        if (status === 'read' && updated.conversation_id) {
          // Note: This handles the case where WE sent a message and THEY read it
          // The client marking messages as read is handled separately in mark-messages-read
          console.log(`[handleMessageUpdate] Message marked as read in conversation ${updated.conversation_id}`);
        }
      } else {
        // Check if message exists but wasn't updated because current status is already higher
        let existingMsg: any = null;
        if (keyId) {
          const check = await db.execute(sql`
            SELECT id, status, conversation_id FROM whatsapp_messages WHERE message_id = ${keyId}
          `);
          existingMsg = check.rows?.[0] || check[0];
        }
        if (!existingMsg && evolutionMessageId) {
          const check = await db.execute(sql`
            SELECT id, status, conversation_id FROM whatsapp_messages WHERE message_id = ${evolutionMessageId}
          `);
          existingMsg = check.rows?.[0] || check[0];
        }
        
        if (existingMsg) {
          const currentPriority = statusPriority[existingMsg.status] ?? 0;
          console.log(`[handleMessageUpdate] Message found but status NOT updated: current=${existingMsg.status}(${currentPriority}) >= new=${status}(${newPriority})`);
        } else {
          console.log(`[handleMessageUpdate] Message not found in database (keyId=${keyId}, evolutionId=${evolutionMessageId})`);
        }
        try {
          // Try to fetch recent messages for the same remoteJid to aid debugging
          if (remoteJid) {
            const recent = await db.execute(sql`
              SELECT id, message_id, remote_jid, content, metadata, created_at
              FROM whatsapp_messages
              WHERE remote_jid = ${remoteJid}
              ORDER BY created_at DESC
              LIMIT 10
            `);
            console.log('[handleMessageUpdate] Recent messages for remoteJid:', remoteJid, recent.rows || recent);
          } else {
            const recentAll = await db.execute(sql`
              SELECT id, message_id, remote_jid, content, metadata, created_at
              FROM whatsapp_messages
              ORDER BY created_at DESC
              LIMIT 10
            `);
            console.log('[handleMessageUpdate] Recent messages (global):', recentAll.rows || recentAll);
          }
        } catch (dbgErr) {
          console.warn('[handleMessageUpdate] Failed to fetch recent messages for debug:', dbgErr);
        }
      }
    }
  } catch (error) {
    console.error('[handleMessageUpdate] Error processing message update:', error);
  }
}

async function handleMessageDelete(instance: any, data: any) {
  // Handle message deletion from WhatsApp (user deleted their message)
  // Evolution sends different formats:
  // - data.id: message ID directly at root
  // - data.key.id: message ID in key object
  // - data.remoteJid: contact JID
  // - data.fromMe: whether it was our message
  
  try {
    console.log('[handleMessageDelete] Received delete event:', JSON.stringify(data, null, 2));
    
    const deletes = Array.isArray(data) ? data : [data];
    
    for (const del of deletes) {
      // Try multiple paths for message ID (Evolution sends different formats)
      const messageId = del.id || del.key?.id || del.id?.id || del.messageId || del.keyId;
      const remoteJid = del.remoteJid || del.key?.remoteJid || del.id?.remoteJid;
      const fromMe = del.fromMe ?? del.key?.fromMe ?? del.id?.fromMe;
      
      if (!messageId) {
        console.log('[handleMessageDelete] No message ID found in delete event, skipping');
        continue;
      }
      
      console.log(`[handleMessageDelete] Marking message ${messageId} as deleted (fromMe: ${fromMe}, remoteJid: ${remoteJid})`);
      
      // Ensure fromMe is a proper boolean for SQL - use string for JSON
      const fromMeString = fromMe === true ? 'true' : 'false';
      
      // Find and soft-delete the message
      // Note: deleted_by is NULL to indicate it was deleted by the WhatsApp user, not an agent
      const result = await db.execute(sql`
        UPDATE whatsapp_messages
        SET deleted = true,
            deleted_at = NOW(),
            deleted_by = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'deleted_via_whatsapp', true,
              'deleted_from_me', ${fromMeString}::boolean
            )
        WHERE message_id = ${messageId}
        RETURNING id, conversation_id, content, is_from_me
      `);
      
      const updated = result.rows?.[0] || result[0];
      
      if (updated) {
        console.log(`[handleMessageDelete] Message ${messageId} marked as deleted`);
        
        // Emit WebSocket event for real-time update
        wsEmit.messageUpdated(updated.conversation_id, {
          ...updated,
          deleted: true,
          deleted_at: new Date().toISOString(),
        });
        
        // Create internal note about the deletion
        const deletedBy = updated.is_from_me ? 'O atendente' : 'O usuário';
        const noteContent = `🗑️ ${deletedBy} apagou uma mensagem via WhatsApp\n\nConteúdo original: "${updated.content?.substring(0, 150) || '[sem conteúdo]'}${(updated.content?.length || 0) > 150 ? '...' : ''}"`;
        
        const noteMessageId = 'internal_wa_delete_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const noteResult = await db.execute(sql`
          INSERT INTO whatsapp_messages (
            conversation_id, content, message_type, is_from_me, is_internal, 
            message_id, remote_jid, timestamp, status
          ) VALUES (
            ${updated.conversation_id}, 
            ${noteContent}, 
            'text', 
            true, 
            true, 
            ${noteMessageId},
            ${remoteJid || 'unknown'},
            NOW(), 
            'sent'
          )
          RETURNING *
        `);
        
        const noteMessage = noteResult.rows?.[0] || noteResult[0];
        if (noteMessage) {
          // Emit WebSocket event for the internal note
          wsEmit.messageCreated(noteMessage.conversation_id, noteMessage);
          console.log(`[handleMessageDelete] Internal note created for deleted message ${messageId}`);
        }
      } else {
        console.log(`[handleMessageDelete] Message ${messageId} not found in database`);
      }
    }
  } catch (error) {
    console.error('[handleMessageDelete] Error:', error);
  }
}

async function handleConnectionUpdate(instance: any, data: any) {
  // Implementation for connection update webhook
  console.log('Handling connection update:', data);
  await db
    .update(whatsappInstances)
    .set({
      status: data.state === 'open' ? 'connected' : 'disconnected',
      updatedAt: new Date(),
    })
    .where(eq(whatsappInstances.id, instance.id));
}

// Periodic background job to check hybrid conversations and trigger AI when timeout expires
async function processHybridTimeouts() {
  try {
    console.log('[processHybridTimeouts] Running hybrid timeout checker');
    const res = await db.execute(sql`
      SELECT c.*,
             ac.hybrid_timeout_minutes
      FROM whatsapp_conversations c
      JOIN ai_agent_configs ac ON ac.sector_id = c.sector_id
      WHERE c.conversation_mode = 'hybrid'
        AND ac.is_enabled = true
        AND ac.auto_reply_enabled = true
    `);
    const convs = res.rows || res;
    for (const conv of convs) {
      try {
        // last customer message
        const lastCustRes = await db.execute(sql`
          SELECT content, created_at FROM whatsapp_messages
          WHERE conversation_id = ${conv.id}
            AND is_from_me = false
          ORDER BY created_at DESC
          LIMIT 1
        `);
        const lastCust = (lastCustRes.rows || lastCustRes)[0];
        if (!lastCust) continue;

        // last human response (exclude AI)
        const lastHumanRes = await db.execute(sql`
          SELECT created_at FROM whatsapp_messages
          WHERE conversation_id = ${conv.id}
            AND is_from_me = true
            AND (metadata->>'sender' IS NULL OR metadata->>'sender' != 'ai')
          ORDER BY created_at DESC
          LIMIT 1
        `);
        const lastHuman = (lastHumanRes.rows || lastHumanRes)[0];

        const lastCustomerTime = new Date(lastCust.created_at);
        const lastHumanTime = lastHuman ? new Date(lastHuman.created_at) : null;

        // if human replied after customer's last message, skip
        if (lastHumanTime && lastHumanTime.getTime() > lastCustomerTime.getTime()) continue;

        const now = new Date();
        const diffMinutes = (now.getTime() - lastCustomerTime.getTime()) / (1000 * 60);
        const timeoutMin = conv.hybrid_timeout_minutes || 5;
        if (diffMinutes >= timeoutMin) {
          // fetch contact for context
          const contactRes = await db.execute(sql`
            SELECT * FROM whatsapp_contacts WHERE id = ${conv.contact_id} LIMIT 1
          `);
          const contact = (contactRes.rows || contactRes)[0];

          // call checkAndTriggerAIResponse with last customer message content
          console.log(`[processHybridTimeouts] Triggering AI for conversation ${conv.id} (last customer ${diffMinutes.toFixed(1)} min ago)`);
          await checkAndTriggerAIResponse(conv, contact, false, lastCust.content || '');
        }
      } catch (err) {
        console.error('[processHybridTimeouts] Error processing conversation', conv.id, err);
      }
    }
  } catch (error) {
    console.error('[processHybridTimeouts] Error fetching conversations', error);
  }
}

// Start checker every 60 seconds
try {
  setInterval(processHybridTimeouts, 60 * 1000);
  // run once shortly after startup
  setTimeout(() => processHybridTimeouts().catch((e) => console.error('Initial hybrid checker error', e)), 5 * 1000);
} catch (e) {
  console.error('Failed to start hybrid timeout checker', e);
}

// Export internal function for use by ticket routes
export { sendWhatsAppMessageInternal };
export default router;
