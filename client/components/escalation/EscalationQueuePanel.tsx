import { useState } from 'react';
import { AlertCircle, Clock, User, Phone, MessageSquare, Filter, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useEscalationQueue, EscalationQueueItem } from '@/hooks/ai-agent';
import { EscalationContextCard } from './EscalationContextCard';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

interface EscalationQueuePanelProps {
  sectorId?: string;
  compact?: boolean;
  onSelectConversation?: (conversationId: string) => void;
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

export const EscalationQueuePanel = ({ sectorId, compact = false, onSelectConversation }: EscalationQueuePanelProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { escalations, stats, isLoading, acceptEscalation } = useEscalationQueue({
    sectorId,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['escalation-queue'] });
  };

  const handleAccept = async (escalation: EscalationQueueItem) => {
    await acceptEscalation.mutateAsync(escalation.id);
    if (onSelectConversation) {
      onSelectConversation(escalation.conversation_id);
    } else {
      navigate(`/whatsapp?conversation=${escalation.conversation_id}`);
    }
  };

  const handleViewConversation = (conversationId: string) => {
    if (onSelectConversation) {
      onSelectConversation(conversationId);
    } else {
      navigate(`/whatsapp?conversation=${conversationId}`);
    }
  };

  const formatWaitTime = (createdAt: string) => {
    return formatDistanceToNow(new Date(createdAt), { locale: ptBR, addSuffix: false });
  };

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Fila de Escalação
            </CardTitle>
            <Badge variant="secondary">{stats.pending} pendentes</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : escalations.slice(0, 3).map((escalation) => (
            <div
              key={escalation.id}
              className="flex items-center justify-between p-2 bg-muted rounded-md cursor-pointer hover:bg-muted/80"
              onClick={() => handleViewConversation(escalation.conversation_id)}
            >
              <div className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full', getPriorityColor(escalation.priority))} />
                <span className="text-sm font-medium truncate max-w-[120px]">
                  {escalation.conversation?.contact?.name || 'Cliente'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatWaitTime(escalation.created_at)}
              </span>
            </div>
          ))}
          {escalations.length > 3 && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('/admin/escalacoes')}>
              Ver todos ({escalations.length})
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Fila de Escalação
          </h2>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 bg-muted rounded-md">
            <p className="text-2xl font-bold text-orange-500">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
          <div className="text-center p-2 bg-muted rounded-md">
            <p className="text-2xl font-bold text-blue-500">{stats.assigned}</p>
            <p className="text-xs text-muted-foreground">Atribuídos</p>
          </div>
          <div className="text-center p-2 bg-muted rounded-md">
            <p className="text-2xl font-bold text-red-500">{stats.highPriority}</p>
            <p className="text-xs text-muted-foreground">Alta Prior.</p>
          </div>
          <div className="text-center p-2 bg-muted rounded-md">
            <p className="text-lg font-bold">
              {Math.round(stats.avgWaitTimeSeconds / 60)}m
            </p>
            <p className="text-xs text-muted-foreground">Tempo Médio</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="assigned">Atribuídos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))
          ) : escalations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma escalação {statusFilter === 'pending' ? 'pendente' : ''}</p>
            </div>
          ) : (
            escalations.map((escalation) => (
              <Card 
                key={escalation.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  escalation.priority >= 2 && 'border-orange-500/50'
                )}
              >
                <CardContent className="p-4">
                  {/* Header Row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-3 h-3 rounded-full', getPriorityColor(escalation.priority))} />
                      <div>
                        <p className="font-medium">
                          {escalation.conversation?.contact?.name || 'Cliente'}
                        </p>
                        {escalation.conversation?.contact?.phone_number && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {escalation.conversation.contact.phone_number}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {getPriorityLabel(escalation.priority)}
                    </Badge>
                  </div>

                  {/* Info Row */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatWaitTime(escalation.created_at)}
                    </span>
                    {escalation.sector?.name && (
                      <Badge variant="secondary" className="text-xs">
                        {escalation.sector.name}
                      </Badge>
                    )}
                  </div>

                  {/* AI Summary Preview */}
                  {escalation.ai_summary && (
                    <div 
                      className="p-2 bg-muted rounded-md mb-3 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === escalation.id ? null : escalation.id)}
                    >
                      <p className={cn('text-xs', expandedId !== escalation.id && 'line-clamp-2')}>
                        {escalation.ai_summary}
                      </p>
                      <Button variant="ghost" size="sm" className="h-6 mt-1 p-0">
                        {expandedId === escalation.id ? (
                          <><ChevronUp className="h-3 w-3 mr-1" /> Menos</>
                        ) : (
                          <><ChevronDown className="h-3 w-3 mr-1" /> Mais</>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Expanded Context */}
                  {expandedId === escalation.id && (
                    <div className="mb-3">
                      <EscalationContextCard escalation={escalation} expanded />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {escalation.status === 'pending' && (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAccept(escalation);
                        }}
                        disabled={acceptEscalation.isPending}
                      >
                        <User className="h-4 w-4 mr-1" />
                        Aceitar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewConversation(escalation.conversation_id);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Ver Chat
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
