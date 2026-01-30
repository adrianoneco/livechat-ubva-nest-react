import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface KnowledgeItem {
  id: string;
  sector_id: string;
  category: string;
  subcategory: string | null;
  title: string;
  content: string;
  keywords: string[];
  source: string;
  confidence_score: number;
  usage_count: number;
  last_used_at: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_by: string | null;
  verified_by: string | null;
  version: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export type KnowledgeCategory = 'product' | 'policy' | 'faq' | 'procedure' | 'pricing' | 'script';

export const KNOWLEDGE_CATEGORIES: { value: KnowledgeCategory; label: string }[] = [
  { value: 'product', label: 'Produtos' },
  { value: 'policy', label: 'Políticas' },
  { value: 'faq', label: 'FAQ' },
  { value: 'procedure', label: 'Procedimentos' },
  { value: 'pricing', label: 'Preços' },
  { value: 'script', label: 'Scripts' },
];

export const useKnowledgeBase = (sectorId?: string) => {
  const queryClient = useQueryClient();

  // Fetch knowledge items for a sector
  const { data: items, isLoading, error } = useQuery({
    queryKey: ['knowledge-base', sectorId],
    queryFn: async () => {
      if (!sectorId) return [];
      
      const { data, error } = await supabase
        .from('business_knowledge_base')
        .select('*')
        .eq('sector_id', sectorId)
        .eq('is_active', true)
        .order('category')
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return data as KnowledgeItem[];
    },
    enabled: !!sectorId,
  });

  // Search knowledge base
  const searchKnowledge = async (query: string, category?: string) => {
    if (!sectorId) return [];

    const { data, error } = await supabase.functions.invoke('manage-knowledge-base', {
      body: {
        action: 'search',
        query,
        sectorId,
        category,
        limit: 10,
      },
    });

    if (error) {
      console.error('Search error:', error);
      return [];
    }

    return data?.results || [];
  };

  // Add knowledge item
  const addKnowledge = useMutation({
    mutationFn: async (item: Omit<KnowledgeItem, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'last_used_at' | 'version' | 'parent_id'>) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('business_knowledge_base')
        .insert({
          ...item,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', sectorId] });
      toast.success('Conhecimento adicionado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao adicionar conhecimento');
    },
  });

  // Update knowledge item
  const updateKnowledge = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<KnowledgeItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('business_knowledge_base')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', sectorId] });
      toast.success('Conhecimento atualizado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar conhecimento');
    },
  });

  // Delete (soft delete) knowledge item
  const deleteKnowledge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('business_knowledge_base')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', sectorId] });
      toast.success('Conhecimento removido');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover conhecimento');
    },
  });

  // Verify knowledge item
  const verifyKnowledge = useMutation({
    mutationFn: async (id: string) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('business_knowledge_base')
        .update({ 
          is_verified: true,
          verified_by: user.user?.id,
          confidence_score: 1.0,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', sectorId] });
      toast.success('Conhecimento verificado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao verificar conhecimento');
    },
  });

  // Import knowledge items
  const importKnowledge = useMutation({
    mutationFn: async (items: Array<{ category: string; title: string; content: string; subcategory?: string }>) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('manage-knowledge-base', {
        body: {
          action: 'import',
          items,
          sectorId,
          userId: user.user?.id,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', sectorId] });
      toast.success(`${data.imported} itens importados`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao importar conhecimento');
    },
  });

  // Extract knowledge from conversation
  const extractKnowledge = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('manage-knowledge-base', {
        body: {
          action: 'extract',
          conversationId,
          sectorId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', sectorId] });
      if (data.extracted > 0) {
        toast.success(`${data.extracted} conhecimentos extraídos`);
      } else {
        toast.info('Nenhum conhecimento para extrair');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao extrair conhecimento');
    },
  });

  // Get statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['knowledge-stats', sectorId],
    queryFn: async () => {
      if (!sectorId) return null;
      
      const { data, error } = await supabase.functions.invoke('manage-knowledge-base', {
        body: {
          action: 'get_stats',
          sectorId,
        },
      });

      if (error) throw error;
      return data;
    },
    enabled: !!sectorId,
  });

  return {
    items: items || [],
    isLoading,
    error,
    stats,
    statsLoading,
    searchKnowledge,
    addKnowledge,
    updateKnowledge,
    deleteKnowledge,
    verifyKnowledge,
    importKnowledge,
    extractKnowledge,
    isAdding: addKnowledge.isPending,
    isUpdating: updateKnowledge.isPending,
    isDeleting: deleteKnowledge.isPending,
    isExtracting: extractKnowledge.isPending,
  };
};
