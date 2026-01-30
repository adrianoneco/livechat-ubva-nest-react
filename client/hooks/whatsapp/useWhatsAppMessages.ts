import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/api/client';
import { Tables } from '@/integrations/api/types';
import { useMarkMessagesRead } from './useMarkMessagesRead';
import { useWebSocket } from '@/contexts/WebSocketContext';

type Message = Tables<'whatsapp_messages'>;

export const useWhatsAppMessages = (conversationId: string | null) => {
  const queryClient = useQueryClient();
  const { mutate: markReadMutate } = useMarkMessagesRead();
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { socket, isConnected, joinConversation, leaveConversation } = useWebSocket();
  
  // Stable reference for mutate using ref
  const markReadMutateRef = useRef(markReadMutate);
  markReadMutateRef.current = markReadMutate;

  // Mark as read function - using ref for stable identity
  const markAsRead = useCallback((convId: string) => {
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
    }
    // Small delay to ensure we're actually viewing the conversation
    markReadTimeoutRef.current = setTimeout(() => {
      console.log('[useWhatsAppMessages] Marking messages as read for:', convId);
      markReadMutateRef.current({ conversationId: convId });
    }, 200);
  }, []);

  const { data: messages = [], isLoading, error, refetch } = useQuery({
    queryKey: ['whatsapp', 'messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
    // Disable refetchInterval - rely on realtime subscriptions for updates
    refetchInterval: false,
    // Keep data fresh but don't refetch too aggressively
    staleTime: 5000,
    // Cache messages for 10 minutes
    gcTime: 600000,
  });

  // Join/leave conversation room for WebSocket updates
  useEffect(() => {
    if (!conversationId) return;
    
    joinConversation(conversationId);
    
    return () => {
      leaveConversation(conversationId);
    };
  }, [conversationId, joinConversation, leaveConversation]);

  // Mark messages as read when conversation is opened/changed (configurable)
  const AUTO_MARK_READ_ON_OPEN = import.meta.env.VITE_AUTO_MARK_READ_ON_OPEN !== 'false';

  useEffect(() => {
    if (conversationId && AUTO_MARK_READ_ON_OPEN) {
      // Force mark as read every time conversation is opened
      markAsRead(conversationId);
    }

    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
      }
    };
  }, [conversationId, markAsRead, AUTO_MARK_READ_ON_OPEN]);

  // WebSocket realtime subscription for messages (enhanced)
  useEffect(() => {
    if (!conversationId || !socket || !isConnected) return;

    console.log('[useWhatsAppMessages] Setting up WebSocket subscription for:', conversationId);

    // Handle new messages
    const handleMessageCreated = (data: any) => {
      if (data.conversation_id !== conversationId) return;
      console.log('[useWhatsAppMessages] Message created via WebSocket:', data);
      
      queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
        const newMessage = data as Message;
        const exists = old.some(msg => msg.id === newMessage.id || msg.message_id === newMessage.message_id);
        if (exists) return old;
        
        const updated = [...old, newMessage];
        updated.sort((a, b) => {
          const timeA = new Date(a.timestamp || a.created_at).getTime();
          const timeB = new Date(b.timestamp || b.created_at).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        return updated;
      });
      
      // Mark as read if from client (they sent, we're viewing)
      if (!data.is_from_me) {
        markAsRead(conversationId);
      }
    };

    // Handle message updates
    const handleMessageUpdated = (data: any) => {
      if (data.conversation_id !== conversationId) return;
      console.log('[useWhatsAppMessages] Message updated via WebSocket:', data);
      
      queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
        return old.map(msg => {
          if (msg.id === data.id || msg.message_id === data.message_id) {
            return { ...msg, ...data };
          }
          return msg;
        });
      });
      
      // If this update includes reaction data, invalidate reactions query
      if (data.reaction) {
        console.log('[useWhatsAppMessages] Reaction update detected, invalidating reactions');
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'reactions', conversationId] });
      }
    };

    // Handle status changes
    const handleMessageStatus = (data: any) => {
      if (data.conversationId !== conversationId) return;
      console.log('[useWhatsAppMessages] Message status changed via WebSocket:', data);
      
      queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
        return old.map(msg => {
          if (msg.id === data.messageId || msg.message_id === data.messageId) {
            return { ...msg, status: data.status };
          }
          return msg;
        });
      });
    };

    // Handle message deletions
    const handleMessageDeleted = (data: any) => {
      if (data.conversation_id !== conversationId) return;
      console.log('[useWhatsAppMessages] Message deleted via WebSocket:', data);
      
      queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
        return old.filter(msg => msg.id !== data.message_id && msg.message_id !== data.message_id);
      });
    };

    socket.on('message:created', handleMessageCreated);
    socket.on('message:updated', handleMessageUpdated);
    socket.on('message:status', handleMessageStatus);
    socket.on('message:deleted', handleMessageDeleted);

    return () => {
      console.log('[useWhatsAppMessages] Cleaning up WebSocket subscription for:', conversationId);
      socket.off('message:created', handleMessageCreated);
      socket.off('message:updated', handleMessageUpdated);
      socket.off('message:status', handleMessageStatus);
      socket.off('message:deleted', handleMessageDeleted);
    };
  }, [conversationId, socket, isConnected, queryClient, markAsRead]);

  return {
    messages,
    isLoading,
    error,
    refetch,
  };
};
