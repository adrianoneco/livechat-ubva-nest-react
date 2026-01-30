import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, MessageSquare, GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useWhatsAppSentiment } from '@/hooks/whatsapp';
import { useTickets } from '@/hooks/useTickets';
import { useSLAConfig } from '@/hooks/admin/useSLAConfig';
import { SLAIndicator } from '@/components/admin/SLAIndicator';
import { ConversationSentiment } from './ConversationSentiment';
import { ConversationSummaries } from './ConversationSummaries';
import { ConversationNotes } from './ConversationNotes';
import { ConversationLeadStatus } from './ConversationLeadStatus';
import { ConversationTopics } from '../topics/ConversationTopics';

interface ConversationDetailsSidebarProps {
  conversationId: string | null;
  contactName?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function SLAInlineIndicator({ conversationId }: { conversationId: string | null }) {
  const { ticket } = useTickets(conversationId || undefined);
  const { data: slaConfigMap } = useSLAConfig();

  if (!ticket) return null;
  const slaConfig = slaConfigMap?.[ticket.prioridade] || slaConfigMap?.['media'] || null;
  if (!slaConfig) return null;

  return (
    <SLAIndicator ticket={ticket} slaConfig={slaConfig} />
  );
}

function SentimentQuickBadge({ conversationId }: { conversationId: string | null }) {
  const { sentiment, isLoading } = useWhatsAppSentiment(conversationId);

  if (isLoading) return null;
  if (sentiment) return null;

  return (
    <Badge variant="outline" className="text-xs">Sem análise</Badge>
  );
}

export function ConversationDetailsSidebar({
  conversationId,
  contactName,
  isCollapsed,
  onToggleCollapse
}: ConversationDetailsSidebarProps) {

  if (isCollapsed) {
    return (
      <div className="w-14 border-l bg-background flex flex-col items-center py-2 gap-2 h-full">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex flex-col items-center justify-center">
          <GripVertical className="h-4 w-4 text-muted-foreground/50 mb-2" />
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="w-full min-w-[280px] border-l bg-background flex flex-col h-full">
        <div className="px-4 py-2 border-b flex items-center justify-between h-[60px]">
          <h3 className="font-semibold text-sm">Detalhes da Conversa</h3>
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            Selecione uma conversa para ver os detalhes
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[280px] border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b flex items-center justify-between h-[60px]">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm">Detalhes da Conversa</h3>
          {contactName && (
            <p className="text-xs text-muted-foreground truncate">{contactName}</p>
          )}
          {/* Small indicators: SLA + Sentiment status */}
          <div className="mt-1 flex items-center gap-2">
            {/* SLA indicator (if ticket exists and SLA config present) */}
            <SLAInlineIndicator conversationId={conversationId} />

            {/* Sentiment quick badge */}
            <SentimentQuickBadge conversationId={conversationId} />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8 shrink-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Conteúdo */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Pipeline de Vendas */}
          <ConversationLeadStatus conversationId={conversationId} />

          <Separator />

          {/* Sentimento */}
          <ConversationSentiment conversationId={conversationId} />

          <Separator />

          {/* Tópicos */}
          <ConversationTopics conversationId={conversationId} />

          <Separator />

          {/* Resumos AI */}
          <ConversationSummaries conversationId={conversationId} />

          <Separator />

          {/* Observações */}
          <ConversationNotes conversationId={conversationId} />
        </div>
      </ScrollArea>
    </div>
  );
}