import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tables } from "@/integrations/api/types";
import { format } from "date-fns";
import { Check, CheckCheck, Clock, Reply, Pencil, User, Eye, UserCog, Loader2, Bot, FileText, Download, Maximize2, MapPin, ListChecks, ShoppingCart, Timer, MessageSquareDashed, HelpCircle, BarChart3, Smartphone, Trash2, Ban } from "lucide-react";
import { AIFeedbackButton } from "@/components/ai-agent";
import MediaPlayer from '@/components/ui/MediaPlayer';
import { cn } from "@/lib/utils";
import { QuotedMessagePreview } from "./QuotedMessagePreview";
import { ImageViewerModal } from "./ImageViewerModal";
import { PDFViewerModal } from "./PDFViewerModal";
import { MessageReactionButton } from "./MessageReactionButton";
import { MessageReadParticipants } from "./MessageReadParticipants";
import { DeleteMessageModal } from "./DeleteMessageModal";
import { useMessageReaction } from "@/hooks/whatsapp/useMessageReaction";
import { useDeleteMessage } from "@/hooks/whatsapp/useDeleteMessage";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditHistoryPopover } from "./EditHistoryPopover";
import { EditMessageModal } from "./EditMessageModal";
import { useEditMessage } from "@/hooks/whatsapp/useEditMessage";
import { useMediaSignedUrl } from "@/hooks/whatsapp/useMediaSignedUrl";
import { useAuth } from "@/contexts/AuthContext";

type Message = Tables<'whatsapp_messages'>;
type Reaction = Tables<'whatsapp_reactions'>;

interface MessageBubbleProps {
  message: Message;
  reactions?: Reaction[];
  onReply?: (message: Message) => void;
  isGroupChat?: boolean;
  senderName?: string;
}

// Helper function to remove agent name prefix like *[ Admin User ]*
const cleanMessageContent = (content: string | null): string => {
  if (!content) return '';
  // Remove patterns like *[ Name ]* or *[Name]* at the start of message
  return content.replace(/^\*\[\s*[^\]]+\s*\]\*\s*/i, '').trim();
};

// Helper function to format text with bold markers
// Converts *text* and [text] to bold elements
const formatTextWithBold = (text: string): React.ReactNode[] => {
  if (!text) return [];
  
  // Pattern matches:
  // 1. *text* (WhatsApp bold)
  // 2. [ text ] or [text] (bracket notation)
  const pattern = /\*([^*]+)\*|\[\s*([^\]]+)\s*\]/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyIndex = 0;
  
  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Add the bold text (either from *text* or [text])
    const boldText = match[1] || match[2];
    parts.push(
      <strong key={`bold-${keyIndex++}`} className="font-bold">
        {boldText.trim()}
      </strong>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : [text];
};

export const MessageBubble = ({ message, reactions = [], onReply, isGroupChat = false, senderName }: MessageBubbleProps) => {
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [viewerPdf, setViewerPdf] = useState<{ url: string; name?: string } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const isFromMe = message.is_from_me;
  const time = format(new Date(message.timestamp), 'HH:mm');
  const { sendReaction } = useMessageReaction();
  const editMessage = useEditMessage();
  const deleteMessage = useDeleteMessage();
  const { isAdmin, isSupervisor } = useAuth();

  // Admins and supervisors can see deleted message content
  const canViewDeletedContent = isAdmin || isSupervisor;

  // Get signed URL for media if needed
  const { signedUrl: mediaUrl, isLoading: isMediaLoading } = useMediaSignedUrl(
    message.media_url,
    message.conversation_id
  );

  // Parse read_participants from message
  const readParticipants = React.useMemo(() => {
    const msg = message as any;
    if (!msg.read_participants) return [];
    try {
      return typeof msg.read_participants === 'string' 
        ? JSON.parse(msg.read_participants) 
        : msg.read_participants;
    } catch {
      return [];
    }
  }, [message]);

  // Check if message is deleted
  const isDeleted = !!(message as any).deleted;
  
  // For deleted messages: non-admins see only "Esta mensagem foi apagada"
  const showDeletedPlaceholder = isDeleted && !canViewDeletedContent;
  
  // Check if message can be edited (within 15 minutes, text only, and NOT deleted)
  const canEdit = isFromMe && 
    message.message_type === 'text' && 
    !isDeleted &&
    (Date.now() - new Date(message.timestamp).getTime()) < 15 * 60 * 1000;

  // Check if message can be deleted (any message from me and NOT already deleted)
  const canDelete = isFromMe && !isDeleted;
  
  // Check if any actions are available (for hover)
  const hasActions = !isDeleted;

  const handleReact = (emoji: string) => {
    sendReaction.mutate({
      messageId: message.message_id,
      conversationId: message.conversation_id,
      emoji,
      reactorJid: message.remote_jid,
      isFromMe: true,
    });
  };

  const handleEditSave = (newContent: string) => {
    editMessage.mutate({
      messageId: message.message_id,
      conversationId: message.conversation_id,
      newContent,
    }, {
      onSuccess: () => {
        setIsEditModalOpen(false);
      },
    });
  };

  const handleDelete = (reason?: string) => {
    deleteMessage.mutate({
      messageId: message.message_id,
      conversationId: message.conversation_id,
      reason,
    }, {
      onSuccess: () => {
        setIsDeleteModalOpen(false);
      },
    });
  };

  const getStatusIcon = () => {
    if (!isFromMe) return null;
    
    switch (message.status) {
      case 'sending':
        return (
          <span title="Enviando...">
            <Clock className="w-3.5 h-3.5 text-white/60" />
          </span>
        );
      case 'sent':
        return (
          <span title="Enviado">
            <Check className="w-3.5 h-3.5 text-white/80" />
          </span>
        );
      case 'delivered':
        return (
          <span title="Entregue">
            <CheckCheck className="w-3.5 h-3.5 text-white/90" />
          </span>
        );
      case 'read':
        return (
          <span title="Lido">
            <CheckCheck className="w-3.5 h-3.5 text-cyan-300" />
          </span>
        );
      default:
        return (
          <span title="Enviado">
            <Check className="w-3.5 h-3.5 text-white/80" />
          </span>
        );
    }
  };

  const renderReactions = () => {
    if (!reactions || reactions.length === 0) return null;
    
    // Group reactions by emoji and count
    const grouped = reactions.reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return (
      <div className="flex gap-1 flex-wrap mt-1">
        {Object.entries(grouped).map(([emoji, count]) => (
          <span 
            key={emoji}
            className="px-1.5 py-0.5 bg-muted rounded-full text-xs flex items-center gap-1 border border-border"
          >
            <span className="text-sm">{emoji}</span>
            {count > 1 && <span className="text-muted-foreground font-medium">{count}</span>}
          </span>
        ))}
      </div>
    );
  };

  const renderMediaLoading = () => (
    <div className="flex items-center justify-center p-4">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const renderMediaError = (type: string) => (
    <div className="flex items-center justify-center p-4 bg-muted/50 rounded-md">
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar {type === 'audio' ? 'o áudio' : type === 'video' ? 'o vídeo' : 'a mídia'}
      </p>
    </div>
  );

  const renderContent = () => {
    // Check for empty/null content - show alert to check phone
    // This applies to ANY message type that has no displayable content
    const hasNoContent = !message.content || message.content.trim() === '';
    const hasNoMedia = !message.media_url;
    
    // If message has no content AND no media, show the alert
    if (hasNoContent && hasNoMedia) {
      return (
        <div className="flex items-center gap-3 p-3 bg-amber-500/10 rounded-md border border-amber-500/30">
          <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Smartphone className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-amber-700 dark:text-amber-400">Mensagem não disponível</p>
            <p className="text-xs text-amber-600/80 dark:text-amber-500/80">
              Verifique no celular ou WhatsApp Web
            </p>
          </div>
        </div>
      );
    }
    
    switch (message.message_type) {
      case 'image':
        return (
          <div className="space-y-2">
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <img
                src={mediaUrl}
                alt="Imagem"
                className="max-w-full w-auto max-h-[300px] rounded-md cursor-pointer hover:opacity-90 transition-opacity object-contain"
                onClick={() => setViewerImage(mediaUrl)}
              />
            ) : message.media_url ? renderMediaError('image') : null}
            {message.content && message.content !== '[Image]' && (
              <p className="text-sm break-words">{formatTextWithBold(cleanMessageContent(message.content))}</p>
            )}
          </div>
        );
      
      case 'sticker':
        return (
          <div>
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <img
                src={mediaUrl}
                alt="Sticker"
                className="max-w-[150px] cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setViewerImage(mediaUrl)}
              />
            ) : (
              <div className="flex items-center justify-center p-4 bg-muted/30 rounded-lg min-w-[100px] min-h-[100px]">
                <span className="text-3xl">🎨</span>
              </div>
            )}
          </div>
        );
      
      case 'audio':
        // Check if it's a voice message (ptt = push to talk) by checking mimetype or filename
        const isVoiceMessage = message.media_mimetype?.includes('ogg') || 
                               message.media_mimetype?.includes('opus') ||
                               message.media_filename?.includes('ptt');
        return (
          <div className="space-y-2">
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <MediaPlayer src={mediaUrl} type="audio" mimeType={message.media_mimetype || 'audio/ogg'} isVoiceMessage={isVoiceMessage} />
            ) : message.media_url ? renderMediaError('audio') : null}
            {message.transcription_status === 'processing' && (
              <p className={cn(
                "text-xs italic",
                isFromMe ? "text-white/70" : "text-muted-foreground"
              )}>
                Transcrevendo...
              </p>
            )}
            {message.audio_transcription && (
              <div className={cn(
                "border-l-2 pl-2 py-1 mt-1",
                isFromMe ? "border-white/40" : "border-primary/50"
              )}>
                <p className={cn(
                  "text-[10px] font-medium uppercase tracking-wide mb-0.5",
                  isFromMe ? "text-white/60" : "text-muted-foreground"
                )}>
                  Transcrição
                </p>
                <p className={cn(
                  "text-xs",
                  isFromMe ? "text-white/90" : "text-foreground"
                )}>
                  {message.audio_transcription}
                </p>
              </div>
            )}
          </div>
        );
      
      case 'video':
        return (
          <div className="space-y-2">
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <div className="max-w-full w-auto">
                <MediaPlayer src={mediaUrl} type="video" mimeType={message.media_mimetype || 'video/mp4'} />
              </div>
            ) : message.media_url ? renderMediaError('video') : null}
            {message.content && message.content !== '[Video]' && (
              <p className="text-sm break-words">{formatTextWithBold(cleanMessageContent(message.content))}</p>
            )}
          </div>
        );
      
      case 'document':
        // Detect if it's a PDF by mimetype or filename
        const isPdf = message.media_mimetype?.includes('pdf') || 
                      message.content?.toLowerCase().endsWith('.pdf') ||
                      message.media_url?.toLowerCase().includes('.pdf');
        
        // Get filename from metadata first, then content, then fallback
        const messageMetadata = typeof (message as any).metadata === 'string' 
          ? JSON.parse((message as any).metadata || '{}') 
          : ((message as any).metadata || {});
        const docFileName = messageMetadata.fileName || 
          (message.content && message.content !== '[Document]' && message.content !== 'Sent document' ? message.content : null) ||
          'Documento';

        return (
          <div className="space-y-2">
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              isPdf ? (
                // PDF Preview with embedded viewer
                <div className="rounded-md overflow-hidden border border-border bg-muted/30">
                  <div 
                    className="w-full h-48 cursor-pointer relative group"
                    onClick={() => setViewerPdf({ url: mediaUrl, name: docFileName })}
                  >
                    <embed
                      src={`${mediaUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                      type="application/pdf"
                      className="w-full h-full pointer-events-none"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Maximize2 className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 p-2 text-xs",
                    isFromMe ? "text-white/90" : "text-foreground"
                  )}>
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate flex-1">{docFileName}</span>
                    <a
                      href={mediaUrl}
                      download={docFileName}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "p-1 rounded hover:bg-muted/50",
                        isFromMe ? "hover:bg-white/20" : ""
                      )}
                      title="Baixar"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ) : (
                // Generic document (non-PDF)
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border hover:bg-muted/50 transition-colors"
                >
                  <FileText className="w-8 h-8 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{docFileName}</p>
                    <p className="text-xs text-muted-foreground">Clique para abrir</p>
                  </div>
                  <Download className="w-4 h-4 text-muted-foreground" />
                </a>
              )
            ) : message.media_url ? renderMediaError('document') : null}
          </div>
        );
      
      case 'contact':
      case 'contacts':
        return (
          <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-md w-full max-w-[200px]">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{message.content}</p>
              <p className="text-xs text-muted-foreground">Contato compartilhado</p>
            </div>
          </div>
        );
      
      case 'location':
      case 'liveLocation':
      case 'livelocation':
        return (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
            <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Localização</p>
              <p className="text-xs text-muted-foreground">
                {message.message_type === 'liveLocation' || message.message_type === 'livelocation' 
                  ? 'Localização em tempo real' 
                  : 'Localização compartilhada'}
              </p>
            </div>
          </div>
        );

      case 'poll':
      case 'pollCreation':
      case 'pollcreation':
      case 'pollUpdate':
      case 'pollupdate':
        return (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
            <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="h-5 w-5 text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Enquete</p>
              <p className="text-xs text-muted-foreground">
                {message.content && !message.content.startsWith('{') && !message.content.startsWith('[')
                  ? message.content
                  : 'Enquete compartilhada'}
              </p>
            </div>
          </div>
        );

      case 'viewOnce':
      case 'viewonce':
      case 'viewOnceMessage':
      case 'viewoncemessage':
      case 'viewOnceMessageV2':
      case 'viewoncemessagev2':
        return (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
            <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Timer className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Mensagem temporária</p>
              <p className="text-xs text-muted-foreground">
                Visualização única (não disponível)
              </p>
            </div>
          </div>
        );

      case 'protocol':
      case 'protocolMessage':
      case 'protocolmessage':
        // Protocol messages are system messages, usually hidden
        return (
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
            <MessageSquareDashed className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground italic">
              Mensagem do sistema
            </p>
          </div>
        );

      case 'buttons':
      case 'buttonsMessage':
      case 'buttonsmessage':
      case 'buttonsResponseMessage':
      case 'buttonsresponsemessage':
        return (
          <div className="space-y-2">
            <p className="text-sm">
              {message.content && !message.content.startsWith('{') 
                ? message.content 
                : 'Mensagem com botões'}
            </p>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground">
              <ListChecks className="h-4 w-4" />
              <span>Botões interativos</span>
            </div>
          </div>
        );

      case 'list':
      case 'listMessage':
      case 'listmessage':
      case 'listResponseMessage':
      case 'listresponsemessage':
        return (
          <div className="space-y-2">
            <p className="text-sm">
              {message.content && !message.content.startsWith('{') 
                ? message.content 
                : 'Mensagem com lista'}
            </p>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground">
              <ListChecks className="h-4 w-4" />
              <span>Lista interativa</span>
            </div>
          </div>
        );

      case 'product':
      case 'productMessage':
      case 'productmessage':
        return (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
            <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="h-5 w-5 text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Produto</p>
              <p className="text-xs text-muted-foreground">
                {message.content && !message.content.startsWith('{') 
                  ? message.content 
                  : 'Produto compartilhado'}
              </p>
            </div>
          </div>
        );

      case 'order':
      case 'orderMessage':
      case 'ordermessage':
        return (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
            <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="h-5 w-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Pedido</p>
              <p className="text-xs text-muted-foreground">
                {message.content && !message.content.startsWith('{') 
                  ? message.content 
                  : 'Pedido recebido'}
              </p>
            </div>
          </div>
        );

      case 'reaction':
      case 'reactionMessage':
      case 'reactionmessage':
        // Reactions are usually handled separately, but show a fallback
        return null;

      default:
        // Check if content looks like JSON (unknown message type with raw data)
        const isJsonContent = message.content && (
          message.content.trim().startsWith('{') || 
          message.content.trim().startsWith('[')
        );
        
        if (isJsonContent) {
          return (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
              <div className="h-10 w-10 rounded-full bg-gray-500/10 flex items-center justify-center flex-shrink-0">
                <HelpCircle className="h-5 w-5 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Mensagem não suportada</p>
                <p className="text-xs text-muted-foreground">
                  Tipo: {message.message_type || 'desconhecido'}
                </p>
              </div>
            </div>
          );
        }
        
        return (
          <p className="text-sm whitespace-pre-wrap break-words">
            {formatTextWithBold(cleanMessageContent(message.content))}
          </p>
        );
    }
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        'flex group relative w-full',
        isFromMe ? 'justify-end' : 'justify-start'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="max-w-[85%] sm:max-w-[75%] md:max-w-[65%] min-w-[120px] relative pr-6">
        {isHovered && hasActions && (
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-10",
            isFromMe ? "left-0 -translate-x-full -ml-1" : "right-0 translate-x-full ml-1"
          )}>
            <MessageReactionButton
              messageId={message.message_id}
              conversationId={message.conversation_id}
              onReact={handleReact}
              isFromMe={isFromMe}
            />
            {canEdit && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsEditModalOpen(true)}
                className="h-8 w-8 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-sm hover:bg-accent"
                title="Editar mensagem"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsDeleteModalOpen(true)}
                className="h-8 w-8 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-sm hover:bg-destructive/10 hover:text-destructive"
                title="Excluir mensagem"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {onReply && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onReply(message)}
                className="h-8 w-8 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-sm hover:bg-accent"
              >
                <Reply className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        <Card
          className={cn(
            'px-3 py-2 space-y-1 overflow-hidden break-words shadow-sm',
            message.message_type === 'sticker' && 'bg-transparent border-none shadow-none p-0',
            isDeleted
              ? 'bg-red-500/10 border-red-500/30 text-foreground border-dashed opacity-70'
              : message.is_internal
                ? 'bg-amber-500/20 border-amber-500/50 text-foreground border-dashed'
                : message.is_supervisor_message
                  ? 'bg-purple-600 text-white'
                  : isFromMe
                    ? 'bg-emerald-500 text-white border-emerald-600'
                    : 'bg-card text-card-foreground border'
          )}
        >
          {/* Deleted message badge */}
          {isDeleted && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50">
                <Trash2 className="h-3 w-3 mr-1" />
                {(message as any).deleted_by ? 'Excluída pelo atendente' : (isFromMe ? 'Auto-excluída' : 'Excluída pelo usuário')}
              </Badge>
            </div>
          )}
          {/* Group sender name */}
          {isGroupChat && !isFromMe && senderName && (
            <p className="text-xs font-bold text-primary mb-1">
              {senderName}
            </p>
          )}
          {message.is_internal && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/50">
                <Eye className="h-3 w-3 mr-1" />
                Nota Interna
              </Badge>
            </div>
          )}
          {message.is_supervisor_message && !message.is_internal && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-white/20 text-white border-white/30">
                <UserCog className="h-3 w-3 mr-1" />
                Supervisor
              </Badge>
            </div>
          )}
          {(message as any).from_bot && !message.is_internal && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/50">
                <Bot className="h-3 w-3 mr-1" />
                🤖 Assistente Virtual
              </Badge>
            </div>
          )}
          {message.quoted_message_id ? (
            <QuotedMessagePreview messageId={message.quoted_message_id} />
          ) : (() => {
            // Fallback: some messages include quoted info in the row metadata or custom fields
            const m = message as any;
            let quotedContent: string | null = null;
            let quotedSender: string | null = null;

            if (m.quoted_message_content) {
              quotedContent = m.quoted_message_content;
              quotedSender = m.quoted_message_sender || null;
            } else if (m.metadata) {
              try {
                const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
                if (meta && meta.quoted) {
                  quotedContent = meta.quoted.content || meta.quoted.message || null;
                  quotedSender = meta.quoted.sender || meta.quoted.sender_name || null;
                }
              } catch (e) {
                // ignore parse errors
              }
            }

            if (quotedContent) {
              return (
                <div className="border-l-4 pl-2 py-1 mb-2 text-xs opacity-80 border-border bg-muted/30 rounded">
                  <p className="text-[11px] font-semibold text-muted-foreground truncate">{quotedSender || (message.is_from_me ? 'Você' : 'Contato')}</p>
                  <p className="line-clamp-2 text-xs text-foreground">{quotedContent}</p>
                </div>
              );
            }
            return null;
          })()}
          
          {/* Message content - for non-admins, show placeholder when deleted */}
          {showDeletedPlaceholder ? (
            <div className="flex items-center gap-2 text-muted-foreground italic py-1">
              <Ban className="h-4 w-4" />
              <span className="text-sm">Esta mensagem foi apagada</span>
            </div>
          ) : (
            renderContent()
          )}
          
          <div className="flex items-center justify-between gap-2 mt-1">
            {/* Read participants for groups (left side) */}
            {isGroupChat && isFromMe && readParticipants.length > 0 && (
              <MessageReadParticipants 
                participants={readParticipants} 
                isFromMe={isFromMe} 
              />
            )}
            
            {/* Time and status (right side) */}
            <div className="flex items-center justify-end gap-1 flex-1">
              <span
                className={cn(
                  'text-[11px]',
                  isFromMe ? 'text-white/70' : 'text-muted-foreground'
                )}
              >
                {time}
              </span>
              {message.edited_at && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button 
                      className={cn(
                        "text-[11px] italic hover:underline cursor-pointer",
                        isFromMe ? 'text-white/70' : 'text-muted-foreground'
                      )}
                    >
                      Editado
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="p-0 w-auto">
                    <EditHistoryPopover 
                      messageId={message.message_id}
                      currentContent={message.content}
                      originalContent={message.original_content}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {isFromMe && (
                <span className="flex items-center ml-0.5">
                  {getStatusIcon()}
                </span>
              )}
            </div>
          </div>
          {((message as any).is_ai_generated || (message as any).from_bot) && isFromMe && (
            <AIFeedbackButton
              conversationId={message.conversation_id}
              messageId={message.message_id}
              aiResponse={message.content || ""}
            />
          )}
        </Card>
        
        {renderReactions()}
      </div>

      <ImageViewerModal
        imageUrl={viewerImage}
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
      />

      <PDFViewerModal
        pdfUrl={viewerPdf?.url || null}
        fileName={viewerPdf?.name}
        isOpen={!!viewerPdf}
        onClose={() => setViewerPdf(null)}
      />

      <EditMessageModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        currentContent={message.content}
        onSave={handleEditSave}
        isLoading={editMessage.isPending}
      />

      <DeleteMessageModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        isLoading={deleteMessage.isPending}
        messagePreview={message.content?.substring(0, 150)}
      />
    </div>
  );
};
