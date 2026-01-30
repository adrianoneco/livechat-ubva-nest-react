import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface AIAgentConfig {
  id: string;
  sector_id: string;
  agent_name: string;
  agent_image: string | null;
  persona_description: string | null;
  welcome_message: string | null;
  tone_of_voice: 'professional' | 'friendly' | 'casual';
  default_model: string;
  system_prompt: string | null;
  is_enabled: boolean;
  auto_reply_enabled: boolean;
  max_auto_replies: number;
  response_delay_seconds: number;
  hybrid_timeout_minutes: number;
  escalation_keywords: string[];
  escalation_after_minutes: number;
  escalation_on_negative_sentiment: boolean;
  working_hours_start: string;
  working_hours_end: string;
  working_timezone: string;
  working_days: number[];
  out_of_hours_message: string | null;
  business_context: string | null;
  faq_context: string | null;
  product_catalog: string | null;
  created_at: string;
  updated_at: string;
}

export type AIAgentConfigInsert = Omit<AIAgentConfig, 'id' | 'created_at' | 'updated_at'>;
export type AIAgentConfigUpdate = Partial<AIAgentConfigInsert> & { id: string };

export const useAIAgentConfig = (sectorId?: string) => {
  const queryClient = useQueryClient();

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['ai-agent-config', sectorId],
    queryFn: async () => {
      if (!sectorId) return null;

      const { data, error } = await supabase
        .from('ai_agent_configs')
        .select('*')
        .eq('sector_id', sectorId)
        .maybeSingle();

      if (error) throw error;
      console.log('[useAIAgentConfig Debug] Fetched config:', { sectorId, data, hybridTimeout: data?.hybrid_timeout_minutes });
      return data as AIAgentConfig | null;
    },
    enabled: !!sectorId,
  });

  const createConfig = useMutation({
    mutationFn: async (newConfig: AIAgentConfigInsert) => {
      const { data, error } = await supabase
        .from('ai_agent_configs')
        .insert(newConfig)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-config'] });
      toast.success('Configuração do AI Agent criada');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar configuração');
    },
  });

  const updateConfig = useMutation({
    mutationFn: async ({ id, ...updates }: AIAgentConfigUpdate) => {
      const { data, error } = await supabase
        .from('ai_agent_configs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-config'] });
      toast.success('Configuração do AI Agent atualizada');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar configuração');
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { data, error } = await supabase
        .from('ai_agent_configs')
        .update({ is_enabled: enabled })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-config'] });
      toast.success(variables.enabled ? 'AI Agent ativado' : 'AI Agent desativado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao alterar status');
    },
  });

  return {
    config,
    isLoading,
    error,
    createConfig,
    updateConfig,
    toggleEnabled,
  };
};

// Hook para listar todas as configs (para admins)
export const useAllAIAgentConfigs = () => {
  return useQuery({
    queryKey: ['ai-agent-configs-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_agent_configs')
        .select(`
          *,
          sector:sectors(name, instance_id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};
