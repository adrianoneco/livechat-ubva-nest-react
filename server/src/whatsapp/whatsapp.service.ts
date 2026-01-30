import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
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
import { BaileysService } from './baileys.service';
import * as crypto from 'crypto';

@Injectable()
export class WhatsappService implements OnModuleInit {
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
    private baileysService: BaileysService,
  ) {}

  async onModuleInit() {
    // Register event handlers for all existing instances
    const instances = await this.instanceRepository.find();
    for (const instance of instances) {
      this.registerBaileysEventHandler(instance.instanceName);
    }
  }

  /**
   * Register Baileys event handler for an instance
   */
  private registerBaileysEventHandler(instanceName: string) {
    this.baileysService.registerEventHandler(instanceName, async (event, data) => {
      await this.handleBaileysEvent(instanceName, event, data);
    });
  }

  /**
   * Handle events from Baileys
   */
  private async handleBaileysEvent(instanceName: string, event: string, data: any) {
    switch (event) {
      case 'qr':
        this.wsGateway.sendToAll('whatsapp:qr', { instanceName, qr: data.qr });
        break;
      case 'connection.update':
        const instance = await this.instanceRepository.findOne({ where: { instanceName } });
        if (instance) {
          this.wsGateway.instanceStatusChanged(instance.id, data.state);
        }
        break;
      case 'messages.upsert':
        await this.handleIncomingMessage(instanceName, data);
        break;
      case 'messages.update':
        await this.handleMessageUpdate(instanceName, data);
        break;
      case 'message-receipt.update':
        await this.handleMessageReceipt(instanceName, data);
        break;
    }
  }

  // Instance Management
  async getInstances() {
    const instances = await this.instanceRepository.find();
    
    // Enrich with Baileys status
    return instances.map(instance => ({
      ...instance,
      connectionStatus: this.baileysService.getSessionStatus(instance.instanceName),
    }));
  }

  async getInstance(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');
    
    return {
      ...instance,
      connectionStatus: this.baileysService.getSessionStatus(instance.instanceName),
    };
  }

  async createInstance(data: any) {
    const instance = await this.instanceRepository.save({
      name: data.name,
      instanceName: data.instanceName,
      status: 'disconnected',
      providerType: 'baileys',
    });

    // Register event handler
    this.registerBaileysEventHandler(instance.instanceName);

    return { success: true, instance };
  }

  async updateInstance(instanceId: string, data: any) {
    await this.instanceRepository.update(instanceId, data);
    return { success: true };
  }

  async deleteInstance(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (instance) {
      // Disconnect and cleanup Baileys session
      await this.baileysService.logout(instance.instanceName);
      this.baileysService.unregisterEventHandler(instance.instanceName);
    }
    await this.instanceRepository.delete(instanceId);
    return { success: true };
  }

  // Connect instance (get QR code)
  async connectInstance(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    // Create or reconnect Baileys session
    const result = await this.baileysService.createSession(instance.instanceName, instance.id);
    
    return result;
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

    let finalContent = data.content || '';
    if (data.templateContext) {
      finalContent = this.replaceTemplateVariables(finalContent, data.templateContext);
    }

    try {
      let result: any;
      const messageType = data.messageType || 'text';

      // Send via Baileys
      if (messageType === 'text' || !data.mediaUrl) {
        result = await this.baileysService.sendTextMessage(
          instance.instanceName,
          destNumber,
          finalContent,
          data.quotedMessageId
        );
      } else if (messageType === 'location' && data.latitude && data.longitude) {
        result = await this.baileysService.sendLocationMessage(
          instance.instanceName,
          destNumber,
          data.latitude,
          data.longitude,
          data.locationName
        );
      } else if (messageType === 'contact' && data.contactName && data.contactNumber) {
        result = await this.baileysService.sendContactMessage(
          instance.instanceName,
          destNumber,
          data.contactName,
          data.contactNumber
        );
      } else if (data.mediaUrl) {
        const mediaTypeMap: Record<string, 'image' | 'video' | 'audio' | 'document'> = {
          image: 'image',
          video: 'video',
          audio: 'audio',
          document: 'document',
          file: 'document',
        };
        
        const baileysMediaType = mediaTypeMap[messageType] || 'document';
        result = await this.baileysService.sendMediaMessage(
          instance.instanceName,
          destNumber,
          baileysMediaType,
          data.mediaUrl,
          finalContent,
          data.fileName,
          data.mediaMimetype
        );
      } else {
        result = await this.baileysService.sendTextMessage(
          instance.instanceName,
          destNumber,
          finalContent,
          data.quotedMessageId
        );
      }

      const baileysMessageId = result?.key?.id || crypto.randomUUID();

      // Save message to database
      const remoteJid = isGroup ? contactRemoteJid : `${destNumber}@s.whatsapp.net`;
      const message = await this.messageRepository.save({
        conversationId,
        remoteJid,
        messageId: baileysMessageId,
        content: finalContent,
        messageType: messageType,
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

      return { success: true, message, messageId: baileysMessageId };
    } catch (error: any) {
      console.error('[whatsapp/send] Error:', error);
      throw new BadRequestException(error.message || 'Failed to send message');
    }
  }

  /**
   * Send reaction to a message
   */
  async sendReaction(conversationId: string, messageId: string, emoji: string) {
    const message = await this.messageRepository.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');

    const conversation = await this.conversationRepository.findOne({ 
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const instance = await this.instanceRepository.findOne({ where: { id: conversation.instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    await this.baileysService.sendReaction(
      instance.instanceName,
      message.remoteJid,
      message.messageId,
      emoji
    );

    return { success: true };
  }

  /**
   * Mark messages as read
   */
  async markAsRead(conversationId: string, messageIds?: string[]) {
    const conversation = await this.conversationRepository.findOne({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const instance = await this.instanceRepository.findOne({ where: { id: conversation.instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    let targetMessageIds = messageIds;
    if (!targetMessageIds || targetMessageIds.length === 0) {
      // Mark all unread messages
      const unreadMessages = await this.messageRepository.find({
        where: { conversationId, isFromMe: false, status: 'received' },
        select: ['messageId'],
      });
      targetMessageIds = unreadMessages.map(m => m.messageId);
    }

    if (targetMessageIds.length > 0) {
      await this.baileysService.markAsRead(
        instance.instanceName,
        conversation.remoteJid,
        targetMessageIds
      );
    }

    // Update database
    await this.conversationRepository.update(conversationId, { unreadCount: 0 });

    return { success: true };
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

  // Baileys Event Handlers
  private async handleIncomingMessage(instanceName: string, data: any) {
    try {
      const key = data.key || {};
      const remoteJid = key.remoteJid;
      const messageId = key.id;
      const isFromMe = key.fromMe || false;
      
      if (!remoteJid || !messageId) {
        return;
      }

      // Find instance
      const instance = await this.instanceRepository.findOne({ where: { instanceName } });
      if (!instance) {
        console.warn('[baileys] Instance not found:', instanceName);
        return;
      }

      // Get content from data
      const content = data.content || '';
      const messageType = data.messageType || 'text';

      // Find or create contact and conversation
      const { contact, conversation } = await this.findOrCreateContactAndConversation(
        instance.id,
        remoteJid,
        { pushName: data.pushName }
      );

      // Check for duplicate message
      const existingMessage = await this.messageRepository.findOne({ where: { messageId } });
      if (existingMessage) {
        return;
      }

      // Save message
      const savedMessage = await this.messageRepository.save({
        conversationId: conversation.id,
        remoteJid,
        messageId,
        content,
        messageType,
        mediaUrl: data.mediaUrl,
        mediaMimetype: data.mediaMimetype,
        mediaFilename: data.mediaFilename,
        isFromMe,
        status: isFromMe ? 'sent' : 'received',
        timestamp: new Date(Number(data.messageTimestamp) * 1000 || Date.now()),
        metadata: { raw: data.message },
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
    } catch (error) {
      console.error('[baileys] Error handling message:', error);
    }
  }

  private async handleMessageUpdate(instanceName: string, data: any) {
    try {
      const messageId = data.key?.id;
      const status = data.update?.status;
      
      if (messageId && status) {
        const statusMap: Record<number, string> = {
          0: 'error',
          1: 'pending',
          2: 'sent',
          3: 'delivered',
          4: 'read',
          5: 'played',
        };
        
        const statusStr = typeof status === 'number' ? statusMap[status] || 'unknown' : status;
        
        await this.messageRepository.update({ messageId }, { status: statusStr });
        
        const message = await this.messageRepository.findOne({ where: { messageId } });
        if (message) {
          this.wsGateway.messageStatusChanged(message.conversationId, message.id, statusStr);
        }
      }
    } catch (error) {
      console.error('[baileys] Error updating message:', error);
    }
  }

  private async handleMessageReceipt(instanceName: string, data: any) {
    try {
      const keys = data.keys || [];
      const type = data.type;
      
      const statusMap: Record<string, string> = {
        'read': 'read',
        'read-self': 'read',
        'delivered': 'delivered',
      };
      
      const status = statusMap[type];
      if (!status) return;

      for (const key of keys) {
        const messageId = key.id;
        await this.messageRepository.update({ messageId }, { status });
        
        const message = await this.messageRepository.findOne({ where: { messageId } });
        if (message) {
          this.wsGateway.messageStatusChanged(message.conversationId, message.id, status);
        }
      }
    } catch (error) {
      console.error('[baileys] Error handling receipt:', error);
    }
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

  // Instance API actions (now using Baileys directly)
  async getInstanceQR(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    // Connect and get QR from Baileys
    const result = await this.baileysService.createSession(instance.instanceName, instance.id);
    
    if (result.qrCode) {
      return { qr: result.qrCode, status: result.status };
    }
    
    // If already connected, return status
    const status = this.baileysService.getSessionStatus(instance.instanceName);
    return { status: status.status };
  }

  async getInstanceStatus(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    const status = this.baileysService.getSessionStatus(instance.instanceName);
    return { status: status.status, qrCode: status.qrCode };
  }

  async logoutInstance(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    await this.baileysService.logout(instance.instanceName);
    await this.instanceRepository.update(instanceId, { status: 'disconnected', qrCode: null });
    
    return { success: true };
  }

  async disconnectInstance(instanceId: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    await this.baileysService.disconnect(instance.instanceName);
    
    return { success: true };
  }

  // Check if number is on WhatsApp
  async checkNumber(instanceId: string, phoneNumber: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    const result = await this.baileysService.isOnWhatsApp(instance.instanceName, phoneNumber);
    return result;
  }

  // Get profile picture
  async getProfilePicture(instanceId: string, phoneNumber: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    const url = await this.baileysService.getProfilePicture(instance.instanceName, phoneNumber);
    return { url };
  }

  // Group management
  async getGroupMetadata(instanceId: string, groupJid: string) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    return this.baileysService.getGroupMetadata(instance.instanceName, groupJid);
  }

  async createGroup(instanceId: string, name: string, participants: string[]) {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Instance not found');

    return this.baileysService.createGroup(instance.instanceName, name, participants);
  }
}
