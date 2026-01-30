import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { LeadStatus } from './useLeads';

export interface LeadStatusHistory {
  id: string;
  lead_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
  changed_by_profile?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export const useLeadStatusHistory = (leadId?: string) => {
  const queryClient = useQueryClient();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['lead-status-history', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('lead_status_history')
        .select(`
          *,
          changed_by_profile:profiles!lead_status_history_changed_by_fkey(id, full_name, avatar_url)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadStatusHistory[];
    },
    enabled: !!leadId,
  });

  const recordStatusChange = useMutation({
    mutationFn: async ({
      leadId,
      oldStatus,
      newStatus,
      reason,
    }: {
      leadId: string;
      oldStatus: LeadStatus | null;
      newStatus: LeadStatus;
      reason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('lead_status_history')
        .insert({
          lead_id: leadId,
          old_status: oldStatus,
          new_status: newStatus,
          changed_by: user?.id || null,
          reason,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-status-history', variables.leadId] });
    },
  });

  return {
    history,
    isLoading,
    recordStatusChange,
  };
};
