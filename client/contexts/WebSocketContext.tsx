import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { toast } from "@/hooks/use-toast";
import { getNotificationSettings } from '@/components/settings/NotificationSettings';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

// Audio player for notification sounds
const playNotificationSound = (type: 'reply' | 'new_conversation' | 'transfer' = 'reply') => {
  const settings = getNotificationSettings();
  if (!settings.soundEnabled) return;
  
  let audioSrc: string;
  switch (type) {
    case 'new_conversation':
      audioSrc = settings.customAudioNewConversation || settings.customAudioUrl || '/notification.mp3';
      break;
    case 'transfer':
      audioSrc = settings.customAudioTransfer || settings.customAudioUrl || '/notification.mp3';
      break;
    case 'reply':
    default:
      audioSrc = settings.customAudioUrl || '/notification.mp3';
      break;
  }
  
  const audio = new Audio(audioSrc);
  audio.volume = 0.5;
  audio.play().catch(console.error);
};

// Get toast position class
const getToastPosition = () => {
  const settings = getNotificationSettings();
  return settings.toastPosition || 'bottom-right';
};

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const selectedConversationRef = useRef<string | null>(null);

  // Track which conversation is currently open
  useEffect(() => {
    const handleConversationChange = (e: CustomEvent) => {
      selectedConversationRef.current = e.detail?.conversationId || null;
    };
    window.addEventListener('conversationSelected' as any, handleConversationChange);
    return () => {
      window.removeEventListener('conversationSelected' as any, handleConversationChange);
    };
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!session?.access_token) {
      return;
    }

    // Get the server URL - Socket.IO connects to root, not /api
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    // Remove /api suffix if present to get the base server URL
    const serverUrl = apiUrl.replace(/\/api\/?$/, '') || window.location.origin;
    
    console.log('[WebSocket] Connecting to:', serverUrl);
    
    const newSocket = io(serverUrl, {
      auth: {
        token: session.access_token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      console.log('[WebSocket] Connected:', newSocket.id);
      setIsConnected(true);
      
      // Re-join rooms after reconnection
      joinedRoomsRef.current.forEach(room => {
        newSocket.emit('join:room', { room });
      });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
    });

    // Handle real-time message events
    newSocket.on('message:created', (data) => {
      console.log('[WebSocket] Message created:', data);
      
      const settings = getNotificationSettings();
      const isCurrentConversation = data.conversation_id === selectedConversationRef.current;
      
      // Update messages query for this conversation
      queryClient.setQueryData(['whatsapp', 'messages', data.conversation_id], (old: any) => {
        if (!old) return old;
        const messages = Array.isArray(old) ? old : old.data || [];
        const exists = messages.some((m: any) => m.id === data.id || m.message_id === data.message_id);
        if (exists) return old;
        
        const updated = [...messages, data].sort((a, b) => {
          const timeA = new Date(a.timestamp || a.created_at).getTime();
          const timeB = new Date(b.timestamp || b.created_at).getTime();
          return timeA - timeB;
        });
        return Array.isArray(old) ? updated : { ...old, data: updated };
      });
      
      // Invalidate to get fresh data
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'messages', data.conversation_id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'conversations'] 
      });
      
      // Show notification for incoming messages (not from me, not in current conversation)
      if (!data.is_from_me && !isCurrentConversation && settings.enabled && settings.showForReplies) {
        playNotificationSound('reply');
        toast({
          title: data.contact_name || 'Nova mensagem',
          description: (data.content || 'Nova mensagem').substring(0, 80),
        });
      }
    });

    newSocket.on('message:updated', (data) => {
      console.log('[WebSocket] Message updated:', data);
      queryClient.setQueryData(['whatsapp', 'messages', data.conversation_id], (old: any) => {
        if (!old) return old;
        const messages = Array.isArray(old) ? old : old.data || [];
        const updated = messages.map((msg: any) => {
          if (msg.id === data.id || msg.message_id === data.message_id) {
            return { ...msg, ...data };
          }
          return msg;
        });
        return Array.isArray(old) ? updated : { ...old, data: updated };
      });
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'messages', data.conversation_id] 
      });
    });

    newSocket.on('message:status', (data) => {
      console.log('[WebSocket] Message status changed:', data);
      queryClient.setQueryData(['whatsapp', 'messages', data.conversationId], (old: any) => {
        if (!old) return old;
        const messages = Array.isArray(old) ? old : old.data || [];
        const updated = messages.map((msg: any) => 
          msg.id === data.messageId || msg.message_id === data.messageId
            ? { ...msg, status: data.status }
            : msg
        );
        return Array.isArray(old) ? updated : { ...old, data: updated };
      });
    });

    newSocket.on('message:deleted', (data) => {
      console.log('[WebSocket] Message deleted:', data);
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'messages', data.conversation_id] 
      });
    });

    newSocket.on('conversation:created', (data) => {
      console.log('[WebSocket] Conversation created:', data);
      const settings = getNotificationSettings();
      
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'conversations'] 
      });
      
      // Show notification for new conversations
      if (settings.enabled && settings.showForNewConversation) {
        playNotificationSound('new_conversation');
        toast({
          title: 'Nova conversa',
          description: `${data.contact_name || 'Contato'} iniciou uma nova conversa`,
        });
      }
    });

    newSocket.on('conversation:updated', (data) => {
      console.log('[WebSocket] Conversation updated:', data);
      
      // Update conversation in cache directly
      queryClient.setQueryData(['whatsapp', 'conversations'], (old: any) => {
        if (!old?.conversations) return old;
        return {
          ...old,
          conversations: old.conversations.map((conv: any) => 
            conv.id === data.id ? { ...conv, ...data } : conv
          )
        };
      });
    });

    newSocket.on('conversations:updated', (data) => {
      console.log('[WebSocket] Conversations list updated:', data);
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'conversations'] 
      });
    });

    newSocket.on('typing', (data) => {
      console.log('[WebSocket] Typing:', data);
    });

    newSocket.on('notification', (data) => {
      console.log('[WebSocket] Notification:', data);
    });

    setSocket(newSocket);

    return () => {
      console.log('[WebSocket] Cleaning up connection');
      newSocket.disconnect();
    };
  }, [session?.access_token, queryClient]);

  const joinConversation = useCallback((conversationId: string) => {
    if (socket && isConnected) {
      const room = `conversation:${conversationId}`;
      socket.emit('join:room', { room });
      joinedRoomsRef.current.add(room);
      selectedConversationRef.current = conversationId;
      console.log('[WebSocket] Joined room:', room);
      
      // Dispatch event for notification context
      window.dispatchEvent(new CustomEvent('conversationSelected', { detail: { conversationId } }));
    }
  }, [socket, isConnected]);

  const leaveConversation = useCallback((conversationId: string) => {
    if (socket && isConnected) {
      const room = `conversation:${conversationId}`;
      socket.emit('leave:room', { room });
      joinedRoomsRef.current.delete(room);
      if (selectedConversationRef.current === conversationId) {
        selectedConversationRef.current = null;
      }
      console.log('[WebSocket] Left room:', room);
      
      // Dispatch event for notification context
      window.dispatchEvent(new CustomEvent('conversationSelected', { detail: { conversationId: null } }));
    }
  }, [socket, isConnected]);

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    if (socket && isConnected) {
      socket.emit('typing', {
        conversationId,
        userId: user?.id,
        isTyping,
      });
    }
  }, [socket, isConnected, user?.id]);

  return (
    <WebSocketContext.Provider value={{
      socket,
      isConnected,
      joinConversation,
      leaveConversation,
      sendTyping,
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    // Return a safe default if used outside provider (during SSR or initial render)
    return {
      socket: null,
      isConnected: false,
      joinConversation: () => {},
      leaveConversation: () => {},
      sendTyping: () => {},
    };
  }
  return context;
}
