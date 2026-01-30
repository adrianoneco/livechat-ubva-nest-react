import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  WhatsappInstance,
  WhatsappInstanceSecret,
} from '../entities';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
  getContentType,
  AnyMessageContent,
  WAMessage,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

interface BaileysSession {
  socket: WASocket;
  qrCode: string | null;
  status: string;
  retryCount: number;
}

@Injectable()
export class BaileysService implements OnModuleDestroy, OnModuleInit {
  private sessions: Map<string, BaileysSession> = new Map();
  private readonly sessionsDir = path.join(process.cwd(), 'baileys_sessions');
  private readonly logger = pino({ level: 'silent' });
  private eventHandlers: Map<string, (event: string, data: any) => void> = new Map();

  constructor(
    @InjectRepository(WhatsappInstance)
    private instanceRepository: Repository<WhatsappInstance>,
    @InjectRepository(WhatsappInstanceSecret)
    private secretsRepository: Repository<WhatsappInstanceSecret>,
    private dataSource: DataSource,
  ) {
    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  async onModuleInit() {
    // Initialize saved WhatsApp sessions on startup
    await this.initializeSavedInstances();
  }

  async onModuleDestroy() {
    // Cleanup all sessions on shutdown
    for (const [instanceName, session] of this.sessions) {
      try {
        session.socket?.end(undefined);
      } catch (e) {
        console.error(`[baileys] Error closing session ${instanceName}:`, e);
      }
    }
    this.sessions.clear();
  }

  /**
   * Register event handler for a specific instance
   */
  registerEventHandler(instanceName: string, handler: (event: string, data: any) => void) {
    this.eventHandlers.set(instanceName, handler);
  }

  /**
   * Unregister event handler
   */
  unregisterEventHandler(instanceName: string) {
    this.eventHandlers.delete(instanceName);
  }

  /**
   * Create and connect a new WhatsApp session
   */
  async createSession(instanceName: string, instanceId: string): Promise<{ qrCode?: string; status: string }> {
    // Check if session already exists
    if (this.sessions.has(instanceName)) {
      const session = this.sessions.get(instanceName)!;
      if (session.status === 'open') {
        return { status: 'connected' };
      }
      if (session.qrCode) {
        return { qrCode: session.qrCode, status: 'qr' };
      }
    }

    const sessionDir = path.join(this.sessionsDir, instanceName);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: this.logger,
      browser: ['LiveChat', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      markOnlineOnConnect: true,
    });

    const session: BaileysSession = {
      socket,
      qrCode: null,
      status: 'connecting',
      retryCount: 0,
    };
    this.sessions.set(instanceName, session);

    // Handle connection updates
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Generate QR code as base64
        const qrBase64 = await QRCode.toDataURL(qr);
        session.qrCode = qrBase64;
        session.status = 'qr';

        // Update database
        await this.instanceRepository.update({ instanceName }, {
          status: 'qr',
          qrCode: qrBase64,
        });

        // Emit event
        this.emitEvent(instanceName, 'qr', { qr: qrBase64, instanceName });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        session.status = 'disconnected';
        session.qrCode = null;

        await this.instanceRepository.update({ instanceName }, {
          status: 'disconnected',
          qrCode: null,
        });

        this.emitEvent(instanceName, 'connection.update', { 
          state: 'disconnected', 
          reason: statusCode,
          instanceName 
        });

        if (shouldReconnect && session.retryCount < 5) {
          session.retryCount++;
          console.log(`[baileys] Reconnecting ${instanceName} (attempt ${session.retryCount})...`);
          setTimeout(() => this.createSession(instanceName, instanceId), 3000);
        } else if (statusCode === DisconnectReason.loggedOut) {
          // Clear session data
          this.deleteSessionFiles(instanceName);
          this.sessions.delete(instanceName);
        }
      } else if (connection === 'open') {
        session.status = 'open';
        session.qrCode = null;
        session.retryCount = 0;

        await this.instanceRepository.update({ instanceName }, {
          status: 'connected',
          qrCode: null,
        });

        this.emitEvent(instanceName, 'connection.update', { 
          state: 'connected', 
          instanceName 
        });

        console.log(`[baileys] Connected: ${instanceName}`);
      }
    });

    // Handle credentials update
    socket.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    socket.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          await this.handleIncomingMessage(instanceName, msg);
        }
      }
    });

    // Handle message updates (status changes)
    socket.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        this.emitEvent(instanceName, 'messages.update', {
          key: update.key,
          update: update.update,
          instanceName,
        });
      }
    });

    // Handle message receipts (read, delivered)
    socket.ev.on('message-receipt.update', async (receipts) => {
      for (const receipt of receipts) {
        this.emitEvent(instanceName, 'message-receipt.update', {
          ...receipt,
          instanceName,
        });
      }
    });

    // Handle contacts update
    socket.ev.on('contacts.update', async (contacts) => {
      this.emitEvent(instanceName, 'contacts.update', { contacts, instanceName });
    });

    // Handle groups update
    socket.ev.on('groups.update', async (groups) => {
      this.emitEvent(instanceName, 'groups.update', { groups, instanceName });
    });

    // Handle presence update
    socket.ev.on('presence.update', async (presence) => {
      this.emitEvent(instanceName, 'presence.update', { ...presence, instanceName });
    });

    return { status: 'connecting' };
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(instanceName: string, message: proto.IWebMessageInfo) {
    try {
      const key = message.key;
      const remoteJid = key?.remoteJid;
      
      if (!remoteJid || key?.fromMe) return; // Skip own messages here, handle in send

      const msgContent = message.message;
      if (!msgContent) return;

      const contentType = getContentType(msgContent);
      let content = '';
      let messageType = 'text';
      let mediaUrl: string | undefined;
      let mediaMimetype: string | undefined;
      let mediaFilename: string | undefined;

      // Extract message content based on type
      switch (contentType) {
        case 'conversation':
          content = msgContent.conversation || '';
          break;
        case 'extendedTextMessage':
          content = msgContent.extendedTextMessage?.text || '';
          break;
        case 'imageMessage':
          messageType = 'image';
          content = msgContent.imageMessage?.caption || '';
          mediaMimetype = msgContent.imageMessage?.mimetype || 'image/jpeg';
          break;
        case 'videoMessage':
          messageType = 'video';
          content = msgContent.videoMessage?.caption || '';
          mediaMimetype = msgContent.videoMessage?.mimetype || 'video/mp4';
          break;
        case 'audioMessage':
          messageType = 'audio';
          mediaMimetype = msgContent.audioMessage?.mimetype || 'audio/ogg';
          break;
        case 'documentMessage':
          messageType = 'document';
          content = msgContent.documentMessage?.caption || '';
          mediaMimetype = msgContent.documentMessage?.mimetype || 'application/octet-stream';
          mediaFilename = msgContent.documentMessage?.fileName || 'document';
          break;
        case 'stickerMessage':
          messageType = 'sticker';
          break;
        case 'locationMessage':
          messageType = 'location';
          const loc = msgContent.locationMessage;
          content = `📍 Location: ${loc?.degreesLatitude}, ${loc?.degreesLongitude}`;
          break;
        case 'contactMessage':
          messageType = 'contact';
          content = msgContent.contactMessage?.displayName || 'Contact';
          break;
        case 'reactionMessage':
          messageType = 'reaction';
          content = msgContent.reactionMessage?.text || '';
          break;
        default:
          content = '[Unsupported message type]';
      }

      // Emit the message event
      this.emitEvent(instanceName, 'messages.upsert', {
        key: {
          remoteJid,
          fromMe: key?.fromMe || false,
          id: key?.id,
          participant: key?.participant,
        },
        message: msgContent,
        messageTimestamp: message.messageTimestamp,
        pushName: message.pushName,
        content,
        messageType,
        mediaUrl,
        mediaMimetype,
        mediaFilename,
        instanceName,
      });
    } catch (error) {
      console.error(`[baileys] Error handling message for ${instanceName}:`, error);
    }
  }

  /**
   * Emit event to registered handler
   */
  private emitEvent(instanceName: string, event: string, data: any) {
    const handler = this.eventHandlers.get(instanceName);
    if (handler) {
      handler(event, data);
    }
  }

  /**
   * Send text message
   */
  async sendTextMessage(instanceName: string, to: string, text: string, quotedMessageId?: string): Promise<WAMessage | undefined> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jid = this.formatJid(to);
    const content: AnyMessageContent = { text };

    if (quotedMessageId) {
      // We need to fetch the quoted message
      // For simplicity, just send without quote context
    }

    const result = await session.socket.sendMessage(jid, content);
    return result;
  }

  /**
   * Send media message (image, video, audio, document)
   */
  async sendMediaMessage(
    instanceName: string,
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    filename?: string,
    mimetype?: string,
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jid = this.formatJid(to);
    
    // Download media from URL
    const response = await fetch(mediaUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const detectedMimetype = mimetype || response.headers.get('content-type') || 'application/octet-stream';

    let content: AnyMessageContent;

    switch (mediaType) {
      case 'image':
        content = {
          image: buffer,
          caption,
          mimetype: detectedMimetype,
        };
        break;
      case 'video':
        content = {
          video: buffer,
          caption,
          mimetype: detectedMimetype,
        };
        break;
      case 'audio':
        content = {
          audio: buffer,
          mimetype: detectedMimetype,
          ptt: detectedMimetype.includes('ogg'), // Voice note if ogg
        };
        break;
      case 'document':
        content = {
          document: buffer,
          caption,
          mimetype: detectedMimetype,
          fileName: filename || 'document',
        };
        break;
      default:
        throw new Error(`Unsupported media type: ${mediaType}`);
    }

    const result = await session.socket.sendMessage(jid, content);
    return result;
  }

  /**
   * Send location message
   */
  async sendLocationMessage(
    instanceName: string,
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jid = this.formatJid(to);
    const result = await session.socket.sendMessage(jid, {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        name,
      },
    });
    return result;
  }

  /**
   * Send contact message
   */
  async sendContactMessage(
    instanceName: string,
    to: string,
    contactName: string,
    contactNumber: string,
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jid = this.formatJid(to);
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL;type=VOICE;waid=${contactNumber}:+${contactNumber}\nEND:VCARD`;

    const result = await session.socket.sendMessage(jid, {
      contacts: {
        displayName: contactName,
        contacts: [{ vcard }],
      },
    });
    return result;
  }

  /**
   * Send reaction
   */
  async sendReaction(
    instanceName: string,
    to: string,
    messageId: string,
    emoji: string,
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jid = this.formatJid(to);
    const result = await session.socket.sendMessage(jid, {
      react: {
        text: emoji,
        key: {
          remoteJid: jid,
          id: messageId,
        },
      },
    });
    return result;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(instanceName: string, remoteJid: string, messageIds: string[]): Promise<void> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jid = this.formatJid(remoteJid);
    const keys = messageIds.map(id => ({
      remoteJid: jid,
      id,
    }));

    await session.socket.readMessages(keys);
  }

  /**
   * Download media from a message
   */
  async downloadMedia(instanceName: string, message: WAMessage): Promise<Buffer> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        logger: this.logger,
        reuploadRequest: session.socket.updateMediaMessage,
      }
    );

    return buffer as Buffer;
  }

  /**
   * Get session status
   */
  getSessionStatus(instanceName: string): { status: string; qrCode?: string } {
    const session = this.sessions.get(instanceName);
    if (!session) {
      return { status: 'disconnected' };
    }
    return {
      status: session.status,
      qrCode: session.qrCode || undefined,
    };
  }

  /**
   * Get QR code for instance
   */
  getQRCode(instanceName: string): string | null {
    const session = this.sessions.get(instanceName);
    return session?.qrCode || null;
  }

  /**
   * Logout and disconnect session
   */
  async logout(instanceName: string): Promise<void> {
    const session = this.sessions.get(instanceName);
    if (session) {
      try {
        await session.socket.logout();
      } catch (e) {
        console.error(`[baileys] Logout error for ${instanceName}:`, e);
      }
      session.socket.end(undefined);
      this.sessions.delete(instanceName);
    }

    // Delete session files
    this.deleteSessionFiles(instanceName);

    // Update database
    await this.instanceRepository.update({ instanceName }, {
      status: 'disconnected',
      qrCode: null,
    });
  }

  /**
   * Disconnect session without logout (keeps credentials)
   */
  async disconnect(instanceName: string): Promise<void> {
    const session = this.sessions.get(instanceName);
    if (session) {
      session.socket.end(undefined);
      this.sessions.delete(instanceName);
    }

    await this.instanceRepository.update({ instanceName }, {
      status: 'disconnected',
    });
  }

  /**
   * Check if number is on WhatsApp
   */
  async isOnWhatsApp(instanceName: string, phoneNumber: string): Promise<{ exists: boolean; jid?: string }> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const [result] = await session.socket.onWhatsApp(phoneNumber);
    return {
      exists: !!result?.exists,
      jid: result?.jid,
    };
  }

  /**
   * Get profile picture URL
   */
  async getProfilePicture(instanceName: string, jid: string): Promise<string | undefined> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    try {
      const ppUrl = await session.socket.profilePictureUrl(this.formatJid(jid), 'image');
      return ppUrl;
    } catch {
      return undefined;
    }
  }

  /**
   * Get business profile
   */
  async getBusinessProfile(instanceName: string, jid: string): Promise<any> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    try {
      const profile = await session.socket.getBusinessProfile(this.formatJid(jid));
      return profile;
    } catch {
      return null;
    }
  }

  /**
   * Update profile status
   */
  async updateProfileStatus(instanceName: string, status: string): Promise<void> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    await session.socket.updateProfileStatus(status);
  }

  /**
   * Update profile picture
   */
  async updateProfilePicture(instanceName: string, imageUrl: string): Promise<void> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    
    const jid = session.socket.user?.id;
    if (jid) {
      await session.socket.updateProfilePicture(jid, buffer);
    }
  }

  /**
   * Get group metadata
   */
  async getGroupMetadata(instanceName: string, groupJid: string): Promise<any> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const metadata = await session.socket.groupMetadata(groupJid);
    return metadata;
  }

  /**
   * Create group
   */
  async createGroup(instanceName: string, name: string, participants: string[]): Promise<any> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jids = participants.map(p => this.formatJid(p));
    const group = await session.socket.groupCreate(name, jids);
    return group;
  }

  /**
   * Add participants to group
   */
  async addGroupParticipants(instanceName: string, groupJid: string, participants: string[]): Promise<any> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jids = participants.map(p => this.formatJid(p));
    const result = await session.socket.groupParticipantsUpdate(groupJid, jids, 'add');
    return result;
  }

  /**
   * Remove participants from group
   */
  async removeGroupParticipants(instanceName: string, groupJid: string, participants: string[]): Promise<any> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    const jids = participants.map(p => this.formatJid(p));
    const result = await session.socket.groupParticipantsUpdate(groupJid, jids, 'remove');
    return result;
  }

  /**
   * Leave group
   */
  async leaveGroup(instanceName: string, groupJid: string): Promise<void> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    await session.socket.groupLeave(groupJid);
  }

  /**
   * Update group subject (name)
   */
  async updateGroupSubject(instanceName: string, groupJid: string, subject: string): Promise<void> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    await session.socket.groupUpdateSubject(groupJid, subject);
  }

  /**
   * Update group description
   */
  async updateGroupDescription(instanceName: string, groupJid: string, description: string): Promise<void> {
    const session = this.sessions.get(instanceName);
    if (!session || session.status !== 'open') {
      throw new Error('Session not connected');
    }

    await session.socket.groupUpdateDescription(groupJid, description);
  }

  /**
   * Get all connected sessions
   */
  getConnectedSessions(): string[] {
    const connected: string[] = [];
    for (const [name, session] of this.sessions) {
      if (session.status === 'open') {
        connected.push(name);
      }
    }
    return connected;
  }

  /**
   * Initialize all saved instances on startup
   */
  async initializeSavedInstances(): Promise<void> {
    try {
      const instances = await this.instanceRepository.find();
      for (const instance of instances) {
        const sessionDir = path.join(this.sessionsDir, instance.instanceName);
        if (fs.existsSync(sessionDir)) {
          console.log(`[baileys] Restoring session: ${instance.instanceName}`);
          await this.createSession(instance.instanceName, instance.id);
        }
      }
    } catch (error) {
      console.error('[baileys] Error initializing saved instances:', error);
    }
  }

  /**
   * Format phone number to JID
   */
  private formatJid(number: string): string {
    // If already a JID, return as-is
    if (number.includes('@')) {
      return number;
    }

    // Remove non-numeric characters
    const cleaned = number.replace(/\D/g, '');
    
    // Determine if group or user
    if (cleaned.length > 15) {
      return `${cleaned}@g.us`;
    }
    return `${cleaned}@s.whatsapp.net`;
  }

  /**
   * Delete session files
   */
  private deleteSessionFiles(instanceName: string): void {
    const sessionDir = path.join(this.sessionsDir, instanceName);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }
}
