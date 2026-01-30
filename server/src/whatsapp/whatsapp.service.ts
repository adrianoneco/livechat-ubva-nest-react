import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  WhatsappInstance,
  WhatsappInstanceSecret,
  WhatsappContact,
  WhatsappConversation,
  WhatsappMessage,
  WhatsappMacro,
} from '../entities';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import * as crypto from 'crypto';

@Injectable()
export class WhatsappService {
  constructor(
    @InjectRepository(WhatsappInstance)
    private instanceRepository: Repository<WhatsappInstance>,
    @InjectRepository(WhatsappInstanceSecret)
    private secretsRepository: Repository<WhatsappInstanceSecret>,
    @InjectRepository(WhatsappContact)
    private contactRepository: Repository<WhatsappContact>,
    @InjectRepository(WhatsappConversation)
    private conversationRepository: Repository<WhatsappConversation>,
    @InjectRepository(WhatsappMessage)
    private messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappMacro)
    private macroRepository: Repository<WhatsappMacro>,
    private dataSource: DataSource,
    @Inject(forwardRef(() => WebsocketGateway))
    private wsGateway: WebsocketGateway,
  ) {}

  // Instance Management
  async getInstances() {
    const instances = await this.instanceRepository.find();
    return instances;
  }

  async getInstance(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');
    return instance;
  }

  async createInstance(data: any) {
    const instance = await this.instanceRepository.save({
      name: data.name,
      instanceName: data.instanceName,
      status: 'disconnected',
      providerType: data.providerType || 'self_hosted',
      instanceIdExternal: data.instanceIdExternal,
    });

    if (data.apiKey && data.apiUrl) {
      await this.secretsRepository.save({
        instanceId: instance.id,
        apiKey: data.apiKey,
        apiUrl: data.apiUrl,
        providerType: data.providerType || 'self_hosted',
      });
    }

    return { success: true, instance };
  }

  async updateInstance(instanceId: string, data: any) {
    await this.instanceRepository.update(instanceId, data);
    return { success: true };
  }

  async deleteInstance(instanceId: string) {
    await this.instanceRepository.delete(instanceId);
    return { success: true };
  }

  // Contacts
  async getContacts(instanceId?: string) {
    const qb = this.contactRepository.createQueryBuilder('c');
    if (instanceId) {
      qb.where('c.instance_id = :instanceId', { instanceId });
    }
    return qb.getMany();
  }

  async getContact(contactId: string) {
    const contact = await this.contactRepository.findOne({ where: { id: contactId } });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  // Messages
  async sendMessage(conversationId: string, data: any, user: any) {
    const conversation = await this.dataSource.query(`
      SELECT 
        c.*,
        ct.phone_number as contact_phone,
        ct.name as contact_name,
        ct.metadata as contact_metadata,
        ct.remote_jid as contact_remote_jid,
        ct.is_group as contact_is_group
      FROM whatsapp_conversations c
      JOIN whatsapp_contacts ct ON ct.id = c.contact_id
      WHERE c.id = $1
      LIMIT 1
    `, [conversationId]);

    if (!conversation.length) {
      throw new NotFoundException('Conversation not found');
    }

    const conv = conversation[0];
    const contactMetadata = conv.contact_metadata || {};
    const senderPn = contactMetadata.sender_pn;
    const isGroup = conv.contact_is_group;
    const contactRemoteJid = conv.contact_remote_jid;

    let destNumber: string;
    if (isGroup && contactRemoteJid && contactRemoteJid.includes('@g.us')) {
      const fullJid = contactMetadata.full_jid;
      destNumber = fullJid || contactRemoteJid;
    } else if (senderPn) {
      destNumber = senderPn.replace(/\D/g, '');
    } else if (conv.contact_phone.includes('@lid')) {
      destNumber = conv.contact_phone;
    } else {
      destNumber = conv.contact_phone.replace(/\D/g, '');
    }

    const instance = await this.instanceRepository.findOne({ where: { id: conv.instance_id } });
    if (!instance) throw new NotFoundException('Instance not found');

    const secrets = await this.secretsRepository.findOne({ where: { instanceId: instance.id } });
    if (!secrets) throw new NotFoundException('Instance secrets not found');

    let finalContent = data.content || '';
    if (data.templateContext) {
      finalContent = this.replaceTemplateVariables(finalContent, data.templateContext);
    }

    // Send to Evolution API
    const evolutionPayload: any = { number: destNumber, text: finalContent };
    if (data.messageType !== 'text' && data.mediaUrl) {
      evolutionPayload.mediaUrl = data.mediaUrl;
    }
    if (data.quotedMessageId) {
      evolutionPayload.quoted = { key: { id: data.quotedMessageId } };
    }

    const providerType = secrets.providerType || 'self_hosted';
    const instanceIdentifier = providerType === 'cloud' && instance.instanceIdExternal
      ? instance.instanceIdExternal
      : instance.instanceName;

    let endpoint = data.messageType === 'text' || !data.mediaUrl
      ? `${secrets.apiUrl}/message/sendText/${instanceIdentifier}`
      : `${secrets.apiUrl}/message/sendMedia/${instanceIdentifier}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (providerType === 'cloud') {
      headers['Authorization'] = `Bearer ${secrets.apiKey}`;
    } else {
      headers['apikey'] = secrets.apiKey;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(evolutionPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[whatsapp/send] Evolution API error:', errorText);
        throw new BadRequestException('Failed to send message to WhatsApp');
      }

      const result = await response.json();
      const evolutionMessageId = result.key?.id || crypto.randomUUID();

      // Save message to database
      const remoteJid = isGroup ? contactRemoteJid : `${destNumber}@s.whatsapp.net`;
      const message = await this.messageRepository.save({
        conversationId,
        remoteJid,
        messageId: evolutionMessageId,
        content: finalContent,
        messageType: data.messageType || 'text',
        mediaUrl: data.mediaUrl,
        mediaMimetype: data.mediaMimetype,
        mediaFilename: data.fileName,
        isFromMe: true,
        status: 'sent',
        quotedMessageId: data.quotedMessageId,
        timestamp: new Date(),
        sentBy: user?.userId,
      });

      // Update conversation
      await this.conversationRepository.update(conversationId, {
        lastMessageAt: new Date(),
        lastMessagePreview: finalContent.substring(0, 100),
        updatedAt: new Date(),
      });

      // Emit WebSocket event
      this.wsGateway.messageCreated(conversationId, message);

      return { success: true, message, evolutionMessageId };
    } catch (error: any) {
      console.error('[whatsapp/send] Error:', error);
      throw new BadRequestException(error.message || 'Failed to send message');
    }
  }

  private replaceTemplateVariables(content: string, context: any): string {
    let result = content;
    for (const [key, value] of Object.entries(context)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
      result = result.replace(new RegExp(`{${key}}`, 'g'), String(value || ''));
    }
    return result;
  }

  // Macros
  async getMacros(instanceId?: string) {
    const qb = this.macroRepository.createQueryBuilder('m').where('m.is_active = true');
    if (instanceId) {
      qb.andWhere('(m.instance_id = :instanceId OR m.instance_id IS NULL)', { instanceId });
    }
    return qb.orderBy('m.usage_count', 'DESC').getMany();
  }

  async createMacro(data: any) {
    const macro = await this.macroRepository.save(data);
    return { success: true, macro };
  }

  async updateMacro(macroId: string, data: any) {
    await this.macroRepository.update(macroId, { ...data, updatedAt: new Date() });
    return { success: true };
  }

  async deleteMacro(macroId: string) {
    await this.macroRepository.delete(macroId);
    return { success: true };
  }

  async useMacro(macroId: string) {
    await this.dataSource.query(
      'UPDATE whatsapp_macros SET usage_count = usage_count + 1 WHERE id = $1',
      [macroId]
    );
    return { success: true };
  }

  // Webhook handling
  async handleWebhook(instanceName: string, body: any) {
    console.log('[webhook] Received from instance:', instanceName);
    
    const eventType = body.event || body.type || Object.keys(body)[0];
    const data = body.data || body[eventType] || body;

    switch (eventType) {
      case 'messages.upsert':
      case 'message':
        return this.handleIncomingMessage(instanceName, data);
      case 'messages.update':
        return this.handleMessageUpdate(instanceName, data);
      case 'connection.update':
        return this.handleConnectionUpdate(instanceName, data);
      default:
        console.log('[webhook] Unknown event type:', eventType);
        return { received: true };
    }
  }

  private async handleIncomingMessage(instanceName: string, data: any) {
    try {
      const messageData = Array.isArray(data) ? data[0] : data;
      const key = messageData.key || {};
      const message = messageData.message || {};
      
      const remoteJid = key.remoteJid;
      const messageId = key.id;
      const isFromMe = key.fromMe || false;
      
      if (!remoteJid || !messageId) {
        return { received: true, skipped: 'missing_data' };
      }

      // Find instance
      const instance = await this.instanceRepository.findOne({ where: { instanceName } });
      if (!instance) {
        console.warn('[webhook] Instance not found:', instanceName);
        return { received: true, skipped: 'instance_not_found' };
      }

      // Get content
      let content = message.conversation || 
                   message.extendedTextMessage?.text ||
                   message.imageMessage?.caption ||
                   message.videoMessage?.caption ||
                   message.documentMessage?.caption ||
                   '';
      
      const messageType = this.getMessageType(message);

      // Find or create contact and conversation
      const { contact, conversation } = await this.findOrCreateContactAndConversation(
        instance.id,
        remoteJid,
        messageData
      );

      // Check for duplicate message
      const existingMessage = await this.messageRepository.findOne({ where: { messageId } });
      if (existingMessage) {
        return { received: true, skipped: 'duplicate' };
      }

      // Save message
      const savedMessage = await this.messageRepository.save({
        conversationId: conversation.id,
        remoteJid,
        messageId,
        content,
        messageType,
        isFromMe,
        status: 'received',
        timestamp: new Date(messageData.messageTimestamp * 1000 || Date.now()),
        metadata: { raw: messageData },
      });

      // Update conversation
      await this.conversationRepository.update(conversation.id, {
        lastMessageAt: new Date(),
        lastMessagePreview: content.substring(0, 100),
        unreadCount: isFromMe ? conversation.unreadCount : (conversation.unreadCount || 0) + 1,
        updatedAt: new Date(),
      });

      // Emit WebSocket
      this.wsGateway.messageCreated(conversation.id, savedMessage);

      return { success: true, messageId: savedMessage.id };
    } catch (error) {
      console.error('[webhook] Error handling message:', error);
      return { received: true, error: String(error) };
    }
  }

  private async handleMessageUpdate(instanceName: string, data: any) {
    try {
      const updates = Array.isArray(data) ? data : [data];
      
      for (const update of updates) {
        const messageId = update.key?.id;
        const status = update.status?.toLowerCase?.() || update.update?.status;
        
        if (messageId && status) {
          await this.messageRepository.update({ messageId }, { status });
          
          const message = await this.messageRepository.findOne({ where: { messageId } });
          if (message) {
            this.wsGateway.messageStatusChanged(message.conversationId, message.id, status);
          }
        }
      }

      return { received: true };
    } catch (error) {
      console.error('[webhook] Error updating message:', error);
      return { received: true, error: String(error) };
    }
  }

  private async handleConnectionUpdate(instanceName: string, data: any) {
    const instance = await this.instanceRepository.findOne({ where: { instanceName } });
    if (!instance) return { received: true };

    const status = data.state || data.status || 'unknown';
    await this.instanceRepository.update(instance.id, { status });
    this.wsGateway.instanceStatusChanged(instance.id, status);

    return { received: true };
  }

  private getMessageType(message: any): string {
    if (message.imageMessage) return 'image';
    if (message.videoMessage) return 'video';
    if (message.audioMessage) return 'audio';
    if (message.documentMessage) return 'document';
    if (message.stickerMessage) return 'sticker';
    if (message.locationMessage) return 'location';
    if (message.contactMessage) return 'contact';
    return 'text';
  }

  private async findOrCreateContactAndConversation(instanceId: string, remoteJid: string, messageData: any) {
    const isGroup = remoteJid.includes('@g.us');
    const phoneNumber = remoteJid.replace(/@.*$/, '');

    let contact = await this.contactRepository.findOne({
      where: { instanceId, remoteJid },
    });

    if (!contact) {
      contact = await this.contactRepository.findOne({
        where: { instanceId, phoneNumber },
      });
    }

    if (!contact) {
      contact = await this.contactRepository.save({
        instanceId,
        phoneNumber,
        remoteJid,
        name: messageData.pushName || phoneNumber,
        isGroup,
      });
    }

    let conversation = await this.conversationRepository.findOne({
      where: { contactId: contact.id },
    });

    if (!conversation) {
      conversation = await this.conversationRepository.save({
        instanceId,
        contactId: contact.id,
        remoteJid,
        status: 'active',
        conversationMode: 'ai',
        unreadCount: 0,
      });
    }

    return { contact, conversation };
  }

  // Instance API actions
  async getInstanceQR(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    const secrets = await this.secretsRepository.findOne({ where: { instanceId: instance.id } });
    if (!secrets) throw new NotFoundException('Instance secrets not found');

    const providerType = secrets.providerType || 'self_hosted';
    const instanceIdentifier = providerType === 'cloud' && instance.instanceIdExternal
      ? instance.instanceIdExternal
      : instance.instanceName;

    const headers: Record<string, string> = {};
    if (providerType === 'cloud') {
      headers['Authorization'] = `Bearer ${secrets.apiKey}`;
    } else {
      headers['apikey'] = secrets.apiKey;
    }

    try {
      const response = await fetch(`${secrets.apiUrl}/instance/connect/${instanceIdentifier}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new BadRequestException('Failed to get QR code');
      }

      const result = await response.json();
      return result;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to get QR code');
    }
  }

  async getInstanceStatus(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    const secrets = await this.secretsRepository.findOne({ where: { instanceId: instance.id } });
    if (!secrets) return { status: instance.status || 'disconnected' };

    const providerType = secrets.providerType || 'self_hosted';
    const instanceIdentifier = providerType === 'cloud' && instance.instanceIdExternal
      ? instance.instanceIdExternal
      : instance.instanceName;

    const headers: Record<string, string> = {};
    if (providerType === 'cloud') {
      headers['Authorization'] = `Bearer ${secrets.apiKey}`;
    } else {
      headers['apikey'] = secrets.apiKey;
    }

    try {
      const response = await fetch(`${secrets.apiUrl}/instance/connectionState/${instanceIdentifier}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return { status: instance.status || 'disconnected' };
      }

      const result = await response.json();
      const status = result.state || result.instance?.state || 'unknown';
      
      await this.instanceRepository.update(instanceId, { status });
      
      return { status, ...result };
    } catch (error) {
      return { status: instance.status || 'disconnected' };
    }
  }

  async logoutInstance(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    const secrets = await this.secretsRepository.findOne({ where: { instanceId: instance.id } });
    if (!secrets) throw new NotFoundException('Instance secrets not found');

    const providerType = secrets.providerType || 'self_hosted';
    const instanceIdentifier = providerType === 'cloud' && instance.instanceIdExternal
      ? instance.instanceIdExternal
      : instance.instanceName;

    const headers: Record<string, string> = {};
    if (providerType === 'cloud') {
      headers['Authorization'] = `Bearer ${secrets.apiKey}`;
    } else {
      headers['apikey'] = secrets.apiKey;
    }

    try {
      await fetch(`${secrets.apiUrl}/instance/logout/${instanceIdentifier}`, {
        method: 'DELETE',
        headers,
      });

      await this.instanceRepository.update(instanceId, { status: 'disconnected', qrCode: null });
      return { success: true };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to logout');
    }
  }
}
