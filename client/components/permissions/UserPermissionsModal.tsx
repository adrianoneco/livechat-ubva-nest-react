import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { Info, Undo2, Shield } from 'lucide-react';
import { TeamMember } from '@/hooks/useTeamManagement';
import { useUserSectors } from '@/hooks/useUserSectors';
import { 
  usePermissionTypes, 
  useUserEffectivePermissions, 
  useUserPermissionOverrides 
} from '@/hooks/permissions';

interface UserPermissionsModalProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleConfig = {
  admin: { label: 'Admin', variant: 'destructive' as const },
  supervisor: { label: 'Supervisor', variant: 'default' as const },
  agent: { label: 'Atendente', variant: 'secondary' as const },
};

const sourceLabels = {
  user_override: { label: 'Override', color: 'bg-amber-100 text-amber-800' },
  sector: { label: 'Setor', color: 'bg-blue-100 text-blue-800' },
  role_default: { label: 'Role', color: 'bg-gray-100 text-gray-800' },
};

const UserPermissionsModal = ({ member, open, onOpenChange }: UserPermissionsModalProps) => {
  const [editingPermission, setEditingPermission] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  
  const { data: permissionTypes } = usePermissionTypes();
  const { data: effectivePermissions, isLoading: isLoadingPermissions } = useUserEffectivePermissions(member?.id);
  const { userSectors } = useUserSectors(undefined, member?.id);
  const { setOverride, removeOverride, isSettingOverride, isRemovingOverride } = useUserPermissionOverrides(member?.id);

  if (!member) return null;

  const config = roleConfig[member.role];

  const handleTogglePermission = async (permissionKey: string, currentValue: boolean, source: string) => {
    if (source === 'user_override') {
      // If it's already an override, just toggle it
      await setOverride({
        userId: member.id,
        permissionKey,
        isEnabled: !currentValue,
        reason: overrideReason || undefined,
      });
    } else {
      // Creating new override
      setEditingPermission(permissionKey);
    }
  };

  const handleConfirmOverride = async (permissionKey: string, newValue: boolean) => {
    await setOverride({
      userId: member.id,
      permissionKey,
      isEnabled: newValue,
      reason: overrideReason || undefined,
    });
    setEditingPermission(null);
    setOverrideReason('');
  };

  const handleRemoveOverride = async (permissionKey: string) => {
    await removeOverride({
      userId: member.id,
      permissionKey,
    });
  };

  // Group specific permission items for easier discovery
  // We'll surface 'Instâncias' and 'Contatos' first, then render the remaining categories
  const contactPermissions = permissionTypes?.filter(pt => pt.key.includes('_contacts')) || [];
  const instancePermissions = permissionTypes?.filter(pt => pt.key.includes('_instances')) || [];
  const remainingPermissions = permissionTypes?.filter(pt => !pt.key.includes('_contacts') && !pt.key.includes('_instances')) || [];

  // Group remaining by their category key
  const remainingByCategory = remainingPermissions.reduce<Record<string, typeof permissionTypes>>((acc, pt) => {
    (acc[pt.category] = acc[pt.category] || []).push(pt);
    return acc;
  }, {} as Record<string, typeof permissionTypes>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={member.avatar_url || undefined} />
              <AvatarFallback>
                {member.full_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <span>{member.full_name}</span>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={config.variant}>{config.label}</Badge>
                {userSectors.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {userSectors.map(s => s.sector_name).join(', ')}
                  </span>
                )}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription>
            Gerencie as permissões individuais deste usuário
          </DialogDescription>
        </DialogHeader>

        {/* Summary card */}
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Resumo de Acesso</p>
                <p className="text-muted-foreground">
                  Este usuário pode: {effectivePermissions?.filter(p => p.is_enabled).map(p => {
                    const type = permissionTypes?.find(pt => pt.key === p.permission_key);
                    return type?.name;
                  }).filter(Boolean).join(', ') || 'Nenhuma permissão ativa'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Permissions list */}
        <div className="space-y-4">
          {/* Contatos group */}
          {contactPermissions.length > 0 && (
            <div key="contacts">
              <h4 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Contatos
              </h4>
              <div className="space-y-2">
                {contactPermissions.map(pt => {
                  const effective = effectivePermissions?.find(ep => ep.permission_key === pt.key);
                  const isEnabled = effective?.is_enabled ?? false;
                  const source = effective?.source ?? 'role_default';
                  const sourceConfig = sourceLabels[source];
                  const isEditing = editingPermission === pt.key;

                  return (
                    <div 
                      key={pt.key} 
                      className={`p-3 border rounded-lg transition-colors ${isEditing ? 'border-primary bg-primary/5' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{pt.name}</span>
                            <Badge className={`text-xs ${sourceConfig.color}`}>
                              {sourceConfig.label}
                            </Badge>
                          </div>
                          {pt.description && (
                            <p className="text-xs text-muted-foreground mt-1">{pt.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {source === 'user_override' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleRemoveOverride(pt.key)}
                                  disabled={isRemovingOverride}
                                >
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Remover override (voltar ao padrão)
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => handleTogglePermission(pt.key, isEnabled, source)}
                            disabled={isSettingOverride || isRemovingOverride}
                          />
                        </div>
                      </div>

                      {/* Override confirmation */}
                      {isEditing && (
                        <div className="mt-3 pt-3 border-t space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Você está criando um override que sobrescreverá o padrão do setor/role
                          </p>
                          <Textarea
                            placeholder="Motivo (opcional)"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            className="text-sm"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleConfirmOverride(pt.key, !isEnabled)}
                              disabled={isSettingOverride}
                            >
                              {isEnabled ? 'Desativar' : 'Ativar'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setEditingPermission(null);
                                setOverrideReason('');
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Instâncias group */}
          {instancePermissions.length > 0 && (
            <div key="instances">
              <h4 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Instâncias
              </h4>
              <div className="space-y-2">
                {instancePermissions.map(pt => {
                  const effective = effectivePermissions?.find(ep => ep.permission_key === pt.key);
                  const isEnabled = effective?.is_enabled ?? false;
                  const source = effective?.source ?? 'role_default';
                  const sourceConfig = sourceLabels[source];
                  const isEditing = editingPermission === pt.key;

                  return (
                    <div 
                      key={pt.key} 
                      className={`p-3 border rounded-lg transition-colors ${isEditing ? 'border-primary bg-primary/5' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{pt.name}</span>
                            <Badge className={`text-xs ${sourceConfig.color}`}>
                              {sourceConfig.label}
                            </Badge>
                          </div>
                          {pt.description && (
                            <p className="text-xs text-muted-foreground mt-1">{pt.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {source === 'user_override' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleRemoveOverride(pt.key)}
                                  disabled={isRemovingOverride}
                                >
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Remover override (voltar ao padrão)
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => handleTogglePermission(pt.key, isEnabled, source)}
                            disabled={isSettingOverride || isRemovingOverride}
                          />
                        </div>
                      </div>

                      {/* Override confirmation */}
                      {isEditing && (
                        <div className="mt-3 pt-3 border-t space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Você está criando um override que sobrescreverá o padrão do setor/role
                          </p>
                          <Textarea
                            placeholder="Motivo (opcional)"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            className="text-sm"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleConfirmOverride(pt.key, !isEnabled)}
                              disabled={isSettingOverride}
                            >
                              {isEnabled ? 'Desativar' : 'Ativar'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setEditingPermission(null);
                                setOverrideReason('');
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Remaining categories */}
          {Object.entries(remainingByCategory).map(([catKey, perms]) => (
            <div key={catKey}>
              <h4 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {catKey.charAt(0).toUpperCase() + catKey.slice(1)}
              </h4>
              <div className="space-y-2">
                {perms.map(pt => {
                  const effective = effectivePermissions?.find(ep => ep.permission_key === pt.key);
                  const isEnabled = effective?.is_enabled ?? false;
                  const source = effective?.source ?? 'role_default';
                  const sourceConfig = sourceLabels[source];
                  const isEditing = editingPermission === pt.key;

                  return (
                    <div 
                      key={pt.key} 
                      className={`p-3 border rounded-lg transition-colors ${isEditing ? 'border-primary bg-primary/5' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{pt.name}</span>
                            <Badge className={`text-xs ${sourceConfig.color}`}>
                              {sourceConfig.label}
                            </Badge>
                          </div>
                          {pt.description && (
                            <p className="text-xs text-muted-foreground mt-1">{pt.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {source === 'user_override' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleRemoveOverride(pt.key)}
                                  disabled={isRemovingOverride}
                                >
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Remover override (voltar ao padrão)
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => handleTogglePermission(pt.key, isEnabled, source)}
                            disabled={isSettingOverride || isRemovingOverride}
                          />
                        </div>
                      </div>

                      {/* Override confirmation */}
                      {isEditing && (
                        <div className="mt-3 pt-3 border-t space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Você está criando um override que sobrescreverá o padrão do setor/role
                          </p>
                          <Textarea
                            placeholder="Motivo (opcional)"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            className="text-sm"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleConfirmOverride(pt.key, !isEnabled)}
                              disabled={isSettingOverride}
                            >
                              {isEnabled ? 'Desativar' : 'Ativar'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setEditingPermission(null);
                                setOverrideReason('');
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserPermissionsModal;
