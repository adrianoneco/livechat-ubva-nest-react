import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface LearningExample {
  id: string;
  sector_id: string;
  conversation_id: string | null;
  message_id: string | null;
  input_context: string;
  ideal_response: string;
  scenario_type: string | null;
  tags: string[];
  quality_score: number | null;
  lead_converted: boolean;
  customer_satisfied: boolean;
  marked_as_good_by: string | null;
  marked_at: string | null;
  notes: string | null;
  times_referenced: number;
  created_at: string;
}

export type ScenarioType = 'greeting' | 'objection_handling' | 'closing' | 'support' | 'pricing' | 'scheduling' | 'follow_up' | 'manual' | 'correction';

export const SCENARIO_TYPES: { value: ScenarioType; label: string }[] = [
  { value: 'greeting', label: 'Saudação' },
  { value: 'objection_handling', label: 'Objeções' },
  { value: 'closing', label: 'Fechamento' },
  { value: 'support', label: 'Suporte' },
  { value: 'pricing', label: 'Preços' },
  { value: 'scheduling', label: 'Agendamento' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'manual', label: 'Manual' },
  { value: 'correction', label: 'Correção' },
];

export const useLearningExamples = (sectorId?: string) => {
  const queryClient = useQueryClient();

  // Fetch examples for a sector
  const { data: examples, isLoading, error } = useQuery({
    queryKey: ['learning-examples', sectorId],
    queryFn: async () => {
      if (!sectorId) return [];
      
      const { data, error } = await supabase
        .from('learning_examples')
        .select('*')
        .eq('sector_id', sectorId)
        .order('quality_score', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LearningExample[];
    },
    enabled: !!sectorId,
  });

  // Mark a message as a good example
  const markAsGoodExample = useMutation({
    mutationFn: async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('learn-from-conversation', {
        body: {
          action: 'mark_good',
          messageId,
          conversationId,
          sectorId,
          userId: user.user?.id,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-examples', sectorId] });
      toast.success('Marcado como bom exemplo');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao marcar exemplo');
    },
  });

  // Analyze conversation for learning
  const analyzeConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('learn-from-conversation', {
        body: {
          action: 'analyze',
          conversationId,
          sectorId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['learning-examples', sectorId] });
      if (data.examples_saved > 0) {
        toast.success(`${data.examples_saved} exemplos salvos`);
      } else {
        toast.info('Nenhum exemplo de qualidade encontrado');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao analisar conversa');
    },
  });

  // Find patterns across examples
  const findPatterns = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('learn-from-conversation', {
        body: {
          action: 'find_patterns',
          sectorId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Padrões identificados');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao buscar padrões');
    },
  });

  // Create example manually
  const createExample = useMutation({
    mutationFn: async (example: Omit<LearningExample, 'id' | 'created_at' | 'times_referenced'>) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('learning_examples')
        .insert({
          ...example,
          marked_as_good_by: user.user?.id,
          marked_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-examples', sectorId] });
      toast.success('Exemplo criado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar exemplo');
    },
  });

  // Delete example
  const deleteExample = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('learning_examples')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-examples', sectorId] });
      toast.success('Exemplo removido');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover exemplo');
    },
  });

  // Get examples by scenario
  const getExamplesByScenario = (scenarioType: ScenarioType): LearningExample[] => {
    if (!examples) return [];
    return examples.filter(e => e.scenario_type === scenarioType);
  };

  // Get high quality examples
  const getHighQualityExamples = (minScore: number = 0.8): LearningExample[] => {
    if (!examples) return [];
    return examples.filter(e => (e.quality_score || 0) >= minScore);
  };

  // Get example statistics
  const { data: stats } = useQuery({
    queryKey: ['learning-stats', sectorId],
    queryFn: async () => {
      if (!sectorId || !examples) return null;
      
      const byScenario: Record<string, number> = {};
      let totalQuality = 0;
      let qualityCount = 0;
      let convertedCount = 0;
      let satisfiedCount = 0;

      examples.forEach(ex => {
        const scenario = ex.scenario_type || 'other';
        byScenario[scenario] = (byScenario[scenario] || 0) + 1;
        
        if (ex.quality_score !== null) {
          totalQuality += ex.quality_score;
          qualityCount++;
        }
        if (ex.lead_converted) convertedCount++;
        if (ex.customer_satisfied) satisfiedCount++;
      });

      return {
        total: examples.length,
        byScenario,
        avgQuality: qualityCount > 0 ? totalQuality / qualityCount : 0,
        conversionRate: examples.length > 0 ? convertedCount / examples.length : 0,
        satisfactionRate: examples.length > 0 ? satisfiedCount / examples.length : 0,
      };
    },
    enabled: !!sectorId && !!examples,
  });

  return {
    examples: examples || [],
    isLoading,
    error,
    stats,
    markAsGoodExample,
    analyzeConversation,
    findPatterns,
    createExample,
    deleteExample,
    getExamplesByScenario,
    getHighQualityExamples,
    isMarking: markAsGoodExample.isPending,
    isAnalyzing: analyzeConversation.isPending,
    isFindingPatterns: findPatterns.isPending,
  };
};
