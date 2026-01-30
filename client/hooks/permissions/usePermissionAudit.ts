import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';

export interface PermissionAuditLog {
  id: string;
  changed_by: string;
  target_type: 'user' | 'sector' | 'role';
  target_id: string;
  permission_key: string;
  old_value: boolean | null;
  new_value: boolean | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  changer_name?: string;
  target_name?: string;
}

export const usePermissionAudit = (targetId?: string, limit: number = 50) => {
  return useQuery({
    queryKey: ['permission-audit-logs', targetId, limit],
    queryFn: async () => {
      let query = supabase
        .from('permission_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (targetId) {
        query = query.eq('target_id', targetId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch names for changed_by and target_id
      if (data && data.length > 0) {
        const userIds = [...new Set([
          ...data.map(l => l.changed_by),
          ...data.filter(l => l.target_type === 'user').map(l => l.target_id),
        ])];
        
        const sectorIds = data
          .filter(l => l.target_type === 'sector')
          .map(l => l.target_id);

        const [usersResponse, sectorsResponse] = await Promise.all([
          userIds.length > 0 
            ? supabase.from('profiles').select('id, full_name').in('id', userIds)
            : { data: [] },
          sectorIds.length > 0 
            ? supabase.from('sectors').select('id, name').in('id', sectorIds)
            : { data: [] },
        ]);

        const usersMap = new Map<string, string>();
        usersResponse.data?.forEach(u => usersMap.set(u.id, u.full_name));
        
        const sectorsMap = new Map<string, string>();
        sectorsResponse.data?.forEach(s => sectorsMap.set(s.id, s.name));

        return data.map(log => ({
          ...log,
          changer_name: usersMap.get(log.changed_by) || 'Desconhecido',
          target_name: log.target_type === 'user' 
            ? usersMap.get(log.target_id) || 'Usuário desconhecido'
            : log.target_type === 'sector'
            ? sectorsMap.get(log.target_id) || 'Setor desconhecido'
            : 'Role',
        })) as PermissionAuditLog[];
      }
      
      return data as PermissionAuditLog[];
    },
  });
};
