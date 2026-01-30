import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface SectorPermission {
  id: string;
  sector_id: string;
  permission_key: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const useSectorPermissions = (sectorId?: string) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sector-permissions', sectorId],
    queryFn: async () => {
      let query = supabase
        .from('sector_permissions')
        .select('*');
      
      if (sectorId) {
        query = query.eq('sector_id', sectorId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as SectorPermission[];
    },
  });

  const setSectorPermissionMutation = useMutation({
    mutationFn: async ({ 
      sectorId, 
      permissionKey, 
      isEnabled 
    }: { 
      sectorId: string; 
      permissionKey: string; 
      isEnabled: boolean; 
    }) => {
      const { data: currentUser } = await supabase.auth.getUser();

      // Get current value for audit
      const { data: existing } = await supabase
        .from('sector_permissions')
        .select('is_enabled')
        .eq('sector_id', sectorId)
        .eq('permission_key', permissionKey)
        .maybeSingle();

      // Upsert the permission
      const { error } = await supabase
        .from('sector_permissions')
        .upsert({
          sector_id: sectorId,
          permission_key: permissionKey,
          is_enabled: isEnabled,
        }, {
          onConflict: 'sector_id,permission_key',
        });

      if (error) throw error;

      // Log the change
      await supabase
        .from('permission_audit_logs')
        .insert({
          changed_by: currentUser.user?.id!,
          target_type: 'sector',
          target_id: sectorId,
          permission_key: permissionKey,
          old_value: existing?.is_enabled ?? null,
          new_value: isEnabled,
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sector-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions'] });
      toast.success('Permissão do setor atualizada');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar permissão: ' + error.message);
    },
  });

  const initializeSectorPermissions = useMutation({
    mutationFn: async ({ 
      sectorId, 
      permissionTypes 
    }: { 
      sectorId: string; 
      permissionTypes: { key: string; default_for_agent: boolean }[]; 
    }) => {
      const permissions = permissionTypes.map(pt => ({
        sector_id: sectorId,
        permission_key: pt.key,
        is_enabled: pt.default_for_agent,
      }));

      const { error } = await supabase
        .from('sector_permissions')
        .upsert(permissions, {
          onConflict: 'sector_id,permission_key',
          ignoreDuplicates: true,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sector-permissions'] });
    },
  });

  return {
    sectorPermissions: data || [],
    isLoading,
    setSectorPermission: setSectorPermissionMutation.mutateAsync,
    initializeSectorPermissions: initializeSectorPermissions.mutateAsync,
    isSettingPermission: setSectorPermissionMutation.isPending,
  };
};
