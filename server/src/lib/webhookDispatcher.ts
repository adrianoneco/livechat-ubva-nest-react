import { Pool } from 'pg';
import crypto from 'crypto';

// Database pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'livechat',
});

export type WebhookEventType =
  | 'new_conversation'
  | 'conversation_reopened'
  | 'new_message'
  | 'message_sent'
  | 'message_delivered'
  | 'message_read'
  | 'conversation_closed'
  | 'contact_created'
  | 'contact_updated'
  | 'ticket_created'
  | 'ticket_closed'
  | 'ticket_assigned'
  | 'ticket_sla_warning'
  | 'ticket_sla_violated'
  | 'feedback_received'
  | 'lead_created'
  | 'lead_status_changed'
  | 'lead_assigned'
  | 'lead_converted'
  | 'opportunity_created'
  | 'opportunity_won'
  | 'opportunity_lost'
  | 'campaign_started'
  | 'campaign_completed'
  | 'campaign_message_sent'
  | 'campaign_message_failed'
  | 'ai_response_sent'
  | 'ai_escalation'
  | 'ai_intent_detected'
  | 'sentiment_analyzed'
  | 'instance_connected'
  | 'instance_disconnected'
  | 'user_login'
  | 'user_created';

interface DispatchResult {
  webhookId: string;
  name: string;
  success: boolean;
  statusCode: number | null;
  error: string | null;
}

/**
 * Dispatch a webhook event to all subscribed endpoints
 * This is the backend version that runs server-side
 * @param event The event type to dispatch
 * @param data The payload data to send
 */
export async function dispatchWebhook(
  event: WebhookEventType,
  data: Record<string, any>
): Promise<{ success: boolean; dispatched: number; results: DispatchResult[] }> {
  try {
    console.log(`[webhookDispatcher] Dispatching event: ${event}`);

    // Query active webhooks that subscribe to this event
    const webhooksResult = await pool.query(
      `SELECT id, name, url, secret, headers, retry_count, retry_delay 
       FROM webhooks 
       WHERE is_active = true 
       AND (events IS NULL OR $1 = ANY(events))`,
      [event]
    );

    const webhooks = webhooksResult.rows;

    if (webhooks.length === 0) {
      console.log(`[webhookDispatcher] No webhooks subscribed to ${event}`);
      return { success: true, dispatched: 0, results: [] };
    }

    console.log(`[webhookDispatcher] Found ${webhooks.length} webhooks for event: ${event}`);

    // Prepare payload
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data: data || {}
    };
    const payloadString = JSON.stringify(payload);

    // Dispatch to each webhook (fire-and-forget for non-blocking)
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
            console.warn(`[webhookDispatcher] Invalid custom headers for webhook ${webhook.id}`);
          }
        }

        // Send webhook with retry logic
        const maxRetries = webhook.retry_count || 3;
        const retryDelay = webhook.retry_delay || 1000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
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
              console.log(`[webhookDispatcher] Successfully sent to ${webhook.name} (${webhook.url})`);
              break;
            } else {
              errorMessage = `HTTP ${statusCode}: ${responseBody?.substring(0, 200)}`;
              console.warn(`[webhookDispatcher] Failed attempt ${attempt} for ${webhook.name}: ${errorMessage}`);
            }
          } catch (fetchError: any) {
            errorMessage = fetchError.message || 'Network error';
            console.warn(`[webhookDispatcher] Network error attempt ${attempt} for ${webhook.name}: ${errorMessage}`);
          }

          // Wait before retry (if not last attempt)
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          }
        }
      } catch (error: any) {
        errorMessage = error.message || 'Unknown error';
        console.error(`[webhookDispatcher] Error dispatching to ${webhook.name}:`, error);
      }

      const duration = Date.now() - startTime;

      // Log the webhook dispatch (fire-and-forget)
      pool.query(
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
      ).catch(logError => {
        console.error(`[webhookDispatcher] Failed to log webhook dispatch:`, logError);
      });

      return { webhookId: webhook.id, name: webhook.name, success, statusCode, error: errorMessage };
    });

    // Execute all dispatches in parallel (don't wait)
    Promise.all(dispatchPromises).then(results => {
      const successCount = results.filter(r => r.success).length;
      console.log(`[webhookDispatcher] Dispatched ${event} to ${results.length} webhooks, ${successCount} successful`);
    }).catch(err => {
      console.error(`[webhookDispatcher] Error in batch dispatch:`, err);
    });

    return { success: true, dispatched: webhooks.length, results: [] };
  } catch (error) {
    console.error('[webhookDispatcher] Error:', error);
    return { success: false, dispatched: 0, results: [] };
  }
}

/**
 * Helper object with typed event methods for common webhook events
 */
export const webhookEvents = {
  // WhatsApp events
  newConversation: (conversationId: string, contactName: string, instanceId: string) =>
    dispatchWebhook('new_conversation', { conversation_id: conversationId, contact_name: contactName, instance_id: instanceId }),

  conversationReopened: (conversationId: string, contactName: string, instanceId: string, previousTicketNumber?: number) =>
    dispatchWebhook('conversation_reopened', { conversation_id: conversationId, contact_name: contactName, instance_id: instanceId, previous_ticket_number: previousTicketNumber }),

  newMessage: (conversationId: string, messageId: string, content: string, fromMe: boolean, contactName?: string) =>
    dispatchWebhook('new_message', { conversation_id: conversationId, message_id: messageId, content, from_me: fromMe, contact_name: contactName }),

  messageSent: (conversationId: string, messageId: string, content: string) =>
    dispatchWebhook('message_sent', { conversation_id: conversationId, message_id: messageId, content }),

  messageDelivered: (messageId: string, conversationId?: string) =>
    dispatchWebhook('message_delivered', { message_id: messageId, conversation_id: conversationId }),

  /**
   * Bidirectional message read event
   * @param messageId - The message ID
   * @param conversationId - The conversation ID
   * @param direction - 'outgoing_read' (we sent, they read) or 'incoming_read' (they sent, we read)
   * @param readBy - Who marked as read: 'recipient' (remote user) or 'user' (our system/user)
   */
  messageRead: (messageId: string, conversationId?: string, direction?: 'outgoing_read' | 'incoming_read', readBy?: 'recipient' | 'user') =>
    dispatchWebhook('message_read', { 
      message_id: messageId, 
      conversation_id: conversationId,
      direction: direction || 'unknown',
      read_by: readBy || 'unknown',
      read_at: new Date().toISOString()
    }),

  conversationClosed: (conversationId: string, closedBy: string) =>
    dispatchWebhook('conversation_closed', { conversation_id: conversationId, closed_by: closedBy }),

  contactCreated: (contactId: string, name: string, phone: string) =>
    dispatchWebhook('contact_created', { contact_id: contactId, name, phone }),

  contactUpdated: (contactId: string, changes: Record<string, any>) =>
    dispatchWebhook('contact_updated', { contact_id: contactId, changes }),

  // Ticket events
  ticketCreated: (ticketId: string, conversationId: string, ticketNumber: number) =>
    dispatchWebhook('ticket_created', { ticket_id: ticketId, conversation_id: conversationId, ticket_number: ticketNumber }),

  ticketClosed: (ticketId: string, ticketNumber: number, closedBy: string) =>
    dispatchWebhook('ticket_closed', { ticket_id: ticketId, ticket_number: ticketNumber, closed_by: closedBy }),

  ticketAssigned: (ticketId: string, ticketNumber: number, assigneeId: string, assigneeName: string) =>
    dispatchWebhook('ticket_assigned', { ticket_id: ticketId, ticket_number: ticketNumber, assignee_id: assigneeId, assignee_name: assigneeName }),

  // Lead events
  leadCreated: (leadId: string, name: string, source: string) =>
    dispatchWebhook('lead_created', { lead_id: leadId, name, source }),

  leadStatusChanged: (leadId: string, oldStatus: string, newStatus: string) =>
    dispatchWebhook('lead_status_changed', { lead_id: leadId, old_status: oldStatus, new_status: newStatus }),

  // AI events
  aiResponseSent: (conversationId: string, response: string) =>
    dispatchWebhook('ai_response_sent', { conversation_id: conversationId, response }),

  aiEscalation: (conversationId: string, reason: string) =>
    dispatchWebhook('ai_escalation', { conversation_id: conversationId, reason }),

  // System events
  instanceConnected: (instanceId: string, instanceName: string) =>
    dispatchWebhook('instance_connected', { instance_id: instanceId, instance_name: instanceName }),

  instanceDisconnected: (instanceId: string, instanceName: string, reason?: string) =>
    dispatchWebhook('instance_disconnected', { instance_id: instanceId, instance_name: instanceName, reason }),
};
