import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Shield, Eye, MessageSquare, LayoutGrid, Users, Settings, ArrowRightLeft, MessageCircle, Edit2, Trash } from 'lucide-react';
import { usePermissionTypes, useUpdatePermissionDefault, PermissionType } from '@/hooks/permissions';

const permissionIcons: Record<string, React.ElementType> = {
  can_access_conversations: MessageSquare,
  can_respond_conversations: MessageCircle,
  can_access_kanban: LayoutGrid,
  can_view_global_data: Eye,
  can_access_admin_panel: Settings,
  can_send_internal_messages: MessageSquare,
  can_transfer_conversations: ArrowRightLeft,
  can_view_contacts: Eye,
  can_edit_contacts: Edit2,
  can_delete_contacts: Trash,
  can_view_instances: Eye,
  can_edit_instances: Edit2,
  can_delete_instances: Trash,
};

interface PermissionSwitchProps {
  permissionKey: string;
  roleKey: string;
  checked: boolean;
}

const PermissionSwitch: React.FC<PermissionSwitchProps> = React.memo(({ permissionKey, roleKey, checked }) => {
  const [isPending, setIsPending] = useState(false);
  const [localChecked, setLocalChecked] = useState(checked);
  const updateDefault = useUpdatePermissionDefault();

  // Sync local state when prop changes (after server update)
  React.useEffect(() => {
    setLocalChecked(checked);
  }, [checked]);

  const handleToggle = useCallback(async () => {
    const newValue = !localChecked;
    setLocalChecked(newValue);
    setIsPending(true);
    try {
      await updateDefault.mutateAsync({ permissionKey, roleKey, value: newValue });
    } catch (err) {
      // Revert on error
      setLocalChecked(!newValue);
    } finally {
      setIsPending(false);
    }
  }, [localChecked, permissionKey, roleKey, updateDefault]);

  return (
    <Switch
      checked={localChecked}
      disabled={isPending}
      onCheckedChange={handleToggle}
    />
  );
});

const RolesCapabilitiesCard = () => {
  const { data: permissionTypes, isLoading } = usePermissionTypes();

  const roles = [
    { key: 'admin', label: 'Admin', description: 'Acesso total ao sistema', variant: 'destructive' as const },
    { key: 'supervisor', label: 'Supervisor', description: 'Gerencia equipe e monitora conversas', variant: 'default' as const },
    { key: 'manager', label: 'Gerente', description: 'Gerencia equipes e recursos', variant: 'default' as const },
    { key: 'agent', label: 'Atendente', description: 'Atende conversas atribuídas', variant: 'secondary' as const },
  ];

  const roleColorClass: Record<string, string> = {
    admin: 'bg-red-500 text-white',
    supervisor: 'bg-emerald-500 text-white',
    manager: 'bg-blue-500 text-white',
    agent: 'bg-slate-100 text-slate-800',
  };

  const categories = [
    { key: 'conversations', label: 'Conversas' },
    { key: 'sales', label: 'Vendas' },
    { key: 'admin', label: 'Administração' },
  ];

  const contactPermissions = permissionTypes?.filter(pt => pt.key.includes('_contacts')) || [];
  const instancePermissions = permissionTypes?.filter(pt => pt.key.includes('_instances')) || [];
  const remainingPermissionTypes = permissionTypes?.filter(pt => !pt.key.includes('_contacts') && !pt.key.includes('_instances')) || [];

  const getColorForKey = (ptKey: string, category?: string) => {
    if (ptKey.includes('_contacts')) return 'bg-violet-500';
    if (ptKey.includes('_instances')) return 'bg-amber-500';
    if (category === 'conversations' || ptKey.includes('conversation')) return 'bg-blue-500';
    if (category === 'sales' || ptKey.includes('sales')) return 'bg-green-500';
    if (category === 'admin' || ptKey.includes('admin')) return 'bg-red-500';
    return 'bg-gray-400';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Documentação de Roles
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Capacidades padrão de cada role no sistema
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Legenda:</span>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-violet-500" aria-hidden /><span>Contatos</span></div>
                <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-500" aria-hidden /><span>Instâncias</span></div>
                <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-blue-500" aria-hidden /><span>Conversas</span></div>
                <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-green-500" aria-hidden /><span>Vendas</span></div>
                <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-500" aria-hidden /><span>Administração</span></div>
                <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-gray-400" aria-hidden /><span>Outros</span></div>
              </div>
            </div>
          </div>
          {/* Role descriptions */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {roles.map(role => (
              <div key={role.key} className="p-3 border rounded-lg">
                <Badge className={`mb-1 ${roleColorClass[role.key]}`}>{role.label}</Badge>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
            ))}
          </div>

          {/* Permissions matrix */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Permissão</th>
                  {roles.map(role => (
                    <th key={role.key} className="text-center py-3 px-4 font-medium">
                      <Badge className={`${roleColorClass[role.key]} py-1 px-3 rounded-full`}>{role.label}</Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Contacts group */}
                {contactPermissions.length > 0 && (
                  <>
                    <tr className="bg-muted/50">
                      <td colSpan={5} className="py-2 px-2 font-semibold text-muted-foreground">Contatos</td>
                    </tr>
                    {contactPermissions.map(pt => {
                      const Icon = permissionIcons[pt.key] || Users;
                      return (
                        <tr key={pt.key} className="border-b">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <span className={`${getColorForKey(pt.key, pt.category)} h-3 w-3 rounded-full`} />
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <span className="font-medium">{pt.name}</span>
                                {pt.description && (
                                  <p className="text-xs text-muted-foreground">{pt.description}</p>
                                )}
                              </div>
                            </div>
                          </td>
                            <td className="text-center py-3 px-4">
                              <PermissionSwitch permissionKey={pt.key} roleKey="admin" checked={Boolean(pt.default_for_admin)} />
                            </td>
                            <td className="text-center py-3 px-4">
                              <PermissionSwitch permissionKey={pt.key} roleKey="supervisor" checked={Boolean(pt.default_for_supervisor)} />
                            </td>
                            <td className="text-center py-3 px-4">
                              <PermissionSwitch permissionKey={pt.key} roleKey="manager" checked={Boolean(pt.default_for_manager)} />
                            </td>
                            <td className="text-center py-3 px-4">
                              <PermissionSwitch permissionKey={pt.key} roleKey="agent" checked={Boolean(pt.default_for_agent)} />
                            </td>
                        </tr>
                      );
                    })}
                  </>
                )}

                {/* Instances group */}
                {instancePermissions.length > 0 && (
                  <>
                    <tr className="bg-muted/50">
                      <td colSpan={5} className="py-2 px-2 font-semibold text-muted-foreground">Instâncias</td>
                    </tr>
                    {instancePermissions.map(pt => {
                      const Icon = permissionIcons[pt.key] || Users;
                      return (
                        <tr key={pt.key} className="border-b">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <span className={`${getColorForKey(pt.key, pt.category)} h-3 w-3 rounded-full`} />
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <span className="font-medium">{pt.name}</span>
                                {pt.description && (
                                  <p className="text-xs text-muted-foreground">{pt.description}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-center py-3 px-4">
                            <PermissionSwitch permissionKey={pt.key} roleKey="admin" checked={Boolean(pt.default_for_admin)} />
                          </td>
                          <td className="text-center py-3 px-4">
                            <PermissionSwitch permissionKey={pt.key} roleKey="supervisor" checked={Boolean(pt.default_for_supervisor)} />
                          </td>
                          <td className="text-center py-3 px-4">
                            <PermissionSwitch permissionKey={pt.key} roleKey="manager" checked={Boolean(pt.default_for_manager)} />
                          </td>
                          <td className="text-center py-3 px-4">
                            <PermissionSwitch permissionKey={pt.key} roleKey="agent" checked={Boolean(pt.default_for_agent)} />
                          </td>
                        </tr>
                      );
                    })}
                  </>
                )}

                {/* Remaining categories */}
                {categories.map(category => (
                  <React.Fragment key={category.key}>
                    <tr className="bg-muted/50">
                      <td colSpan={5} className="py-2 px-2 font-semibold text-muted-foreground">
                        {category.label}
                      </td>
                    </tr>
                    {remainingPermissionTypes
                      .filter(pt => pt.category === category.key)
                      .map(pt => {
                        const Icon = permissionIcons[pt.key] || Users;
                        return (
                          <tr key={pt.key} className="border-b">
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                              <span className={`${getColorForKey(pt.key, pt.category)} h-3 w-3 rounded-full`} />
                              <Icon className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <span className="font-medium">{pt.name}</span>
                                  {pt.description && (
                                    <p className="text-xs text-muted-foreground">{pt.description}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="text-center py-3 px-4">
                              <PermissionSwitch permissionKey={pt.key} roleKey="admin" checked={Boolean(pt.default_for_admin)} />
                            </td>
                            <td className="text-center py-3 px-4">
                              <PermissionSwitch permissionKey={pt.key} roleKey="supervisor" checked={Boolean(pt.default_for_supervisor)} />
                            </td>
                            <td className="text-center py-3 px-4">
                              <PermissionSwitch permissionKey={pt.key} roleKey="manager" checked={Boolean(pt.default_for_manager)} />
                            </td>
                            <td className="text-center py-3 px-4">
                              <PermissionSwitch permissionKey={pt.key} roleKey="agent" checked={Boolean(pt.default_for_agent)} />
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hierarchy explanation */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Hierarquia de Permissões</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li><strong>Role</strong> define as permissões base (Admin tem tudo por padrão)</li>
              <li><strong>Setor</strong> pode personalizar permissões para todos os membros</li>
              <li><strong>Override Individual</strong> sobrescreve permissões do setor para um usuário específico</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RolesCapabilitiesCard;
