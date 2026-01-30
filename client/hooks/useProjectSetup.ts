import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/client";
import { useToast } from "@/hooks/use-toast";

export const useProjectSetup = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if project is configured by verifying project_config table
  const { data: isConfigured, isLoading: isCheckingConfig } = useQuery({
    queryKey: ['project-setup', 'config'],
    queryFn: async () => {
      try {
        // For now, assume project is configured (API not implemented)
        // TODO: Implement proper config check
        return true;
        
        // Original code (commented out until API is ready):
        // const { data, error } = await supabase
        //   .from('project_config')
        //   .select('key')
        //   .in('key', ['project_url', 'anon_key']);
        //
        // if (error) throw error;
        //
        // return data && Array.isArray(data) && data.length === 2;
      } catch (error: any) {
        console.error('[useProjectSetup] Error checking config:', error);
        return false;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  });

  // Run setup configuration
  const setupProject = useMutation({
    mutationFn: async () => {
      console.log('[useProjectSetup] Calling setup-project-config edge function...');

      const { data, error } = await supabase.functions.invoke('setup-project-config', {
        body: {},
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Setup failed');
      }

      return data;
    },
    onSuccess: () => {
      console.log('[useProjectSetup] Setup completed successfully');
      queryClient.invalidateQueries({ queryKey: ['project-setup', 'config'] });
      
      toast({
        title: "Configuração automática concluída",
        description: "Sistema configurado com sucesso para este projeto.",
      });
    },
    onError: (error: any) => {
      console.error('[useProjectSetup] Setup failed:', error);
      
      toast({
        title: "Erro na configuração automática",
        description: error.message || "Não foi possível configurar o sistema automaticamente.",
        variant: "destructive",
      });
    },
  });

  return {
    isConfigured,
    isCheckingConfig,
    setupProject: setupProject.mutate,
    isSettingUp: setupProject.isPending,
    setupComplete: isConfigured === true,
  };
};
