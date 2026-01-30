import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/api/client';
import { Tables } from '@/integrations/api/types';
import { useWebSocket } from '@/contexts/WebSocketContext';

type Conversation = Tables<'whatsapp_conversations'>;
type Contact = Tables<'whatsapp_contacts'>;

interface ConversationWithContact extends Conversation {
  contact: Contact;
  isLastMessageFromMe?: boolean;
  instance?: { id: string; name: string } | null;
}

interface ConversationsFilters {
  instanceId?: string;
  search?: string;
  status?: string;
  assignedTo?: string;
  unassigned?: boolean;
  isGroup?: boolean;
}

export interface ConversationsResult {
  conversations: ConversationWithContact[];
  totalCount: number;
  totalPages: number;
  unreadCount: number;
  waitingCount: number;
}

export const useWhatsAppConversations = (filters?: ConversationsFilters) => {
  const queryClient = useQueryClient();
  const { socket, isConnected } = useWebSocket();
  const invalidateTimeoutRef = useRef<NodeJS.Timeout>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['whatsapp', 'conversations', filters],
    queryFn: async () => {
      // Query 1: Get all conversations (no pagination)
      let query = supabase
        .from('whatsapp_conversations')
        .select(`
          *,
          contact:whatsapp_contacts!inner(*),
          assigned_profile:profiles(id, full_name, avatar_url),
          instance:whatsapp_instances(id, name)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (filters?.instanceId) {
        query = query.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        query = query.is('assigned_to', null);
      }

      // Note: isGroup filter is applied client-side because Supabase
      // has limitations filtering on related table fields

      const { data: conversationsData, error } = await query;

      if (error) throw error;

      let result = conversationsData as unknown as ConversationWithContact[];

      // Apply isGroup filter client-side for reliability
      if (filters?.isGroup !== undefined) {
        result = result.filter(conv => conv.contact?.is_group === filters.isGroup);
      }

      // Query 2: Get total count (we'll adjust this based on client-side filtering)
      let countQuery = supabase
        .from('whatsapp_conversations')
        .select('*, contact:whatsapp_contacts!inner(*)', { count: 'exact', head: true });

      if (filters?.instanceId) {
        countQuery = countQuery.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        countQuery = countQuery.eq('status', filters.status);
      }

      if (filters?.assignedTo) {
        countQuery = countQuery.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        countQuery = countQuery.is('assigned_to', null);
      }

      // Note: isGroup count is calculated from filtered result

      const { count: totalCountRaw } = await countQuery;
      // Use filtered result length as totalCount when filtering by isGroup
      const totalCount = filters?.isGroup !== undefined ? result.length : totalCountRaw;

      // Query 3: Get unread count (calculated from filtered results)
      let unreadQuery = supabase
        .from('whatsapp_conversations')
        .select('unread_count, contact:whatsapp_contacts!inner(*)', { count: 'exact' })
        .gt('unread_count', 0);

      if (filters?.instanceId) {
        unreadQuery = unreadQuery.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        unreadQuery = unreadQuery.eq('status', filters.status);
      }

      if (filters?.assignedTo) {
        unreadQuery = unreadQuery.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        unreadQuery = unreadQuery.is('assigned_to', null);
      }

      // Note: isGroup unreadCount is calculated from filtered result
      const { count: unreadCountRaw } = await unreadQuery;
      // Calculate unreadCount from filtered result when filtering by isGroup
      const unreadCount = filters?.isGroup !== undefined 
        ? result.filter(c => (c.unread_count || 0) > 0).length 
        : unreadCountRaw;

      // Buscar is_from_me da última mensagem de cada conversa (só das paginadas)
      const conversationIds = result.map(c => c.id);
      
      // Use filtered result IDs for waitingCount calculation when filtering by isGroup
      let allConversationIds = conversationIds;
      
      // Only query all conversations if not filtering by isGroup
      if (filters?.isGroup === undefined) {
        let allConversationsQuery = supabase
          .from('whatsapp_conversations')
          .select('id, contact:whatsapp_contacts!inner(*)');

        if (filters?.instanceId) {
          allConversationsQuery = allConversationsQuery.eq('instance_id', filters.instanceId);
        }

        if (filters?.status) {
          allConversationsQuery = allConversationsQuery.eq('status', filters.status);
        }

        if (filters?.assignedTo) {
          allConversationsQuery = allConversationsQuery.eq('assigned_to', filters.assignedTo);
        }

        if (filters?.unassigned) {
          allConversationsQuery = allConversationsQuery.is('assigned_to', null);
        }

        const { data: allConversations } = await allConversationsQuery;
        allConversationIds = allConversations?.map(c => c.id) || [];
      }

      if (allConversationIds.length > 0) {
        const { data: allLastMessages } = await supabase
          .from('whatsapp_messages')
          .select('conversation_id, is_from_me, timestamp')
          .in('conversation_id', allConversationIds)
          .order('timestamp', { ascending: false });

        if (allLastMessages) {
          // Agrupar por conversation_id e pegar a primeira (mais recente)
          const lastMessageMap = new Map<string, boolean>();
          allLastMessages.forEach(msg => {
            if (!lastMessageMap.has(msg.conversation_id)) {
              lastMessageMap.set(msg.conversation_id, msg.is_from_me || false);
            }
          });

          // Aplicar aos resultados paginados
          result = result.map(conv => ({
            ...conv,
            isLastMessageFromMe: lastMessageMap.get(conv.id),
          }));

          // Calcular waitingCount (mensagens do cliente sem resposta)
          const waitingCount = allConversationIds.filter(
            id => lastMessageMap.get(id) === false
          ).length;

          return {
            conversations: result,
            totalCount: totalCount || 0,
            totalPages: 1,
            unreadCount: unreadCount || 0,
            waitingCount,
          } as ConversationsResult;
        }
      }

      return {
        conversations: result,
        totalCount: totalCount || 0,
        totalPages: 1,
        unreadCount: unreadCount || 0,
        waitingCount: 0,
      } as ConversationsResult;
    },
  });

  // WebSocket realtime subscription for conversation list updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    console.log('[useWhatsAppConversations] Setting up WebSocket subscriptions');
    
    const debouncedInvalidate = () => {
      if (invalidateTimeoutRef.current) {
        clearTimeout(invalidateTimeoutRef.current);
      }
      invalidateTimeoutRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      }, 100);
    };

    // Handle conversation updates from WebSocket
    const handleConversationsUpdated = (data: any) => {
      console.log('[useWhatsAppConversations] conversations:updated event:', data);
      debouncedInvalidate();
    };

    const handleConversationCreated = (data: any) => {
      console.log('[useWhatsAppConversations] conversation:created event:', data);
      debouncedInvalidate();
    };

    const handleConversationUpdated = (data: any) => {
      console.log('[useWhatsAppConversations] conversation:updated event:', data);
      
      const convId = data.id || data.conversationId;
      
      // If unread_count is updated, immediately update the cache optimistically
      if (data.unread_count !== undefined && convId) {
        console.log('[useWhatsAppConversations] Updating unread_count immediately for conversation:', convId, 'to', data.unread_count);
        
        // Optimistically update the conversations list cache
        queryClient.setQueryData(['whatsapp', 'conversations', filters], (old: any) => {
          if (!old?.conversations) return old;
          
          return {
            ...old,
            conversations: old.conversations.map((conv: any) => 
              conv.id === convId ? { ...conv, unread_count: data.unread_count } : conv
            )
          };
        });
      }
      
      debouncedInvalidate();
    };

    const handleMessageCreated = (data: any) => {
      console.log('[useWhatsAppConversations] message:created event (for conv list):', data);
      debouncedInvalidate();
    };

    socket.on('conversations:updated', handleConversationsUpdated);
    socket.on('conversation:created', handleConversationCreated);
    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('message:created', handleMessageCreated);

    return () => {
      console.log('[useWhatsAppConversations] Cleaning up WebSocket subscriptions');
      if (invalidateTimeoutRef.current) {
        clearTimeout(invalidateTimeoutRef.current);
      }
      socket.off('conversations:updated', handleConversationsUpdated);
      socket.off('conversation:created', handleConversationCreated);
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('message:created', handleMessageCreated);
    };
  }, [socket, isConnected, queryClient]);

  return {
    conversations: data?.conversations || [],
    totalCount: data?.totalCount || 0,
    totalPages: data?.totalPages || 0,
    unreadCount: data?.unreadCount || 0,
    waitingCount: data?.waitingCount || 0,
    isLoading,
    error,
  };
};
