import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface AvailabilitySlot {
  id: string;
  sector_id: string | null;
  agent_id: string | null;
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  slot_type: 'available' | 'blocked' | 'break';
  is_active: boolean;
  max_concurrent_meetings: number;
  created_at: string;
}

export const useAvailabilitySlots = (sectorId?: string, agentId?: string) => {
  const queryClient = useQueryClient();

  const { data: slots, isLoading, error } = useQuery({
    queryKey: ['availability-slots', sectorId, agentId],
    queryFn: async () => {
      let query = supabase
        .from('availability_slots')
        .select('*')
        .eq('is_active', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (sectorId) {
        query = query.eq('sector_id', sectorId);
      }
      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AvailabilitySlot[];
    },
    enabled: !!(sectorId || agentId),
  });

  const createSlot = useMutation({
    mutationFn: async (data: Partial<AvailabilitySlot>) => {
      const { data: slot, error } = await supabase
        .from('availability_slots')
        .insert(data as any)
        .select()
        .single();

      if (error) throw error;
      return slot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-slots'] });
      toast.success('Horário adicionado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao adicionar horário');
    },
  });

  const updateSlot = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<AvailabilitySlot>) => {
      const { error } = await supabase
        .from('availability_slots')
        .update(updates as any)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-slots'] });
      toast.success('Horário atualizado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar horário');
    },
  });

  const deleteSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('availability_slots')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-slots'] });
      toast.success('Horário removido');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover horário');
    },
  });

  // Group slots by day of week for easier display
  const slotsByDay = slots?.reduce((acc, slot) => {
    const day = slot.day_of_week ?? -1;
    if (!acc[day]) acc[day] = [];
    acc[day].push(slot);
    return acc;
  }, {} as Record<number, AvailabilitySlot[]>);

  return {
    slots,
    slotsByDay,
    isLoading,
    error,
    createSlot,
    updateSlot,
    deleteSlot,
  };
};
