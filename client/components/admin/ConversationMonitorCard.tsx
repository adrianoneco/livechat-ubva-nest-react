import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, User, Clock, Eye, UserCheck, ArrowRightLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AdminConversation } from '@/hooks/admin/useAdminConversations';
import { SLAIndicator } from './SLAIndicator';
import { useSLAConfig } from '@/hooks/admin/useSLAConfig';
import { formatPhoneForDisplay } from '@/utils/phoneUtils';
interface ConversationMonitorCardProps {
  conversation: AdminConversation;
  onView: (conversationId: string) => void;
  onAssume: (conversationId: string) => void;
  onTransfer: (conversationId: string) => void;
  isAssuming?: boolean;
}

export function ConversationMonitorCard({
  conversation,
  onView,
  onAssume,
  onTransfer,
  isAssuming,
}: ConversationMonitorCardProps) {
  const { data: slaConfigs } = useSLAConfig();
  // Use default SLA config (media priority) since tickets no longer have prioridade field
  const slaConfig = conversation.ticket && slaConfigs?.length 
    ? slaConfigs.find(c => c.prioridade === 'media') || slaConfigs[0]
    : null;
  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'waiting': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'closed': return 'bg-muted text-muted-foreground border-muted';
      default: return 'bg-muted text-muted-foreground border-muted';
    }
  };

  const getStatusLabel = (status: string | null) => {
    switch (status) {
      case 'active': return 'Ativa';
      case 'waiting': return 'Aguardando';
      case 'closed': return 'Encerrada';
      default: return status || 'Desconhecido';
    }
  };

  const getAgentStatusColor = (status: string | null) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'busy': return 'bg-red-500';
      default: return 'bg-muted';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Contact Avatar */}
          <div className="relative">
            <Avatar className="h-12 w-12">
              <AvatarImage src={conversation.contact?.profile_picture_url || undefined} />
              <AvatarFallback>
                {conversation.contact?.name?.charAt(0).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            {(conversation.unread_count ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                {conversation.unread_count}
              </span>
            )}
          </div>

          {/* Conversation Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-foreground truncate">
                {conversation.contact?.name || 'Contato desconhecido'}
              </h4>
              <Badge variant="outline" className={getStatusColor(conversation.status)}>
                {getStatusLabel(conversation.status)}
              </Badge>
              <SLAIndicator ticket={conversation.ticket} slaConfig={slaConfig} />
            </div>

            <p className="text-sm text-muted-foreground truncate mb-2">
              {formatPhoneForDisplay(conversation.contact?.phone_number)}
            </p>

            {conversation.last_message_preview && (
              <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                <MessageSquare className="h-3 w-3 inline mr-1" />
                {conversation.last_message_preview}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {/* Instance */}
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary/50" />
                {conversation.instance?.name}
              </span>

              {/* Last message time */}
              {conversation.last_message_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(conversation.last_message_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              )}
            </div>
          </div>

          {/* Agent Info */}
          <div className="flex flex-col items-end gap-2">
            {conversation.assigned_agent ? (
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {conversation.assigned_agent.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground">Atendente</p>
                </div>
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={conversation.assigned_agent.avatar_url || undefined} />
                    <AvatarFallback>
                      {conversation.assigned_agent.full_name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span 
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${getAgentStatusColor(conversation.assigned_agent.status)}`} 
                  />
                </div>
              </div>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <User className="h-3 w-3 mr-1" />
                Sem atendente
              </Badge>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onView(conversation.id)}
                className="h-8 px-2"
              >
                <Eye className="h-4 w-4 mr-1" />
                Ver
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAssume(conversation.id)}
                disabled={isAssuming}
                className="h-8 px-2"
              >
                <UserCheck className="h-4 w-4 mr-1" />
                Assumir
              </Button>
              {conversation.assigned_agent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTransfer(conversation.id)}
                  className="h-8 px-2"
                >
                  <ArrowRightLeft className="h-4 w-4 mr-1" />
                  Transferir
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
