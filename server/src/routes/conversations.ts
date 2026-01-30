import { Router, Request, Response } from 'express';
import { db } from '../db';
import { whatsappConversations, whatsappMessages, whatsappContacts } from '../db/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { eq, desc, and, or, sql, ilike } from 'drizzle-orm';
import { Pool } from 'pg';
import { webhookEvents } from '../lib/webhookDispatcher';
import { wsEmit } from '../lib/websocket';

// Database pool for raw queries
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'livechat',
});

const router = Router();

// Get conversations
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, assignedTo, search } = req.query;

    let query = db
      .select({
        id: whatsappConversations.id,
        contactId: whatsappConversations.contactId,
        contactName: whatsappContacts.name,
        contactPhone: whatsappContacts.phoneNumber,
        lastMessageAt: whatsappConversations.lastMessageAt,
        lastMessagePreview: whatsappConversations.lastMessagePreview,
        unreadCount: whatsappConversations.unreadCount,
        status: whatsappConversations.status,
        assignedTo: whatsappConversations.assignedTo,
        conversationMode: whatsappConversations.conversationMode,
        createdAt: whatsappConversations.createdAt,
      })
      .from(whatsappConversations)
      .leftJoin(whatsappContacts, eq(whatsappConversations.contactId, whatsappContacts.id));

    if (status) {
      query = query.where(eq(whatsappConversations.status, status as string)) as any;
    }

    if (assignedTo) {
      query = query.where(eq(whatsappConversations.assignedTo, assignedTo as string)) as any;
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.where(
        or(
          ilike(whatsappContacts.name, searchTerm),
          ilike(whatsappConversations.contactPhone, searchTerm)
        )
      ) as any;
    }

    const conversations = await query.orderBy(desc(whatsappConversations.lastMessageAt));

    res.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conversation by ID
router.get('/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;

    const [conversation] = await db
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages ordered by created_at (milissegundos para precisão)
    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(whatsappMessages.createdAt);

    // Get contact
    const [contact] = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.id, conversation.contactId))
      .limit(1);

    res.json({ conversation, messages, contact });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update conversation
router.put('/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const updates = req.body;

    const [updated] = await db
      .update(whatsappConversations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId))
      .returning();

    res.json({ success: true, conversation: updated });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark as read - with webhook dispatch, fallback API and Evolution API notifications
router.post('/:conversationId/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    console.log('[conversations/read] Marking conversation as read:', conversationId);

    // Fetch conversation details for Evolution API
    const { rows: convRows } = await pool.query(
      `SELECT c.id, c.instance_id, c.contact_id, ct.phone_number, ct.remote_jid as contact_remote_jid, 
              ct.metadata as contact_metadata, i.instance_name, i.provider_type, i.instance_id_external
       FROM whatsapp_conversations c
       JOIN whatsapp_contacts ct ON ct.id = c.contact_id
       JOIN whatsapp_instances i ON i.id = c.instance_id
       WHERE c.id = $1 LIMIT 1`,
      [conversationId]
    );

    if (convRows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conv = convRows[0];

    // Get messages that need to be marked as read
    const { rows: messagesToMark } = await pool.query(
      `SELECT id, message_id, remote_jid FROM whatsapp_messages 
       WHERE conversation_id = $1 AND is_from_me = false AND status <> 'read'`,
      [conversationId]
    );

    // Update messages statuses to 'read' in database
    if (messagesToMark.length > 0) {
      const msgIds = messagesToMark.map(m => m.message_id);
      const placeholders = msgIds.map((_, i) => `$${i + 2}`).join(',');
      await pool.query(
        `UPDATE whatsapp_messages SET status = 'read' WHERE conversation_id = $1 AND message_id IN (${placeholders})`,
        [conversationId, ...msgIds]
      );
    }

    // Update conversation unread count
    await db
      .update(whatsappConversations)
      .set({
        unreadCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));

    // Emit WebSocket events for real-time updates
    console.log('[conversations/read] Emitting WebSocket events for', messagesToMark.length, 'messages');
    wsEmit.conversationUpdated(conversationId, { id: conversationId, unread_count: 0 });
    for (const msg of messagesToMark) {
      wsEmit.messageStatusChanged(conversationId, msg.id, 'read');
    }

    // Dispatch webhooks for message_read events (incoming_read: they sent, we/user read)
    console.log('[conversations/read] Dispatching webhook events for', messagesToMark.length, 'messages');
    for (const msg of messagesToMark) {
      webhookEvents.messageRead(msg.message_id, conversationId, 'incoming_read', 'user');
    }

    // Notify fallback API for each message (fire-and-forget)
    console.log('[conversations/read] Notifying fallback API for', messagesToMark.length, 'messages');
    for (const msg of messagesToMark) {
      try {
        const fallbackUrl = `http://192.168.3.39:8088/messages/${msg.message_id}/read`;
        fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'accept': 'application/json' },
          signal: AbortSignal.timeout(3000),
        }).then(resp => {
          if (resp.ok) {
            console.log('[conversations/read] Fallback API notified for message:', msg.message_id);
          }
        }).catch(() => {});
      } catch (e) {
        // Silent fail for fallback
      }
    }

    // Notify Evolution API (best-effort)
    try {
      const { rows: secretRows } = await pool.query(
        'SELECT api_url, api_key FROM whatsapp_instance_secrets WHERE instance_id = $1 LIMIT 1',
        [conv.instance_id]
      );

      if (secretRows.length > 0 && messagesToMark.length > 0) {
        const secrets = secretRows[0];
        const providerType = conv.provider_type || 'self_hosted';
        const instanceIdentifier = providerType === 'cloud' && conv.instance_id_external
          ? conv.instance_id_external
          : conv.instance_name;

        // Build remoteJid
        const contactMetadata = conv.contact_metadata || {};
        const senderPn = contactMetadata.sender_pn;
        let remoteJid: string;
        
        if (conv.contact_remote_jid) {
          remoteJid = conv.contact_remote_jid;
        } else if (conv.phone_number.includes('@')) {
          remoteJid = conv.phone_number;
        } else if (senderPn) {
          remoteJid = `${senderPn}@s.whatsapp.net`;
        } else {
          remoteJid = `${conv.phone_number.replace(/\D/g, '')}@s.whatsapp.net`;
        }

        // Build readMessages array
        const readMessages = messagesToMark
          .filter(m => m.message_id)
          .map(m => ({
            id: m.message_id,
            fromMe: false,
            remoteJid: m.remote_jid || remoteJid,
          }));

        if (readMessages.length > 0) {
          const apiUrl = (secrets.api_url || '').replace(/\/$/, '');
          const target = `${apiUrl}/chat/markMessageAsRead/${instanceIdentifier}`;
          
          console.log('[conversations/read] Calling Evolution API:', target, 'with', readMessages.length, 'messages');
          
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (providerType === 'cloud') {
            headers['apikey'] = secrets.api_key;
          } else {
            headers['apikey'] = secrets.api_key;
          }

          fetch(target, {
            method: 'POST',
            headers,
            body: JSON.stringify({ readMessages }),
            signal: AbortSignal.timeout(5000),
          }).then(resp => {
            if (resp.ok) {
              console.log('[conversations/read] Evolution API notified successfully');
            } else {
              console.warn('[conversations/read] Evolution API returned status:', resp.status);
            }
          }).catch(err => {
            console.warn('[conversations/read] Evolution API error:', err.message);
          });
        }
      }
    } catch (evolutionError) {
      console.warn('[conversations/read] Evolution API error:', evolutionError);
    }

    console.log('[conversations/read] Successfully marked', messagesToMark.length, 'messages as read');
    res.json({ success: true, markedCount: messagesToMark.length });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign conversation
router.post('/:conversationId/assign', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { assignedTo } = req.body;

    await db
      .update(whatsappConversations)
      .set({
        assignedTo,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change conversation mode
router.post('/:conversationId/mode', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { mode } = req.body;

    if (!['ai', 'human', 'hybrid'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    await db
      .update(whatsappConversations)
      .set({
        conversationMode: mode,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error changing mode:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
