import { AlertCircle, Clock, User, TrendingUp, Frown, Meh, Smile } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EscalationQueueItem } from '@/hooks/ai-agent';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface EscalationContextCardProps {
  escalation: EscalationQueueItem;
  expanded?: boolean;
}

const getPriorityConfig = (priority: number) => {
  switch (priority) {
    case 3: return { label: 'Urgente', color: 'bg-red-500 text-white', border: 'border-red-500' };
    case 2: return { label: 'Alta', color: 'bg-orange-500 text-white', border: 'border-orange-500' };
    case 1: return { label: 'Média', color: 'bg-yellow-500 text-black', border: 'border-yellow-500' };
    default: return { label: 'Normal', color: 'bg-blue-500 text-white', border: 'border-blue-500' };
  }
};

const getSentimentIcon = (sentiment: string | null) => {
  switch (sentiment) {
    case 'negative': return <Frown className="h-4 w-4 text-red-500" />;
    case 'positive': return <Smile className="h-4 w-4 text-green-500" />;
    default: return <Meh className="h-4 w-4 text-yellow-500" />;
  }
};

const getReasonLabel = (reason: string) => {
  const labels: Record<string, string> = {
    keyword: 'Palavra-chave detectada',
    sentiment: 'Sentimento negativo',
    timeout: 'Tempo limite excedido',
    limit: 'Limite de respostas atingido',
    complexity: 'Complexidade alta',
    manual: 'Escalação manual',
    request: 'Cliente pediu atendente',
  };
  return labels[reason] || reason;
};

export const EscalationContextCard = ({ escalation, expanded = false }: EscalationContextCardProps) => {
  const priorityConfig = getPriorityConfig(escalation.priority);
  const waitTime = formatDistanceToNow(new Date(escalation.created_at), { 
    locale: ptBR, 
    addSuffix: false 
  });

  return (
    <Card className={cn('transition-all', priorityConfig.border, expanded && 'border-2')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Contexto da Escalação
          </CardTitle>
          <Badge className={priorityConfig.color}>
            {priorityConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Wait Time & Status */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Aguardando há {waitTime}</span>
          </div>
          <Badge variant={escalation.status === 'pending' ? 'secondary' : 'outline'}>
            {escalation.status === 'pending' ? 'Aguardando' : 
             escalation.status === 'assigned' ? 'Atribuído' : escalation.status}
          </Badge>
        </div>

        <Separator />

        {/* Reason & Sentiment */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Motivo</p>
            <Badge variant="outline" className="text-xs">
              {getReasonLabel(escalation.escalation_reason)}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Sentimento</p>
            <div className="flex items-center gap-1">
              {getSentimentIcon(escalation.customer_sentiment)}
              <span className="text-sm capitalize">
                {escalation.customer_sentiment === 'negative' ? 'Negativo' :
                 escalation.customer_sentiment === 'positive' ? 'Positivo' : 'Neutro'}
              </span>
            </div>
          </div>
        </div>

        {/* Lead Score */}
        {escalation.lead_score !== null && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span>Lead Score</span>
              </div>
              <Badge 
                variant="outline"
                className={cn(
                  escalation.lead_score >= 80 ? 'border-green-500 text-green-600' :
                  escalation.lead_score >= 50 ? 'border-yellow-500 text-yellow-600' :
                  'border-muted'
                )}
              >
                {escalation.lead_score}/100
              </Badge>
            </div>
          </>
        )}

        {/* Detected Intent */}
        {escalation.detected_intent && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Intenção Detectada</p>
              <p className="text-sm">{escalation.detected_intent}</p>
            </div>
          </>
        )}

        {/* AI Summary */}
        {escalation.ai_summary && expanded && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Resumo da IA</p>
              <div className="p-3 bg-muted rounded-md text-sm prose prose-sm max-w-none">
                <div dangerouslySetInnerHTML={{ 
                  __html: escalation.ai_summary
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br />')
                }} />
              </div>
            </div>
          </>
        )}

        {/* Assigned User */}
        {escalation.assigned_user && (
          <>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Atribuído para</span>
              </div>
              <span className="font-medium">
                {escalation.assigned_user.full_name || 'Agente'}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
