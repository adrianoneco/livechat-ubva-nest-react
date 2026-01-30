import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log('[WebSocket] Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('[WebSocket] Client disconnected:', client.id);
  }

  @SubscribeMessage('join:room')
  handleJoinRoom(client: Socket, data: { room: string }) {
    client.join(data.room);
    console.log(`[WebSocket] ${client.id} joined ${data.room}`);
  }

  @SubscribeMessage('leave:room')
  handleLeaveRoom(client: Socket, data: { room: string }) {
    client.leave(data.room);
    console.log(`[WebSocket] ${client.id} left ${data.room}`);
  }

  @SubscribeMessage('join:conversation')
  handleJoinConversation(client: Socket, conversationId: string) {
    client.join(`conversation:${conversationId}`);
    console.log(`[WebSocket] ${client.id} joined conversation:${conversationId}`);
  }

  @SubscribeMessage('leave:conversation')
  handleLeaveConversation(client: Socket, conversationId: string) {
    client.leave(`conversation:${conversationId}`);
    console.log(`[WebSocket] ${client.id} left conversation:${conversationId}`);
  }

  @SubscribeMessage('join:user')
  handleJoinUser(client: Socket, userId: string) {
    client.join(`user:${userId}`);
    console.log(`[WebSocket] ${client.id} joined user:${userId}`);
  }

  @SubscribeMessage('join:instance')
  handleJoinInstance(client: Socket, instanceId: string) {
    client.join(`instance:${instanceId}`);
    console.log(`[WebSocket] ${client.id} joined instance:${instanceId}`);
  }

  @SubscribeMessage('typing')
  handleTyping(client: Socket, data: { conversationId: string; userId: string; isTyping: boolean }) {
    if (data.isTyping) {
      client.to(`conversation:${data.conversationId}`).emit('typing', { ...data, type: 'started' });
    } else {
      client.to(`conversation:${data.conversationId}`).emit('typing', { ...data, type: 'stopped' });
    }
  }

  // Emit methods for services to use
  messageCreated(conversationId: string, message: any) {
    const payload = { ...message, conversation_id: conversationId };
    console.log('[WebSocket] Emitting message:created for conversation:', conversationId);
    this.server.to(`conversation:${conversationId}`).emit('message:created', payload);
    this.server.emit('message:created', payload);
    this.server.emit('conversations:updated', { conversationId, type: 'new_message' });
  }

  messageUpdated(conversationId: string, message: any) {
    const payload = { ...message, conversation_id: conversationId };
    console.log('[WebSocket] Emitting message:updated for conversation:', conversationId);
    this.server.to(`conversation:${conversationId}`).emit('message:updated', payload);
    this.server.emit('message:updated', payload);
  }

  messageDeleted(conversationId: string, messageId: string) {
    const payload = { conversation_id: conversationId, message_id: messageId };
    console.log('[WebSocket] Emitting message:deleted for conversation:', conversationId);
    this.server.to(`conversation:${conversationId}`).emit('message:deleted', payload);
    this.server.emit('message:deleted', payload);
  }

  messageStatusChanged(conversationId: string, messageId: string, status: string) {
    const payload = { conversationId, messageId, status };
    console.log('[WebSocket] Emitting message:status for conversation:', conversationId, 'status:', status);
    this.server.to(`conversation:${conversationId}`).emit('message:status', payload);
    this.server.emit('message:status', payload);
  }

  conversationCreated(conversation: any) {
    console.log('[WebSocket] Emitting conversation:created:', conversation.id);
    this.server.emit('conversation:created', conversation);
    this.server.emit('conversations:updated', { conversationId: conversation.id, type: 'created' });
  }

  conversationUpdated(conversationId: string, updates: any) {
    const id = updates.id || conversationId;
    console.log('[WebSocket] Emitting conversation:updated:', id);
    this.server.to(`conversation:${id}`).emit('conversation:updated', { id, ...updates });
    this.server.emit('conversations:updated', { conversationId: id, type: 'updated', ...updates });
  }

  typingStarted(conversationId: string, userId: string, userName: string) {
    this.server.to(`conversation:${conversationId}`).emit('typing:started', { conversationId, userId, userName });
  }

  typingStopped(conversationId: string, userId: string) {
    this.server.to(`conversation:${conversationId}`).emit('typing:stopped', { conversationId, userId });
  }

  notificationCreated(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification:created', notification);
  }

  instanceStatusChanged(instanceId: string, status: string) {
    this.server.to(`instance:${instanceId}`).emit('instance:status', { instanceId, status });
    this.server.emit('instances:updated', { instanceId, status });
  }
}
