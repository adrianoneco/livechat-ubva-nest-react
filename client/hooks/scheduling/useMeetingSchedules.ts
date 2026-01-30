import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface MeetingSchedule {
  id: string;
  conversation_id: string | null;
  contact_id: string | null;
  assigned_agent_id: string | null;
  sector_id: string | null;
  lead_id: string | null;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string;
  meeting_type: string;
  location: string | null;
  meeting_link: string | null;
  status: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  reminder_24h_sent: boolean;
  reminder_1h_sent: boolean;
  created_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contact?: {
    name: string | null;
    phone_number: string | null;
  };
  assigned_agent?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  sector?: {
    id: string;
    name: string;
  };
}

export interface MeetingFilters {
  status?: string[];
  agentId?: string;
  sectorId?: string;
  startDate?: Date;
  endDate?: Date;
  conversationId?: string;
}

export const useMeetingSchedules = (filters?: MeetingFilters) => {
  const queryClient = useQueryClient();

  const { data: meetings, isLoading, error, refetch } = useQuery({
    queryKey: ['meeting-schedules', filters],
    queryFn: async () => {
      let query = supabase
        .from('meeting_schedules')
        .select(`
          *,
          contact:whatsapp_contacts(name, phone_number),
          assigned_agent:profiles!meeting_schedules_assigned_agent_id_fkey(id, full_name, avatar_url),
          sector:sectors(id, name)
        `)
        .order('scheduled_at', { ascending: true });

      if (filters?.status?.length) {
        query = query.in('status', filters.status);
      }
      if (filters?.agentId) {
        query = query.eq('assigned_agent_id', filters.agentId);
      }
      if (filters?.sectorId) {
        query = query.eq('sector_id', filters.sectorId);
      }
      if (filters?.startDate) {
        query = query.gte('scheduled_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('scheduled_at', filters.endDate.toISOString());
      }
      if (filters?.conversationId) {
        query = query.eq('conversation_id', filters.conversationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as MeetingSchedule[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    let meetingInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel('meeting-schedules-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_schedules' },
        () => {
          // Debounce invalidation to prevent excessive re-renders
          clearTimeout(meetingInvalidateTimeout);
          meetingInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['meeting-schedules'] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(meetingInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createMeeting = useMutation({
    mutationFn: async (data: Partial<MeetingSchedule>) => {
      const { data: meeting, error } = await supabase
        .from('meeting_schedules')
        .insert(data as any)
        .select()
        .single();

      if (error) throw error;
      return meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-schedules'] });
      toast.success('Reunião agendada com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao agendar reunião');
    },
  });

  const updateMeeting = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<MeetingSchedule>) => {
      const { data, error } = await supabase
        .from('meeting_schedules')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-schedules'] });
      toast.success('Reunião atualizada');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar reunião');
    },
  });

  const cancelMeeting = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase
        .from('meeting_schedules')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-schedules'] });
      toast.success('Reunião cancelada');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao cancelar reunião');
    },
  });

  const confirmMeeting = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('meeting_schedules')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-schedules'] });
      toast.success('Reunião confirmada');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao confirmar reunião');
    },
  });

  const completeMeeting = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('meeting_schedules')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-schedules'] });
      toast.success('Reunião concluída');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao concluir reunião');
    },
  });

  // Get upcoming meetings count
  const upcomingCount = meetings?.filter(
    m => ['scheduled', 'confirmed'].includes(m.status) && 
    new Date(m.scheduled_at) > new Date()
  ).length || 0;

  return {
    meetings,
    isLoading,
    error,
    refetch,
    upcomingCount,
    createMeeting,
    updateMeeting,
    cancelMeeting,
    confirmMeeting,
    completeMeeting,
  };
};

// Hook for single meeting
export const useMeeting = (meetingId?: string) => {
  return useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      if (!meetingId) return null;

      const { data, error } = await supabase
        .from('meeting_schedules')
        .select(`
          *,
          contact:whatsapp_contacts(name, phone_number),
          assigned_agent:profiles!meeting_schedules_assigned_agent_id_fkey(id, full_name, avatar_url),
          sector:sectors(id, name),
          conversation:whatsapp_conversations(id)
        `)
        .eq('id', meetingId)
        .single();

      if (error) throw error;
      return data as MeetingSchedule;
    },
    enabled: !!meetingId,
  });
};

// Hook for conversation's upcoming meetings
export const useConversationMeetings = (conversationId?: string) => {
  return useQuery({
    queryKey: ['conversation-meetings', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('meeting_schedules')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(5);

      if (error) throw error;
      return data as MeetingSchedule[];
    },
    enabled: !!conversationId,
  });
};
