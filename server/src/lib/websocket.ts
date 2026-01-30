import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

let io: SocketIOServer | null = null;

export function initWebSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: false,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    console.log('[WebSocket] Client connected:', socket.id);

    // Generic room join/leave
    socket.on('join:room', ({ room }: { room: string }) => {
      socket.join(room);
      console.log(`[WebSocket] ${socket.id} joined ${room}`);
    });

    socket.on('leave:room', ({ room }: { room: string }) => {
      socket.leave(room);
      console.log(`[WebSocket] ${socket.id} left ${room}`);
    });

    // Legacy: Join rooms for specific conversations
    socket.on('join:conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`[WebSocket] ${socket.id} joined conversation:${conversationId}`);
    });

    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`[WebSocket] ${socket.id} left conversation:${conversationId}`);
    });

    // Join room for user-specific updates
    socket.on('join:user', (userId: string) => {
      socket.join(`user:${userId}`);
      console.log(`[WebSocket] ${socket.id} joined user:${userId}`);
    });

    // Join room for instance updates
    socket.on('join:instance', (instanceId: string) => {
      socket.join(`instance:${instanceId}`);
      console.log(`[WebSocket] ${socket.id} joined instance:${instanceId}`);
    });

    // Typing indicator relay
    socket.on('typing', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (data.isTyping) {
        socket.to(`conversation:${data.conversationId}`).emit('typing', { ...data, type: 'started' });
      } else {
        socket.to(`conversation:${data.conversationId}`).emit('typing', { ...data, type: 'stopped' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Client disconnected:', socket.id, reason);
    });
  });

  console.log('[WebSocket] Server initialized');
  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

// Emit events for real-time updates
export const wsEmit = {
  // Message events
  messageCreated: (conversationId: string, message: any) => {
    if (!io) return;
    const payload = { ...message, conversation_id: conversationId };
    console.log('[WebSocket] Emitting message:created for conversation:', conversationId);
    // Emit to conversation room
    io.to(`conversation:${conversationId}`).emit('message:created', payload);
    // Also emit globally for conversation list updates and clients not yet in room
    io.emit('message:created', payload);
    io.emit('conversations:updated', { conversationId, type: 'new_message' });
  },

  messageUpdated: (conversationId: string, message: any) => {
    if (!io) return;
    const payload = { ...message, conversation_id: conversationId };
    console.log('[WebSocket] Emitting message:updated for conversation:', conversationId);
    io.to(`conversation:${conversationId}`).emit('message:updated', payload);
    io.emit('message:updated', payload);
  },

  messageDeleted: (conversationId: string, messageId: string) => {
    if (!io) return;
    const payload = { conversation_id: conversationId, message_id: messageId };
    console.log('[WebSocket] Emitting message:deleted for conversation:', conversationId);
    io.to(`conversation:${conversationId}`).emit('message:deleted', payload);
    io.emit('message:deleted', payload);
  },

  messageStatusChanged: (conversationId: string, messageId: string, status: string) => {
    if (!io) return;
    const payload = { conversationId, messageId, status };
    console.log('[WebSocket] Emitting message:status for conversation:', conversationId, 'status:', status);
    io.to(`conversation:${conversationId}`).emit('message:status', payload);
    io.emit('message:status', payload);
  },

  // Conversation events
  conversationCreated: (conversation: any) => {
    if (!io) return;
    console.log('[WebSocket] Emitting conversation:created:', conversation.id);
    io.emit('conversation:created', conversation);
    io.emit('conversations:updated', { conversationId: conversation.id, type: 'created' });
  },

  conversationUpdated: (instanceIdOrConvId: string, updates: any) => {
    if (!io) return;
    const conversationId = updates.id || instanceIdOrConvId;
    console.log('[WebSocket] Emitting conversation:updated:', conversationId);
    io.to(`conversation:${conversationId}`).emit('conversation:updated', { id: conversationId, ...updates });
    io.emit('conversations:updated', { conversationId, type: 'updated', ...updates });
  },

  // Typing indicators
  typingStarted: (conversationId: string, userId: string, userName: string) => {
    if (!io) return;
    io.to(`conversation:${conversationId}`).emit('typing:started', { conversationId, userId, userName });
  },

  typingStopped: (conversationId: string, userId: string) => {
    if (!io) return;
    io.to(`conversation:${conversationId}`).emit('typing:stopped', { conversationId, userId });
  },

  // Notification events
  notificationCreated: (userId: string, notification: any) => {
    if (!io) return;
    io.to(`user:${userId}`).emit('notification:created', notification);
  },

  // Instance status events
  instanceStatusChanged: (instanceId: string, status: string) => {
    if (!io) return;
    io.to(`instance:${instanceId}`).emit('instance:status', { instanceId, status });
    io.emit('instances:updated', { instanceId, status });
  },
};

export default { initWebSocket, getIO, wsEmit };
