import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';

interface SLAConfig {
  id: string;
  prioridade: string;
  tempo_primeira_resposta_minutos: number;
  tempo_resolucao_minutos: number;
}

export function useSLAConfig() {
  return useQuery({
    queryKey: ['sla-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_config')
        .select('*');

      if (error) throw error;

      // Create a map by priority for easy lookup
      const configMap = (data as SLAConfig[]).reduce((acc, config) => {
        acc[config.prioridade] = config;
        return acc;
      }, {} as Record<string, SLAConfig>);

      return configMap;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function getSLAConfigForPriority(
  configs: Record<string, SLAConfig> | undefined,
  priority: string
): SLAConfig | null {
  if (!configs) return null;
  return configs[priority] || configs['media'] || null;
}
