import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface ResponseTemplate {
  id: string;
  sector_id: string;
  name: string;
  description: string | null;
  trigger_patterns: string[];
  template_content: string;
  variables: Record<string, any>;
  category: string | null;
  intent_match: string[];
  usage_count: number;
  success_rate: number | null;
  avg_sentiment_after: number | null;
  is_active: boolean;
  priority: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateCategory = 'greeting' | 'objection' | 'closing' | 'support' | 'sales' | 'follow_up';

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'greeting', label: 'Saudação' },
  { value: 'objection', label: 'Objeções' },
  { value: 'closing', label: 'Fechamento' },
  { value: 'support', label: 'Suporte' },
  { value: 'sales', label: 'Vendas' },
  { value: 'follow_up', label: 'Follow-up' },
];

export const useResponseTemplates = (sectorId?: string) => {
  const queryClient = useQueryClient();

  // Fetch templates for a sector
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['response-templates', sectorId],
    queryFn: async () => {
      if (!sectorId) return [];
      
      const { data, error } = await supabase
        .from('response_templates')
        .select('*')
        .eq('sector_id', sectorId)
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return data as ResponseTemplate[];
    },
    enabled: !!sectorId,
  });

  // Create template
  const createTemplate = useMutation({
    mutationFn: async (template: Omit<ResponseTemplate, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'success_rate' | 'avg_sentiment_after'>) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('response_templates')
        .insert({
          ...template,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['response-templates', sectorId] });
      toast.success('Template criado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar template');
    },
  });

  // Update template
  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ResponseTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('response_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['response-templates', sectorId] });
      toast.success('Template atualizado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar template');
    },
  });

  // Delete template (soft delete)
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('response_templates')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['response-templates', sectorId] });
      toast.success('Template removido');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover template');
    },
  });

  // Increment usage count
  const incrementUsage = useMutation({
    mutationFn: async (id: string) => {
      const { data: current } = await supabase
        .from('response_templates')
        .select('usage_count')
        .eq('id', id)
        .single();
      
      const { error } = await supabase
        .from('response_templates')
        .update({ usage_count: (current?.usage_count || 0) + 1 })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['response-templates', sectorId] });
    },
  });

  // Find matching templates for a message
  const findMatchingTemplates = async (message: string): Promise<ResponseTemplate[]> => {
    if (!templates || templates.length === 0) return [];

    const lowerMessage = message.toLowerCase();
    
    return templates.filter(template => {
      if (!template.trigger_patterns || template.trigger_patterns.length === 0) {
        return false;
      }
      
      return template.trigger_patterns.some(pattern => 
        lowerMessage.includes(pattern.toLowerCase())
      );
    });
  };

  // Get templates by category
  const getTemplatesByCategory = (category: TemplateCategory): ResponseTemplate[] => {
    if (!templates) return [];
    return templates.filter(t => t.category === category);
  };

  // Get template statistics
  const { data: templateStats } = useQuery({
    queryKey: ['template-stats', sectorId],
    queryFn: async () => {
      if (!sectorId || !templates) return null;
      
      const totalUsage = templates.reduce((sum, t) => sum + t.usage_count, 0);
      const avgSuccessRate = templates
        .filter(t => t.success_rate !== null)
        .reduce((sum, t) => sum + (t.success_rate || 0), 0) / 
        (templates.filter(t => t.success_rate !== null).length || 1);

      const byCategory: Record<string, number> = {};
      templates.forEach(t => {
        const cat = t.category || 'other';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });

      return {
        total: templates.length,
        totalUsage,
        avgSuccessRate,
        byCategory,
      };
    },
    enabled: !!sectorId && !!templates,
  });

  return {
    templates: templates || [],
    isLoading,
    error,
    stats: templateStats,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    incrementUsage,
    findMatchingTemplates,
    getTemplatesByCategory,
    isCreating: createTemplate.isPending,
    isUpdating: updateTemplate.isPending,
    isDeleting: deleteTemplate.isPending,
  };
};
