import { useState, useMemo } from 'react';
import { Plus, Trash2, ExternalLink, CheckCircle, XCircle, Loader2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useWebhooks, WEBHOOK_EVENT_CATEGORIES } from '@/hooks/webhooks/useWebhooks';
import { WebhookDialog } from './WebhookDialog';
import { WebhookLogsDialog } from './WebhookLogsDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function WebhooksManager() {
  const { 
    webhooks, 
    isLoading, 
    deleteWebhook, 
    toggleWebhook, 
    isDeleting,
    createWebhook,
    updateWebhook,
    isCreating,
    isUpdating
  } = useWebhooks();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [logsWebhookId, setLogsWebhookId] = useState<string | null>(null);

  // Buscar webhook para edição de forma estável
  const editingWebhook = useMemo(() => {
    if (!editingWebhookId || !webhooks) return null;
    return webhooks.find(w => w.id === editingWebhookId) || null;
  }, [editingWebhookId, webhooks]);

  const handleEdit = (webhook: any) => {
    setEditingWebhookId(webhook.id);
    setIsDialogOpen(true);
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteWebhook(deletingId);
      setDeletingId(null);
    }
  };

  // Get all events from all categories
  const allEvents = Object.values(WEBHOOK_EVENT_CATEGORIES).flatMap(cat => cat.events);

  const getEventLabel = (event: string) => {
    return allEvents.find(e => e.value === event)?.label || event;
  };

  const getEventCategory = (event: string) => {
    for (const [key, category] of Object.entries(WEBHOOK_EVENT_CATEGORIES)) {
      if (category.events.some(e => e.value === event)) {
        return { key, label: category.label };
      }
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Webhooks</h3>
          <p className="text-sm text-muted-foreground">
            Configure notificações automáticas para sistemas externos
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Webhook
        </Button>
      </div>

      {webhooks && webhooks.length > 0 ? (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{webhook.name}</CardTitle>
                    <Switch
                      checked={webhook.is_active}
                      onCheckedChange={(checked) => 
                        toggleWebhook({ id: webhook.id, is_active: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLogsWebhookId(webhook.id)}
                    >
                      <Activity className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(webhook)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingId(webhook.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="flex items-center gap-2">
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate">{webhook.url}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2 mb-3">
                  <TooltipProvider>
                    {(webhook.events || []).slice(0, 5).map((event) => {
                      const category = getEventCategory(event);
                      return (
                        <Tooltip key={event}>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="cursor-help">
                              {getEventLabel(event)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{category?.label || 'Geral'}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                    {(webhook.events || []).length > 5 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="cursor-help">
                            +{(webhook.events || []).length - 5}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            {(webhook.events || []).slice(5).map((event) => (
                              <p key={event}>{getEventLabel(event)}</p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {webhook.last_success_at && (
                    <div className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span>
                        Último sucesso: {format(new Date(webhook.last_success_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  )}
                  {webhook.failure_count > 0 && (
                    <div className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" />
                      <span>{webhook.failure_count} falhas</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ExternalLink className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              Nenhum webhook configurado
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro webhook
            </Button>
          </CardContent>
        </Card>
      )}

      <WebhookDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingWebhookId(null);
        }}
        webhook={editingWebhook}
        createWebhook={createWebhook}
        updateWebhook={updateWebhook}
        isCreating={isCreating}
        isUpdating={isUpdating}
      />

      <WebhookLogsDialog
        open={!!logsWebhookId}
        onOpenChange={(open) => !open && setLogsWebhookId(null)}
        webhookId={logsWebhookId || ''}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O webhook será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
