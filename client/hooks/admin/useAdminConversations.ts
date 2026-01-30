import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { useEffect } from 'react';

export interface AdminConversationTicket {
  id: string;
  status: string;
  created_at: string;
  closed_at: string | null;
}

export interface AdminConversation {
  id: string;
  contact_id: string;
  instance_id: string;
  assigned_to: string | null;
  status: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
  created_at: string;
  contact: {
    id: string;
    name: string;
    phone_number: string;
    profile_picture_url: string | null;
  } | null;
  instance: {
    id: string;
    name: string;
    status: string | null;
  } | null;
  assigned_agent: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    status: string | null;
  } | null;
  ticket: AdminConversationTicket | null;
}

interface AdminConversationsFilters {
  status?: string;
  instanceId?: string;
  agentId?: string;
  search?: string;
}

export const useAdminConversations = (filters?: AdminConversationsFilters) => {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'conversations', filters],
    queryFn: async () => {
      // Use dedicated admin conversations endpoint with JOINs
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'all') {
        params.set('status', filters.status);
      }
      if (filters?.instanceId && filters.instanceId !== 'all') {
        params.set('instance_id', filters.instanceId);
      }
      if (filters?.agentId) {
        params.set('agent_id', filters.agentId);
      }
      if (filters?.search) {
        params.set('search', filters.search);
      }

      const url = `/api/admin/conversations${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch admin conversations');
      }

      const conversations = await response.json();
      return conversations as AdminConversation[];
    },
  });

  // Real-time subscription for conversation updates
  useEffect(() => {
    let conversationInvalidateTimeout: NodeJS.Timeout;
    let messageInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel('admin-conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_conversations',
        },
        () => {
          // Debounce invalidation to prevent excessive re-renders
          clearTimeout(conversationInvalidateTimeout);
          conversationInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'conversations'] });
          }, 100);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
        },
        () => {
          // Debounce invalidation to prevent excessive re-renders
          clearTimeout(messageInvalidateTimeout);
          messageInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'conversations'] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(conversationInvalidateTimeout);
      clearTimeout(messageInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Calculate statistics
  const conversations = data ?? [];
  const stats = {
    total: conversations.length,
    active: conversations.filter(c => c.status === 'active').length,
    waiting: conversations.filter(c => c.status === 'waiting').length,
    unassigned: conversations.filter(c => !c.assigned_to).length,
    withUnread: conversations.filter(c => (c.unread_count ?? 0) > 0).length,
    slaViolated: conversations.filter(c => c.ticket?.sla_violated_at).length,
  };

  return {
    conversations: data ?? [],
    isLoading,
    error,
    refetch,
    stats,
  };
};
