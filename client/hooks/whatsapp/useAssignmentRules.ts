import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/client";
import { toast } from "sonner";

export interface AssignmentRule {
  id: string;
  name: string;
  instance_id: string;
  sector_id: string | null;
  rule_type: 'fixed' | 'round_robin';
  fixed_agent_id: string | null;
  round_robin_agents: string[];
  round_robin_last_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useAssignmentRules = () => {
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['assignment-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Normalize round_robin_agents to always be an array (DB may return null)
      return (data || []).map(rule => ({
        ...rule,
        round_robin_agents: rule.round_robin_agents || [],
      })) as AssignmentRule[];
    },
  });

  const createRule = useMutation({
    mutationFn: async (rule: Omit<AssignmentRule, 'id' | 'created_at' | 'updated_at' | 'round_robin_last_index'>) => {
      console.log('[useAssignmentRules] Creating rule:', rule);
      const { data, error } = await supabase
        .from('assignment_rules')
        .insert(rule)
        .select()
        .single();

      console.log('[useAssignmentRules] Create result:', { data, error });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success("Regra de atribuição criada com sucesso");
    },
    onError: (error: any) => {
      console.error('[useAssignmentRules] Create error:', error);
      toast.error(error.message || "Erro ao criar regra de atribuição");
    },
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AssignmentRule> & { id: string }) => {
      console.log('[useAssignmentRules] Updating rule:', { id, updates });
      const { data, error } = await supabase
        .from('assignment_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      console.log('[useAssignmentRules] Update result:', { data, error });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success("Regra atualizada com sucesso");
    },
    onError: (error: any) => {
      console.error('[useAssignmentRules] Update error:', error);
      toast.error(error.message || "Erro ao atualizar regra");
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      console.log('[useAssignmentRules] Deleting rule:', id);
      const { error } = await supabase
        .from('assignment_rules')
        .delete()
        .eq('id', id);

      console.log('[useAssignmentRules] Delete result:', { error });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success("Regra excluída com sucesso");
    },
    onError: (error: any) => {
      console.error('[useAssignmentRules] Delete error:', error);
      toast.error(error.message || "Erro ao excluir regra");
    },
  });

  const toggleRuleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      console.log('[useAssignmentRules] Toggling rule active:', { id, is_active });
      const { data, error } = await supabase
        .from('assignment_rules')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      console.log('[useAssignmentRules] Toggle result:', { data, error });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success("Status da regra atualizado");
    },
    onError: (error: any) => {
      console.error('[useAssignmentRules] Toggle error:', error);
      toast.error(error.message || "Erro ao atualizar status da regra");
    },
  });

  return {
    rules,
    isLoading,
    createRule,
    updateRule,
    deleteRule,
    toggleRuleActive,
  };
};
