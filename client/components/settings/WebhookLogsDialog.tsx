import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWebhookLogs } from '@/hooks/webhooks/useWebhooks';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WebhookLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhookId: string;
}

export function WebhookLogsDialog({ open, onOpenChange, webhookId }: WebhookLogsDialogProps) {
  const { logs, isLoading } = useWebhookLogs(webhookId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Logs do Webhook</DialogTitle>
          <DialogDescription>
            Últimas 50 execuções deste webhook
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs && logs.length > 0 ? (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 border rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {log.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <Badge variant="outline">{log.event}</Badge>
                      {log.response_status && (
                        <Badge 
                          variant={log.response_status < 400 ? "default" : "destructive"}
                        >
                          {log.response_status}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    </span>
                  </div>

                  {log.response_time_ms && (
                    <p className="text-xs text-muted-foreground">
                      Tempo de resposta: {log.response_time_ms}ms
                    </p>
                  )}

                  {log.error_message && (
                    <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {log.error_message}
                    </p>
                  )}

                  {log.attempt_number > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Tentativa #{log.attempt_number}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-muted-foreground">Nenhum log encontrado</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
