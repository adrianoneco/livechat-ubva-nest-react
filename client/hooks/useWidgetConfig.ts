import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';

export interface WidgetConfig {
  id: string;
  instance_id: string | null;
  name: string;
  enabled: boolean;
  primary_color: string;
  position: 'bottom-right' | 'bottom-left';
  button_size: 'small' | 'medium' | 'large';
  welcome_title: string;
  welcome_message: string;
  require_name: boolean;
  require_email: boolean;
  require_phone: boolean;
  business_hours_enabled: boolean;
  business_hours: Record<string, { start: string; end: string; enabled: boolean }>;
  offline_message: string;
  allowed_domains: string[];
  created_at: string;
  updated_at: string;
}

export function useWidgetConfigs() {
  return useQuery({
    queryKey: ['widget-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('widget_configs')
        .select('*, whatsapp_instances(id, instance_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as (WidgetConfig & { whatsapp_instances: { id: string; instance_name: string } | null })[];
    },
  });
}

export function useWidgetConfig(id: string | null) {
  return useQuery({
    queryKey: ['widget-config', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('widget_configs')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as WidgetConfig;
    },
    enabled: !!id,
  });
}

export function useCreateWidgetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: Partial<WidgetConfig>) => {
      const { data, error } = await supabase
        .from('widget_configs')
        .insert(config)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widget-configs'] });
    },
  });
}

export function useUpdateWidgetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...config }: Partial<WidgetConfig> & { id: string }) => {
      const { data, error } = await supabase
        .from('widget_configs')
        .update(config)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['widget-configs'] });
      queryClient.invalidateQueries({ queryKey: ['widget-config', variables.id] });
    },
  });
}

export function useDeleteWidgetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('widget_configs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widget-configs'] });
    },
  });
}
