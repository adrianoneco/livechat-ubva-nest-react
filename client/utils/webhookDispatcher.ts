import { invokeFunction } from '@/lib/api';

export type WebhookEventType =
  // WhatsApp events
  | 'new_conversation'
  | 'conversation_reopened'
  | 'new_message'
  | 'message_sent'
  | 'message_delivered'
  | 'message_read'
  | 'conversation_closed'
  | 'contact_created'
  | 'contact_updated'
  // Ticket events
  | 'ticket_created'
  | 'ticket_closed'
  | 'ticket_assigned'
  | 'ticket_sla_warning'
  | 'ticket_sla_violated'
  | 'feedback_received'
  // Lead events
  | 'lead_created'
  | 'lead_status_changed'
  | 'lead_assigned'
  | 'lead_converted'
  | 'opportunity_created'
  | 'opportunity_won'
  | 'opportunity_lost'
  // Campaign events
  | 'campaign_started'
  | 'campaign_completed'
  | 'campaign_message_sent'
  | 'campaign_message_failed'
  // AI events
  | 'ai_response_sent'
  | 'ai_escalation'
  | 'ai_intent_detected'
  | 'sentiment_analyzed'
  // System events
  | 'instance_connected'
  | 'instance_disconnected'
  | 'user_login'
  | 'user_created';

interface DispatchWebhookOptions {
  /** Whether to wait for the webhook to complete */
  wait?: boolean;
}

/**
 * Dispatch a webhook event to all subscribed endpoints
 * @param event The event type to dispatch
 * @param data The payload data to send
 * @param options Additional options
 */
export async function dispatchWebhook(
  event: WebhookEventType,
  data: Record<string, any>,
  options: DispatchWebhookOptions = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const invokePromise = invokeFunction('dispatch-webhook', { event, data });

    if (options.wait) {
      const { error } = await invokePromise;
      if (error) {
        console.error('[dispatchWebhook] Error:', error);
        return { success: false, error: error.message };
      }
    } else {
      // Fire and forget
      invokePromise.catch((err) => {
        console.error('[dispatchWebhook] Background error:', err);
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[dispatchWebhook] Exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper to dispatch conversation events
 */
export const webhookEvents = {
  // WhatsApp events
  newConversation: (conversationId: string, contactName: string, instanceId: string) =>
    dispatchWebhook('new_conversation', { conversation_id: conversationId, contact_name: contactName, instance_id: instanceId }),
  
  conversationReopened: (conversationId: string, contactName: string, instanceId: string, previousTicketNumber?: number) =>
    dispatchWebhook('conversation_reopened', { conversation_id: conversationId, contact_name: contactName, instance_id: instanceId, previous_ticket_number: previousTicketNumber }),
  
  newMessage: (conversationId: string, messageId: string, content: string, fromMe: boolean) =>
    dispatchWebhook('new_message', { conversation_id: conversationId, message_id: messageId, content, from_me: fromMe }),
  
  messageSent: (conversationId: string, messageId: string, content: string) =>
    dispatchWebhook('message_sent', { conversation_id: conversationId, message_id: messageId, content }),
  
  messageDelivered: (messageId: string) =>
    dispatchWebhook('message_delivered', { message_id: messageId }),
  
  messageRead: (messageId: string) =>
    dispatchWebhook('message_read', { message_id: messageId }),
  
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
  
  ticketSlaWarning: (ticketId: string, ticketNumber: number, minutesRemaining: number) =>
    dispatchWebhook('ticket_sla_warning', { ticket_id: ticketId, ticket_number: ticketNumber, minutes_remaining: minutesRemaining }),
  
  ticketSlaViolated: (ticketId: string, ticketNumber: number) =>
    dispatchWebhook('ticket_sla_violated', { ticket_id: ticketId, ticket_number: ticketNumber }),
  
  feedbackReceived: (ticketId: string, ticketNumber: number, rating: number, comment?: string) =>
    dispatchWebhook('feedback_received', { ticket_id: ticketId, ticket_number: ticketNumber, rating, comment }),

  // Lead events
  leadCreated: (leadId: string, name: string, source: string) =>
    dispatchWebhook('lead_created', { lead_id: leadId, name, source }),
  
  leadStatusChanged: (leadId: string, oldStatus: string, newStatus: string) =>
    dispatchWebhook('lead_status_changed', { lead_id: leadId, old_status: oldStatus, new_status: newStatus }),
  
  leadAssigned: (leadId: string, assigneeId: string, assigneeName: string) =>
    dispatchWebhook('lead_assigned', { lead_id: leadId, assignee_id: assigneeId, assignee_name: assigneeName }),
  
  leadConverted: (leadId: string, convertedTo: string) =>
    dispatchWebhook('lead_converted', { lead_id: leadId, converted_to: convertedTo }),

  // Campaign events
  campaignStarted: (campaignId: string, campaignName: string, totalRecipients: number) =>
    dispatchWebhook('campaign_started', { campaign_id: campaignId, campaign_name: campaignName, total_recipients: totalRecipients }),
  
  campaignCompleted: (campaignId: string, campaignName: string, sentCount: number, failedCount: number) =>
    dispatchWebhook('campaign_completed', { campaign_id: campaignId, campaign_name: campaignName, sent_count: sentCount, failed_count: failedCount }),

  // AI events
  aiResponseSent: (conversationId: string, response: string) =>
    dispatchWebhook('ai_response_sent', { conversation_id: conversationId, response }),
  
  aiEscalation: (conversationId: string, reason: string) =>
    dispatchWebhook('ai_escalation', { conversation_id: conversationId, reason }),
  
  sentimentAnalyzed: (conversationId: string, sentiment: string, score: number) =>
    dispatchWebhook('sentiment_analyzed', { conversation_id: conversationId, sentiment, score }),

  // System events
  instanceConnected: (instanceId: string, instanceName: string) =>
    dispatchWebhook('instance_connected', { instance_id: instanceId, instance_name: instanceName }),
  
  instanceDisconnected: (instanceId: string, instanceName: string, reason?: string) =>
    dispatchWebhook('instance_disconnected', { instance_id: instanceId, instance_name: instanceName, reason }),
};
