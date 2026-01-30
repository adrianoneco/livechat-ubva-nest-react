import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface QualificationCriteria {
  id: string;
  sector_id: string;
  budget_keywords: string[];
  authority_keywords: string[];
  need_keywords: string[];
  timeline_keywords: string[];
  budget_weight: number;
  authority_weight: number;
  need_weight: number;
  timeline_weight: number;
  auto_qualify_threshold: number;
  auto_create_lead_threshold: number;
  auto_create_leads: boolean;
  qualification_enabled: boolean;
  messages_before_qualification: number;
  created_at: string;
  updated_at: string;
}

export interface QualificationLog {
  id: string;
  lead_id: string;
  conversation_id: string | null;
  previous_score: number | null;
  new_score: number;
  score_change: number;
  bant_analysis: BANTAnalysis;
  ai_reasoning: string | null;
  model_used: string | null;
  tokens_used: number | null;
  trigger_source: string | null;
  created_at: string;
}

export interface BANTAnalysis {
  budget: {
    detected: boolean;
    evidence: string | null;
    estimated_value: string | null;
    confidence: number;
  };
  authority: {
    detected: boolean;
    role: string | null;
    is_decision_maker: boolean;
    confidence: number;
  };
  need: {
    detected: boolean;
    pain_points: string[];
    urgency: 'low' | 'medium' | 'high';
    confidence: number;
  };
  timeline: {
    detected: boolean;
    timeframe: 'immediate' | '1-2_weeks' | '1_month' | 'indefinite';
    confidence: number;
  };
  overall_intent: 'purchase' | 'information' | 'support' | 'other';
  recommended_action: 'qualify' | 'nurture' | 'discard';
  suggested_value: number;
  reasoning: string;
}

const DEFAULT_CRITERIA: Omit<QualificationCriteria, 'id' | 'sector_id' | 'created_at' | 'updated_at'> = {
  budget_keywords: ['orçamento', 'valor', 'quanto custa', 'preço', 'investimento', 'custo'],
  authority_keywords: ['gerente', 'diretor', 'decisor', 'responsável', 'dono', 'proprietário', 'CEO'],
  need_keywords: ['preciso', 'necessito', 'urgente', 'problema', 'dificuldade', 'quero', 'busco'],
  timeline_keywords: ['agora', 'hoje', 'esta semana', 'urgente', 'prazo', 'imediato', 'rápido'],
  budget_weight: 25,
  authority_weight: 25,
  need_weight: 30,
  timeline_weight: 20,
  auto_qualify_threshold: 70,
  auto_create_lead_threshold: 30,
  auto_create_leads: true,
  qualification_enabled: true,
  messages_before_qualification: 5,
};

export const useLeadQualification = (sectorId?: string) => {
  const queryClient = useQueryClient();

  // Buscar critérios de qualificação
  const { data: criteria, isLoading: isLoadingCriteria } = useQuery({
    queryKey: ['qualification-criteria', sectorId],
    queryFn: async () => {
      if (!sectorId) return null;
      
      const { data, error } = await supabase
        .from('lead_qualification_criteria')
        .select('*')
        .eq('sector_id', sectorId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as QualificationCriteria | null;
    },
    enabled: !!sectorId,
  });

  // Criar/atualizar critérios
  const updateCriteria = useMutation({
    mutationFn: async (updates: Partial<QualificationCriteria> & { sector_id: string }) => {
      const { sector_id, ...rest } = updates;
      
      // Check if exists
      const { data: existing } = await supabase
        .from('lead_qualification_criteria')
        .select('id')
        .eq('sector_id', sector_id)
        .single();

      if (existing) {
        const { data, error } = await supabase
          .from('lead_qualification_criteria')
          .update(rest)
          .eq('sector_id', sector_id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('lead_qualification_criteria')
          .insert({ sector_id, ...DEFAULT_CRITERIA, ...rest })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualification-criteria'] });
      toast.success('Critérios de qualificação salvos');
    },
    onError: (error) => {
      console.error('Error updating criteria:', error);
      toast.error('Erro ao salvar critérios');
    },
  });

  // Disparar qualificação manual
  const triggerQualification = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('qualify-lead', {
        body: { conversationId, triggerSource: 'manual' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-lead'] });
      queryClient.invalidateQueries({ queryKey: ['qualification-logs'] });
      
      if (data.action === 'created') {
        toast.success(`Lead criado com score ${data.score}`);
      } else if (data.action === 'updated') {
        toast.success(`Lead atualizado: score ${data.score} (${data.scoreChange > 0 ? '+' : ''}${data.scoreChange})`);
      } else {
        toast.info(`Score ${data.score} abaixo do threshold`);
      }
    },
    onError: (error) => {
      console.error('Error triggering qualification:', error);
      toast.error('Erro ao qualificar lead');
    },
  });

  return {
    criteria: criteria || (sectorId ? { ...DEFAULT_CRITERIA, sector_id: sectorId } as QualificationCriteria : null),
    isLoadingCriteria,
    updateCriteria,
    triggerQualification,
    defaultCriteria: DEFAULT_CRITERIA,
  };
};

// Hook para buscar logs de qualificação
export const useQualificationLogs = (leadId?: string) => {
  return useQuery({
    queryKey: ['qualification-logs', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('lead_qualification_logs')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      // Type-safe conversion
      return (data || []).map(log => ({
        ...log,
        bant_analysis: log.bant_analysis as unknown as BANTAnalysis,
      })) as QualificationLog[];
    },
    enabled: !!leadId,
  });
};
