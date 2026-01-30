import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface SchedulingConfig {
  id: string;
  sector_id: string;
  is_enabled: boolean;
  allow_ai_scheduling: boolean;
  default_duration_minutes: number;
  slot_interval_minutes: number;
  min_advance_hours: number;
  max_advance_days: number;
  allowed_meeting_types: string[];
  default_meeting_type: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  send_reminder_24h: boolean;
  send_reminder_1h: boolean;
  custom_reminder_hours: number | null;
  reminder_message_24h: string | null;
  reminder_message_1h: string | null;
  require_confirmation: boolean;
  auto_cancel_no_confirmation_hours: number;
  confirmation_message: string | null;
  google_calendar_sync: boolean;
  created_at: string;
  updated_at: string;
}

export type SchedulingConfigInsert = Omit<SchedulingConfig, 'id' | 'created_at' | 'updated_at'>;

export const useSchedulingConfig = (sectorId?: string) => {
  const queryClient = useQueryClient();

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['scheduling-config', sectorId],
    queryFn: async () => {
      if (!sectorId) return null;

      const { data, error } = await supabase
        .from('scheduling_config')
        .select('*')
        .eq('sector_id', sectorId)
        .maybeSingle();

      if (error) throw error;
      return data as SchedulingConfig | null;
    },
    enabled: !!sectorId,
  });

  const createOrUpdateConfig = useMutation({
    mutationFn: async (data: Partial<SchedulingConfig> & { sector_id: string }) => {
      // Check if config exists
      const { data: existing } = await supabase
        .from('scheduling_config')
        .select('id')
        .eq('sector_id', data.sector_id)
        .maybeSingle();

      if (existing) {
        // Update
        const { data: updated, error } = await supabase
          .from('scheduling_config')
          .update(data as any)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return updated;
      } else {
        // Insert
        const { data: created, error } = await supabase
          .from('scheduling_config')
          .insert(data as any)
          .select()
          .single();

        if (error) throw error;
        return created;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast.success('Configuração de agendamento salva');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar configuração');
    },
  });

  const toggleAIScheduling = useMutation({
    mutationFn: async ({ sectorId, enabled }: { sectorId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('scheduling_config')
        .update({ allow_ai_scheduling: enabled })
        .eq('sector_id', sectorId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast.success(variables.enabled ? 'Agendamento AI ativado' : 'Agendamento AI desativado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao alterar configuração');
    },
  });

  return {
    config,
    isLoading,
    error,
    createOrUpdateConfig,
    toggleAIScheduling,
    isEnabled: config?.is_enabled ?? false,
    allowAIScheduling: config?.allow_ai_scheduling ?? false,
  };
};
