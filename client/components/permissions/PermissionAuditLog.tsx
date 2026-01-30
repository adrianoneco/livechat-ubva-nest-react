import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, User, Building2, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePermissionAudit } from '@/hooks/permissions';
import { usePermissionTypes } from '@/hooks/permissions';

interface PermissionAuditLogProps {
  targetId?: string;
  limit?: number;
}

const targetTypeConfig = {
  user: { label: 'Usuário', icon: User, color: 'bg-blue-100 text-blue-800' },
  sector: { label: 'Setor', icon: Building2, color: 'bg-green-100 text-green-800' },
  role: { label: 'Role', icon: Shield, color: 'bg-purple-100 text-purple-800' },
};

const PermissionAuditLog = ({ targetId, limit = 50 }: PermissionAuditLogProps) => {
  const { data: logs, isLoading } = usePermissionAudit(targetId, limit);
  const { data: permissionTypes } = usePermissionTypes();

  const getPermissionName = (key: string) => {
    return permissionTypes?.find(pt => pt.key === key)?.name || key;
  };

  const formatChange = (oldValue: boolean | null, newValue: boolean | null) => {
    if (oldValue === null && newValue !== null) {
      return newValue ? 'Ativado' : 'Desativado';
    }
    if (newValue === null) {
      return 'Override removido';
    }
    return `${oldValue ? 'Ativado' : 'Desativado'} → ${newValue ? 'Ativado' : 'Desativado'}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted rounded" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Histórico de Alterações
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Registro de todas as alterações de permissões
        </p>
      </CardHeader>
      <CardContent>
        {logs && logs.length > 0 ? (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {logs.map(log => {
                const typeConfig = targetTypeConfig[log.target_type];
                const Icon = typeConfig.icon;
                
                return (
                  <div key={log.id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-xs ${typeConfig.color}`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {typeConfig.label}
                          </Badge>
                          <span className="font-medium">{log.target_name}</span>
                        </div>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Permissão:</span>{' '}
                          <span className="font-medium">{getPermissionName(log.permission_key)}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Alteração:</span>{' '}
                          <Badge 
                            variant={log.new_value ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {formatChange(log.old_value, log.new_value)}
                          </Badge>
                        </p>
                        {log.reason && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Motivo: {log.reason}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{log.changer_name}</p>
                        <p>{format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma alteração registrada</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PermissionAuditLog;
