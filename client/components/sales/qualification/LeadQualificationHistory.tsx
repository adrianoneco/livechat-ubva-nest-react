import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQualificationLogs } from '@/hooks/sales/useLeadQualification';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Clock, 
  Loader2,
  Bot,
  Zap,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadScoreIndicator } from './LeadScoreIndicator';

interface LeadQualificationHistoryProps {
  leadId: string;
  maxItems?: number;
}

export const LeadQualificationHistory = ({ leadId, maxItems = 10 }: LeadQualificationHistoryProps) => {
  const { data: logs, isLoading } = useQualificationLogs(leadId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhum histórico de qualificação disponível
      </div>
    );
  }

  const displayLogs = logs.slice(0, maxItems);

  const getTriggerIcon = (source?: string | null) => {
    switch (source) {
      case 'ai_response': return <Bot className="w-3 h-3" />;
      case 'webhook': return <Zap className="w-3 h-3" />;
      case 'manual': return <User className="w-3 h-3" />;
      default: return <Clock className="w-3 h-3" />;
    }
  };

  const getTriggerLabel = (source?: string | null) => {
    switch (source) {
      case 'ai_response': return 'AI Agent';
      case 'webhook': return 'Automático';
      case 'manual': return 'Manual';
      default: return 'Sistema';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Histórico de Qualificação
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-0 divide-y">
            {displayLogs.map((log, index) => {
              const TrendIcon = log.score_change > 0 ? TrendingUp : log.score_change < 0 ? TrendingDown : Minus;
              const trendColor = log.score_change > 0 ? 'text-green-500' : log.score_change < 0 ? 'text-red-500' : 'text-muted-foreground';

              return (
                <div key={log.id} className="px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <LeadScoreIndicator 
                          score={log.new_score} 
                          previousScore={log.previous_score ?? undefined}
                          size="sm"
                        />
                        
                        <div className={cn('flex items-center gap-1', trendColor)}>
                          <TrendIcon className="w-3 h-3" />
                          <span className="text-xs font-medium">
                            {log.score_change > 0 ? '+' : ''}{log.score_change}
                          </span>
                        </div>
                        
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {getTriggerIcon(log.trigger_source)}
                          <span className="ml-1">{getTriggerLabel(log.trigger_source)}</span>
                        </Badge>
                      </div>
                      
                      {log.ai_reasoning && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                          {log.ai_reasoning}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                      {log.tokens_used && (
                        <p className="text-[10px] text-muted-foreground">
                          {log.tokens_used} tokens
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
