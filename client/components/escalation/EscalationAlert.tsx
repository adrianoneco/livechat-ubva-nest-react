import { useState, useEffect } from 'react';
import { AlertCircle, UserPlus, X, ExternalLink, Clock, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEscalationNotifications, EscalationNotification } from '@/hooks/ai-agent';
import { useEscalationQueue } from '@/hooks/ai-agent';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface EscalationAlertProps {
  onOpenQueue?: () => void;
}

const getPriorityColor = (priority: number) => {
  switch (priority) {
    case 3: return 'bg-red-500';
    case 2: return 'bg-orange-500';
    case 1: return 'bg-yellow-500';
    default: return 'bg-blue-500';
  }
};

const getPriorityLabel = (priority: number) => {
  switch (priority) {
    case 3: return 'Urgente';
    case 2: return 'Alta';
    case 1: return 'Média';
    default: return 'Normal';
  }
};

const getReasonLabel = (reason: string) => {
  const labels: Record<string, string> = {
    keyword: 'Palavra-chave detectada',
    sentiment: 'Sentimento negativo',
    timeout: 'Tempo limite',
    limit: 'Limite de respostas',
    complexity: 'Complexidade',
    manual: 'Escalação manual',
    request: 'Pedido do cliente',
  };
  return labels[reason] || reason;
};

export const EscalationAlert = ({ onOpenQueue }: EscalationAlertProps) => {
  const navigate = useNavigate();
  const { unreadNotifications, dismiss, markAsRead } = useEscalationNotifications();
  const { acceptEscalation } = useEscalationQueue();
  const [visibleNotification, setVisibleNotification] = useState<EscalationNotification | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Show newest unread notification
  useEffect(() => {
    const newEscalation = unreadNotifications.find(n => n.notification_type === 'new_escalation');
    if (newEscalation && newEscalation.id !== visibleNotification?.id) {
      setVisibleNotification(newEscalation);
      setIsAnimating(true);
    }
  }, [unreadNotifications, visibleNotification?.id]);

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (!visibleNotification) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, 30000);

    return () => clearTimeout(timer);
  }, [visibleNotification]);

  const handleDismiss = () => {
    if (visibleNotification) {
      markAsRead.mutate(visibleNotification.id);
      setIsAnimating(false);
      setTimeout(() => setVisibleNotification(null), 300);
    }
  };

  const handleAccept = async () => {
    if (!visibleNotification?.escalation) return;

    await acceptEscalation.mutateAsync(visibleNotification.escalation.id);
    dismiss.mutate(visibleNotification.id);
    setVisibleNotification(null);
    
    // Navigate to conversation
    navigate(`/whatsapp?conversation=${visibleNotification.escalation.conversation_id}`);
  };

  const handleViewQueue = () => {
    if (visibleNotification) {
      markAsRead.mutate(visibleNotification.id);
    }
    setVisibleNotification(null);
    onOpenQueue?.();
  };

  if (!visibleNotification || !visibleNotification.escalation) return null;

  const { escalation } = visibleNotification;
  const contactName = escalation.conversation?.contact?.name || 'Cliente';
  const phoneNumber = escalation.conversation?.contact?.phone_number || '';

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 max-w-md transition-all duration-300',
        isAnimating ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      )}
    >
      <Card className="border-2 border-orange-500/50 shadow-lg shadow-orange-500/20 bg-background">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={cn('p-1.5 rounded-full', getPriorityColor(escalation.priority))}>
                <AlertCircle className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Nova Escalação</h4>
                <Badge variant="outline" className="text-xs mt-0.5">
                  {getPriorityLabel(escalation.priority)}
                </Badge>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Contact Info */}
          <div className="mb-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              {contactName}
            </div>
            {phoneNumber && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <Phone className="h-3 w-3" />
                {phoneNumber}
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="mb-3">
            <Badge variant="secondary" className="text-xs">
              {getReasonLabel(escalation.escalation_reason)}
            </Badge>
            {escalation.customer_sentiment === 'negative' && (
              <Badge variant="destructive" className="text-xs ml-1">
                😟 Sentimento negativo
              </Badge>
            )}
          </div>

          {/* AI Summary Preview */}
          {escalation.ai_summary && (
            <div className="mb-3 p-2 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground line-clamp-3">
                {escalation.ai_summary}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleAccept}
              disabled={acceptEscalation.isPending}
            >
              <UserPlus className="h-4 w-4 mr-1" />
              Aceitar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleViewQueue}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Ver Fila
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
