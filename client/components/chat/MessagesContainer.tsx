import { useEffect, useRef, useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { TicketEventMarker, isTicketEvent, parseTicketNumber, parseTransferInfo } from "./TicketEventMarker";
import { Tables } from "@/integrations/api/types";
import { format, isToday, isYesterday, isSameWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useMessageReactions } from "@/hooks/whatsapp";
import { useAuth } from "@/contexts/AuthContext";

type Message = Tables<'whatsapp_messages'>;

interface MessagesContainerProps {
  messages: Message[];
  isLoading: boolean;
  conversationId: string | null;
  onReplyMessage?: (message: Message) => void;
  isGroupChat?: boolean;
  rightSidebarPercent?: number;
}

export const MessagesContainer = ({ messages, isLoading, conversationId, onReplyMessage, isGroupChat = false, rightSidebarPercent = 0 }: MessagesContainerProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const prevMessagesLengthRef = useRef(messages.length);
  const { reactionsByMessage } = useMessageReactions(conversationId);
  const { isAdmin, isSupervisor } = useAuth();

  // All users see deleted messages, but with different display
  // Admins see content, non-admins see "Esta mensagem foi apagada"
  const visibleMessages = useMemo(() => messages, [messages]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const threshold = 100;
    const atBottom = scrollHeight - scrollTop - clientHeight < threshold;
    setIsAtBottom(atBottom);
    
    if (atBottom) setNewMessagesCount(0);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setNewMessagesCount(0);
    }
  };

  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else if (visibleMessages.length > prevMessagesLengthRef.current) {
      setNewMessagesCount(prev => prev + (visibleMessages.length - prevMessagesLengthRef.current));
    }
    prevMessagesLengthRef.current = visibleMessages.length;
  }, [visibleMessages, isAtBottom]);

  const getDateSeparator = (date: Date) => {
    if (isToday(date)) return 'Hoje';
    if (isYesterday(date)) return 'Ontem';
    if (isSameWeek(date, new Date())) {
      return format(date, 'EEEE', { locale: ptBR });
    }
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  };

  const groupMessagesByDate = () => {
    const groups: { [key: string]: Message[] } = {};
    
    // Garantir que as mensagens estejam ordenadas por created_at com milissegundos para precisão
    const sortedMessages = [...visibleMessages].sort((a, b) => {
      // Usar created_at como critério principal (inclui milissegundos)
      const createdAtA = new Date(a.created_at).getTime();
      const createdAtB = new Date(b.created_at).getTime();
      if (createdAtA !== createdAtB) return createdAtA - createdAtB;
      
      // Se created_at for igual, usar timestamp como desempate
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    sortedMessages.forEach(msg => {
      const date = new Date(msg.created_at || msg.timestamp);
      const dateKey = format(date, 'yyyy-MM-dd');
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, msgs]) => ({
        date: new Date(dateKey + 'T12:00:00'), // Meio do dia para evitar problemas de fuso
        messages: msgs,
      }));
  };

  const messageGroups = groupMessagesByDate();
  
  // Debug: Log ticket events
  const ticketEvents = visibleMessages.filter(m => isTicketEvent(m.message_type));
  if (ticketEvents.length > 0) {
    console.log('[MessagesContainer] Ticket events found:', ticketEvents.map(m => ({ id: m.id, type: m.message_type, content: m.content })));
  }
  
  // compute right padding based on rightSidebarPercent (percentage of window width)
  const [rightPx, setRightPx] = useState(0);

  const computeRightPx = () => {
    if (typeof window === 'undefined' || rightSidebarPercent <= 0) return 0;
    let px = Math.round(window.innerWidth * (rightSidebarPercent / 100));
    px += 24; // extra offset for handle
    px = Math.min(px, 420);
    return px;
  };

  useEffect(() => {
    const update = () => setRightPx(computeRightPx());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [rightSidebarPercent]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando mensagens...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden">
      <ScrollArea className="h-full w-full" viewportRef={scrollRef} onScroll={handleScroll}>
        <div
          className="space-y-3 p-4 overflow-x-hidden"
        >
          {messageGroups.map((group, idx) => (
            <div key={idx}>
              <div className="flex justify-center my-4">
                <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground">
                  {getDateSeparator(group.date)}
                </span>
              </div>
              
              <div className="space-y-2">
                {group.messages.map((message) => {
                  // Check if this is a ticket event marker
                  if (isTicketEvent(message.message_type)) {
                    const transferInfo = message.message_type === 'conversation_transferred' 
                      ? parseTransferInfo(message.content) 
                      : undefined;
                    
                    return (
                      <TicketEventMarker
                        key={message.id}
                        eventType={message.message_type as any}
                        ticketNumber={parseTicketNumber(message.content)}
                        timestamp={message.timestamp}
                        transferInfo={transferInfo || undefined}
                      />
                    );
                  }
                  
                  return (
                    <MessageBubble 
                      key={message.id} 
                      message={message}
                      reactions={reactionsByMessage[message.message_id]}
                      onReply={onReplyMessage}
                      isGroupChat={isGroupChat}
                      senderName={(message as any).sender_name}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      
      {!isAtBottom && (
        <Button
          onClick={scrollToBottom}
          size="icon"
          className="absolute bottom-6 right-6 rounded-full shadow-lg bg-background hover:bg-accent border border-border z-10"
        >
          <ChevronDown className="h-5 w-5 text-foreground" />
          {newMessagesCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5 font-semibold">
              {newMessagesCount > 99 ? '99+' : newMessagesCount}
            </span>
          )}
        </Button>
      )}
    </div>
  );
};
