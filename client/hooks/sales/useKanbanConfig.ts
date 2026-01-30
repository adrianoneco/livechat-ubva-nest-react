import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface KanbanColumnConfig {
  id: string;
  sector_id: string;
  column_id: string;
  custom_title: string;
  display_order: number;
  is_active: boolean;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface KanbanConfigMap {
  [columnId: string]: KanbanColumnConfig;
}

export const DEFAULT_COLUMNS = [
  { id: 'new', title: 'Novo', color: 'bg-blue-500', icon: 'Sparkles' },
  { id: 'contacted', title: 'Em Contato', color: 'bg-yellow-500', icon: 'MessageCircle' },
  { id: 'qualified', title: 'Qualificado', color: 'bg-purple-500', icon: 'Star' },
  { id: 'proposal', title: 'Proposta', color: 'bg-orange-500', icon: 'FileText' },
  { id: 'closed', title: 'Fechado', color: 'bg-green-500', icon: 'CheckCircle' },
  { id: 'lost', title: 'Perdido', color: 'bg-red-500', icon: 'XCircle' },
];

export const useKanbanConfig = (sectorId?: string | null) => {
  const queryClient = useQueryClient();

  const { data: columnsConfig, isLoading } = useQuery({
    queryKey: ['kanban-config', sectorId],
    queryFn: async () => {
      if (!sectorId) return {} as KanbanConfigMap;

      const { data, error } = await supabase
        .from('kanban_columns_config')
        .select('*')
        .eq('sector_id', sectorId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      // Convert to map for easy access
      const configMap: KanbanConfigMap = {};
      (data || []).forEach((config: KanbanColumnConfig) => {
        configMap[config.column_id] = config;
      });

      return configMap;
    },
    enabled: !!sectorId,
  });

  const updateColumnTitle = useMutation({
    mutationFn: async ({ 
      columnId, 
      customTitle, 
      color,
      icon,
    }: { 
      columnId: string; 
      customTitle: string;
      color?: string;
      icon?: string;
    }) => {
      if (!sectorId) throw new Error('Setor não selecionado');

      const { data, error } = await supabase
        .from('kanban_columns_config')
        .upsert(
          {
            sector_id: sectorId,
            column_id: columnId,
            custom_title: customTitle,
            color: color || null,
            icon: icon || null,
            display_order: DEFAULT_COLUMNS.findIndex(c => c.id === columnId),
          },
          { onConflict: 'sector_id,column_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-config', sectorId] });
      toast.success('Configuração salva');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar configuração');
    },
  });

  const resetToDefault = useMutation({
    mutationFn: async (columnId?: string) => {
      if (!sectorId) throw new Error('Setor não selecionado');

      let query = supabase
        .from('kanban_columns_config')
        .delete()
        .eq('sector_id', sectorId);

      if (columnId) {
        query = query.eq('column_id', columnId);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-config', sectorId] });
      toast.success('Configuração resetada para o padrão');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao resetar configuração');
    },
  });

  // Helper function to get column title with fallback
  const getColumnTitle = (columnId: string): string => {
    if (columnsConfig?.[columnId]?.custom_title) {
      return columnsConfig[columnId].custom_title;
    }
    const defaultCol = DEFAULT_COLUMNS.find(c => c.id === columnId);
    return defaultCol?.title || columnId;
  };

  // Helper function to get all columns with custom titles merged
  const getColumnsWithConfig = () => {
    return DEFAULT_COLUMNS.map(col => ({
      ...col,
      title: columnsConfig?.[col.id]?.custom_title || col.title,
      color: columnsConfig?.[col.id]?.color || col.color,
      icon: columnsConfig?.[col.id]?.icon || col.icon,
      isActive: columnsConfig?.[col.id]?.is_active ?? true,
    }));
  };

  return {
    columnsConfig,
    isLoading,
    updateColumnTitle,
    resetToDefault,
    getColumnTitle,
    getColumnsWithConfig,
  };
};
