import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';
import { Tables } from '@/integrations/api/types';

type Lead = Tables<'leads'>;
type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export const useConversationLead = (conversationId: string | null) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: lead, isLoading, error } = useQuery({
    queryKey: ['conversation-lead', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (error) throw error;
      
      // Ensure we return null if no lead found, not an empty object
      if (!data || !data.id) {
        return null;
      }
      
      return data as Lead | null;
    },
    enabled: !!conversationId,
    staleTime: 30000, // Keep data fresh for 30 seconds to prevent unnecessary refetches
  });

  const createLead = useMutation({
    mutationFn: async ({ 
      conversationId, 
      contactId,
      name, 
      phone 
    }: { 
      conversationId: string; 
      contactId: string;
      name: string; 
      phone: string;
    }) => {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          conversation_id: conversationId,
          contact_id: contactId,
          name,
          phone,
          source: 'whatsapp',
          status: 'new',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Update cache immediately with the created lead
      queryClient.setQueryData(['conversation-lead', conversationId], data);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-metrics'] });
      toast({
        title: "Lead criado",
        description: "O lead foi criado com sucesso.",
      });
    },
    onError: (error: any) => {
      console.error('Error creating lead:', error);
      toast({
        title: "Erro ao criar lead",
        description: error?.message || "Não foi possível criar o lead.",
        variant: "destructive",
      });
    },
  });

  const updateLeadStatus = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: LeadStatus }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({ status })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Update cache immediately with the updated lead
      queryClient.setQueryData(['conversation-lead', conversationId], data);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({
        title: "Status atualizado",
        description: "O status do lead foi atualizado.",
      });
    },
    onError: (error) => {
      console.error('Error updating lead status:', error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o status.",
        variant: "destructive",
      });
    },
  });

  const updateLeadValue = useMutation({
    mutationFn: async ({ leadId, value }: { leadId: string; value: number }) => {
      if (!leadId) {
        throw new Error('leadId is required');
      }
      
      const { data, error } = await supabase
        .from('leads')
        .update({ value })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Update cache immediately with the updated lead
      queryClient.setQueryData(['conversation-lead', conversationId], data);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({
        title: "Valor atualizado",
        description: "O valor da oportunidade foi atualizado.",
      });
    },
    onError: (error: any) => {
      console.error('Error updating lead value:', error);
      const errorMessage = error?.message || 'Não foi possível atualizar o valor.';
      toast({
        title: "Erro ao atualizar",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  return {
    lead,
    isLoading,
    error,
    createLead: createLead.mutate,
    updateLeadStatus: updateLeadStatus.mutate,
    updateLeadValue: updateLeadValue.mutate,
    isCreating: createLead.isPending,
    isUpdating: updateLeadStatus.isPending,
    isUpdatingValue: updateLeadValue.isPending,
  };
};
