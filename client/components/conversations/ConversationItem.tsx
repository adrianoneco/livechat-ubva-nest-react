import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Pencil, Users, Ticket } from "lucide-react";
import { MoreVertical } from "lucide-react";
import { Tables } from "@/integrations/api/types";
import { ResponseStatusIndicator } from "./ResponseStatusIndicator";
import { TopicBadges } from "@/components/chat/topics/TopicBadges";
import { ConversationActions } from "./ConversationActions";
// ticket and sentiment badges moved to ChatHeader footer
import { QueueIndicator } from "./QueueIndicator";
import { EditContactModal } from "@/components/chat/EditContactModal";
import { isContactNameMissing } from "@/utils/contactUtils";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Conversation = Tables<"whatsapp_conversations"> & {
  contact?: Tables<"whatsapp_contacts"> | null;
  isLastMessageFromMe?: boolean;
  assigned_profile?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  last_message_sender?: {
    name: string;
    avatar_url: string | null;
  } | null;
  ticket?: {
    id: string;
    numero: number;
    status: 'aberto' | 'em_atendimento' | 'finalizado' | 'reaberto';
  } | null;
};

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  foundByContent?: boolean;
}

const getSentimentEmoji = (sentiment: string | null) => {
  switch (sentiment) {
    case "positive":
      return "😊";
    case "negative":
      return "😟";
    case "neutral":
      return "😐";
    default:
      return null;
  }
};

const ticketStatusColors: Record<string, string> = {
  aberto: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  em_atendimento: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  reaberto: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

const ticketStatusLabels: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Atendimento',
  reaberto: 'Reaberto',
};

const formatTimestamp = (dateString: string | null) => {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (isToday(date)) {
    return format(date, "HH:mm");
  }

  if (isYesterday(date)) {
    return "Ontem";
  }

  if (isThisWeek(date)) {
    return format(date, "EEE", { locale: ptBR });
  }

  return format(date, "dd/MM", { locale: ptBR });
};

const getInitials = (name: string) => {
  const words = name.split(" ");
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const ConversationItem = ({ 
  conversation, 
  isSelected, 
  onClick, 
  foundByContent = false 
}: ConversationItemProps) => {
  const contact = conversation.contact;
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const isGroup = contact?.is_group;

  const nameIsMissing = contact ? isContactNameMissing(contact.name, contact.phone_number) : false;
  const contactName = nameIsMissing ? "Sem nome" : (contact?.name || "Desconhecido");
  const profilePicture = conversation.contact?.profile_picture_url;
  const lastMessage = conversation.last_message_preview ? 
    (conversation.last_message_preview.length > 25 ? `${conversation.last_message_preview.slice(0, 25)}...` : conversation.last_message_preview) 
    : "";
  const lastMessageTime = conversation.last_message_at;
  const unreadCount = conversation.unread_count || 0;
  
  // Get last message sender info from metadata (for groups)
  const lastSender = (conversation.metadata as any)?.last_sender || conversation.last_message_sender;
  const lastSenderName = lastSender?.name;
  const lastSenderAvatar = lastSender?.avatar_url;
  
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditModalOpen(true);
  };
  
  // Get sentiment from metadata if available
  const sentiment = (conversation.metadata as any)?.sentiment || null;
  const sentimentEmoji = getSentimentEmoji(sentiment);
  
  // Get topics from metadata
  const topics = (conversation.metadata as any)?.topics || [];
  const sentimentMeta = (conversation.metadata as any)?.sentiment || (conversation as any).sentiment || null;
  
  // Determine if conversation is closed or archived
  const status = conversation.status;
  const showStatusBadge = status === "closed" || status === "archived";
  
  // Get ticket info
  const ticket = conversation.ticket;

  return (
    <>
      <div
        onClick={onClick}
        className={cn(
          "flex items-start gap-3 p-3 cursor-pointer transition-colors w-full relative",
          "hover:bg-sidebar-accent",
          isSelected && "bg-sidebar-accent",
          isGroup && !isSelected && "border-l-2 border-l-primary/50"
        )}
      >
        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-white rounded-r" />
        )}
          {/* Avatar - Group with embedded sender avatar */}
          <div className="relative shrink-0">
            <Avatar className={cn("h-10 w-10", isGroup && "rounded-lg")}>
              <AvatarImage src={profilePicture || undefined} alt={contactName} />
              <AvatarFallback className={cn(
                "bg-primary/10 text-primary text-xs font-medium",
                isGroup && "rounded-lg bg-emerald-500/10"
              )}>
                {isGroup ? <Users className="h-5 w-5 text-emerald-600" /> : getInitials(contactName)}
              </AvatarFallback>
            </Avatar>
            
            {/* Embedded sender avatar for groups - show when there's a sender name */}
            {isGroup && lastSenderName && !conversation.isLastMessageFromMe && (
              <Avatar className="absolute -bottom-1 -right-1 h-5 w-5 border-2 border-background">
                <AvatarImage src={lastSenderAvatar || undefined} alt={lastSenderName} />
                <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                  {getInitials(lastSenderName)}
                </AvatarFallback>
              </Avatar>
            )}
            
            {/* Show small group indicator only when no sender info (e.g., when message is from me) */}
            {isGroup && (!lastSenderName || conversation.isLastMessageFromMe) && (
              <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                <Users className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1 overflow-hidden">
            {/* Row 1: Name + Timestamp */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {isGroup && (
                  <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                )}
                <span className={cn(
                  "font-medium text-sm truncate max-w-full",
                  nameIsMissing && "text-muted-foreground italic"
                )}>
                  {contactName}
                </span>
                {nameIsMissing && !isGroup && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-5 w-5 p-0 shrink-0" 
                    onClick={handleEditClick}
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                )}
                {sentimentEmoji && (
                  <span className="text-sm shrink-0">{sentimentEmoji}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTimestamp(lastMessageTime)}</span>
                <ConversationActions conversation={conversation}>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 rounded hover:bg-accent/50"
                    aria-label="Ações"
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </ConversationActions>
              </div>
            </div>

            {/* Row 2: Preview + Unread/Status */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {isGroup && lastSenderName && !conversation.isLastMessageFromMe && (
                  <span className="text-xs text-primary font-medium shrink-0">
                    {lastSenderName.split(' ')[0]}:
                  </span>
                )}
                <p className="text-sm text-muted-foreground truncate max-w-full">
                  {lastMessage || "Sem mensagens"}
                </p>
                {foundByContent && (
                  <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ResponseStatusIndicator
                  isLastMessageFromMe={conversation.isLastMessageFromMe}
                  conversationStatus={conversation.status || undefined}
                />
                {unreadCount > 0 && (
                  <Badge
                    variant="default"
                    className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center"
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Badge>
                )}
              </div>
            </div>

            {/* Row 3: Topics + Queue/Status/Instance/Ticket (only if has content) */}
            {(topics.length > 0 || showStatusBadge || conversation.assigned_to || conversation.instance?.name || ticket) && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                  {topics.length > 0 && (
                    <TopicBadges topics={topics} size="sm" maxTopics={2} />
                  )}
                  {conversation.instance?.name && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-blue-500/10 text-blue-700 border-blue-200 truncate max-w-[120px]">
                      📱 {conversation.instance.name}
                    </Badge>
                  )}
                  {ticket && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs px-1.5 py-0 h-5 flex items-center gap-1",
                        ticketStatusColors[ticket.status]
                      )}
                    >
                      <Ticket className="h-3 w-3" />
                      #{ticket.numero} • {ticketStatusLabels[ticket.status]}
                    </Badge>
                  )}
                </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <QueueIndicator
                        assignedTo={conversation.assigned_to}
                        assignedToName={conversation.assigned_profile?.full_name}
                        size="sm"
                      />
                      {showStatusBadge && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 whitespace-nowrap">
                          {status === "closed" ? "Encerrada" : "Arquivada"}
                        </Badge>
                      )}
                    </div>
              </div>
            )}
          </div>
        </div>
      
      {/* Edit Contact Modal */}
      {contact && (
        <EditContactModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          contactId={contact.id}
          contactName={contact.name}
          contactPhone={contact.phone_number}
          contactNotes={contact.notes || ''}
          onSuccess={() => {
            setIsEditModalOpen(false);
          }}
        />
      )}
    </>
  );
};

export default ConversationItem;
