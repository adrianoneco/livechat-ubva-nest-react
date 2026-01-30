import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface EscalationQueueItem {
  id: string;
  conversation_id: string;
  sector_id: string | null;
  instance_id: string | null;
  ai_summary: string | null;
  escalation_reason: string;
  detected_intent: string | null;
  lead_score: number | null;
  customer_sentiment: string | null;
  priority: number;
  status: 'pending' | 'assigned' | 'resolved' | 'abandoned' | 'expired';
  assigned_to: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  // Joined data
  conversation?: {
    id: string;
    contact?: {
      name: string | null;
      phone_number: string;
    };
  };
  sector?: {
    id: string;
    name: string;
  };
  assigned_user?: {
    id: string;
    full_name: string | null;
  };
}

export interface EscalationQueueStats {
  pending: number;
  assigned: number;
  avgWaitTimeSeconds: number;
  highPriority: number;
}

export const useEscalationQueue = (options?: { sectorId?: string; status?: string }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: escalations = [], isLoading, error } = useQuery({
    queryKey: ['escalation-queue', options?.sectorId, options?.status],
    queryFn: async () => {
      let query = supabase
        .from('escalation_queue')
        .select(`
          *,
          conversation:whatsapp_conversations(
            id,
            contact:whatsapp_contacts(name, phone_number)
          ),
          sector:sectors(id, name),
          assigned_user:profiles!escalation_queue_assigned_to_fkey(id, full_name)
        `)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

      if (options?.sectorId) {
        query = query.eq('sector_id', options.sectorId);
      }

      if (options?.status) {
        query = query.eq('status', options.status);
      } else {
        query = query.in('status', ['pending', 'assigned']);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as EscalationQueueItem[];
    },
    refetchInterval: 30000,
  });

  // Calculate stats
  const stats: EscalationQueueStats = {
    pending: escalations.filter(e => e.status === 'pending').length,
    assigned: escalations.filter(e => e.status === 'assigned').length,
    avgWaitTimeSeconds: escalations.length > 0
      ? escalations.reduce((sum, e) => {
          const waitTime = Math.floor((Date.now() - new Date(e.created_at).getTime()) / 1000);
          return sum + waitTime;
        }, 0) / escalations.length
      : 0,
    highPriority: escalations.filter(e => e.priority >= 2).length,
  };

  // Realtime subscription
  useEffect(() => {
    let escalationInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel('escalation-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'escalation_queue',
        },
        () => {
          // Debounce invalidation to prevent excessive re-renders
          clearTimeout(escalationInvalidateTimeout);
          escalationInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(escalationInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const acceptEscalation = useMutation({
    mutationFn: async (escalationId: string) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('escalation_queue')
        .update({
          assigned_to: user.id,
          assigned_at: new Date().toISOString(),
          status: 'assigned',
        })
        .eq('id', escalationId)
        .eq('status', 'pending');

      if (error) throw error;

      // Get conversation ID to update assignment
      const { data: escalation } = await supabase
        .from('escalation_queue')
        .select('conversation_id')
        .eq('id', escalationId)
        .single();

      if (escalation) {
        await supabase
          .from('whatsapp_conversations')
          .update({ 
            assigned_to: user.id,
            conversation_mode: 'human'
          })
          .eq('id', escalation.conversation_id);
      }

      return escalationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      toast.success('Escalação aceita');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao aceitar escalação');
    },
  });

  const resolveEscalation = useMutation({
    mutationFn: async ({ escalationId, notes }: { escalationId: string; notes?: string }) => {
      const { error } = await supabase
        .from('escalation_queue')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: notes,
        })
        .eq('id', escalationId);

      if (error) throw error;
      return escalationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
      toast.success('Escalação resolvida');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao resolver escalação');
    },
  });

  const abandonEscalation = useMutation({
    mutationFn: async (escalationId: string) => {
      const { error } = await supabase
        .from('escalation_queue')
        .update({
          status: 'abandoned',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', escalationId);

      if (error) throw error;
      return escalationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
    },
  });

  const transferEscalation = useMutation({
    mutationFn: async ({ escalationId, toUserId }: { escalationId: string; toUserId: string }) => {
      const { error } = await supabase
        .from('escalation_queue')
        .update({
          assigned_to: toUserId,
          assigned_at: new Date().toISOString(),
          status: 'assigned',
        })
        .eq('id', escalationId);

      if (error) throw error;

      // Create notification for new assignee
      await supabase
        .from('escalation_notifications')
        .insert({
          escalation_id: escalationId,
          user_id: toUserId,
          notification_type: 'reassignment',
        });

      return escalationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
      toast.success('Escalação transferida');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao transferir escalação');
    },
  });

  return {
    escalations,
    stats,
    isLoading,
    error,
    acceptEscalation,
    resolveEscalation,
    abandonEscalation,
    transferEscalation,
  };
};
