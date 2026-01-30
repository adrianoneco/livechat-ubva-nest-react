import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WhatsappConversation, WhatsappMessage, WhatsappContact } from '../entities';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(WhatsappConversation)
    private conversationRepository: Repository<WhatsappConversation>,
    @InjectRepository(WhatsappMessage)
    private messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappContact)
    private contactRepository: Repository<WhatsappContact>,
    private dataSource: DataSource,
    private wsGateway: WebsocketGateway,
  ) {}

  async getConversations(filters: { status?: string; assignedTo?: string; search?: string }) {
    const qb = this.conversationRepository
      .createQueryBuilder('c')
      .leftJoin('whatsapp_contacts', 'ct', 'ct.id = c.contact_id')
      .select([
        'c.id as id',
        'c.contact_id as "contactId"',
        'ct.name as "contactName"',
        'ct.phone_number as "contactPhone"',
        'c.last_message_at as "lastMessageAt"',
        'c.last_message_preview as "lastMessagePreview"',
        'c.unread_count as "unreadCount"',
        'c.status as status',
        'c.assigned_to as "assignedTo"',
        'c.conversation_mode as "conversationMode"',
        'c.created_at as "createdAt"',
      ]);

    if (filters.status) {
      qb.andWhere('c.status = :status', { status: filters.status });
    }

    if (filters.assignedTo) {
      qb.andWhere('c.assigned_to = :assignedTo', { assignedTo: filters.assignedTo });
    }

    if (filters.search) {
      qb.andWhere('(ct.name ILIKE :search OR c.contact_phone ILIKE :search)', { search: `%${filters.search}%` });
    }

    qb.orderBy('c.last_message_at', 'DESC', 'NULLS LAST');

    const conversations = await qb.getRawMany();
    return { conversations };
  }

  async getConversationById(conversationId: string) {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    const contact = await this.contactRepository.findOne({
      where: { id: conversation.contactId },
    });

    return { conversation, messages, contact };
  }

  async updateConversation(conversationId: string, updates: any) {
    const updated = await this.conversationRepository.save({
      id: conversationId,
      ...updates,
      updatedAt: new Date(),
    });

    return { success: true, conversation: updated };
  }

  async markAsRead(conversationId: string) {
    // Get conversation details
    const convResult = await this.dataSource.query(`
      SELECT c.id, c.instance_id, c.contact_id, ct.phone_number, ct.remote_jid as contact_remote_jid, 
             ct.metadata as contact_metadata, i.instance_name, i.provider_type, i.instance_id_external
       FROM whatsapp_conversations c
       JOIN whatsapp_contacts ct ON ct.id = c.contact_id
       JOIN whatsapp_instances i ON i.id = c.instance_id
       WHERE c.id = $1 LIMIT 1
    `, [conversationId]);

    if (convResult.length === 0) {
      throw new NotFoundException('Conversation not found');
    }

    const conv = convResult[0];

    // Get messages to mark
    const messagesToMark = await this.dataSource.query(`
      SELECT id, message_id, remote_jid FROM whatsapp_messages 
       WHERE conversation_id = $1 AND is_from_me = false AND status <> 'read'
    `, [conversationId]);

    // Update messages to read
    if (messagesToMark.length > 0) {
      const msgIds = messagesToMark.map((m: any) => m.message_id);
      await this.dataSource.query(`
        UPDATE whatsapp_messages SET status = 'read' 
        WHERE conversation_id = $1 AND message_id = ANY($2)
      `, [conversationId, msgIds]);
    }

    // Update conversation unread count
    await this.conversationRepository.update(conversationId, {
      unreadCount: 0,
      updatedAt: new Date(),
    });

    // Emit WebSocket events
    this.wsGateway.conversationUpdated(conversationId, { id: conversationId, unread_count: 0 });
    for (const msg of messagesToMark) {
      this.wsGateway.messageStatusChanged(conversationId, msg.id, 'read');
    }

    // Try to notify Evolution API (best effort)
    this.notifyEvolutionApiRead(conv, messagesToMark).catch(err => 
      console.warn('[conversations/read] Evolution API error:', err)
    );

    return { success: true, markedCount: messagesToMark.length };
  }

  private async notifyEvolutionApiRead(conv: any, messagesToMark: any[]) {
    if (messagesToMark.length === 0) return;

    const secretsResult = await this.dataSource.query(
      'SELECT api_url, api_key FROM whatsapp_instance_secrets WHERE instance_id = $1 LIMIT 1',
      [conv.instance_id]
    );

    if (secretsResult.length === 0) return;

    const secrets = secretsResult[0];
    const providerType = conv.provider_type || 'self_hosted';
    const instanceIdentifier = providerType === 'cloud' && conv.instance_id_external
      ? conv.instance_id_external
      : conv.instance_name;

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

    const readMessages = messagesToMark
      .filter((m: any) => m.message_id)
      .map((m: any) => ({
        id: m.message_id,
        fromMe: false,
        remoteJid: m.remote_jid || remoteJid,
      }));

    if (readMessages.length > 0) {
      const apiUrl = (secrets.api_url || '').replace(/\/$/, '');
      const target = `${apiUrl}/chat/markMessageAsRead/${instanceIdentifier}`;

      const headers: Record<string, string> = { 
        'Content-Type': 'application/json',
        'apikey': secrets.api_key,
      };

      fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify({ readMessages }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  }

  async assignConversation(conversationId: string, assignedTo: string) {
    await this.conversationRepository.update(conversationId, {
      assignedTo,
      updatedAt: new Date(),
    });
    return { success: true };
  }

  async changeMode(conversationId: string, mode: string) {
    if (!['ai', 'human', 'hybrid'].includes(mode)) {
      throw new Error('Invalid mode');
    }

    await this.conversationRepository.update(conversationId, {
      conversationMode: mode,
      updatedAt: new Date(),
    });
    return { success: true };
  }
}
