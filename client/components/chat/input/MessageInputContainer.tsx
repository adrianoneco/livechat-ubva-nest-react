import { useState, useRef, KeyboardEvent, useEffect, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Mic, ChevronDown, ChevronUp, Bot, User, Timer } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useConversationAssignment } from "@/hooks/whatsapp/useConversationAssignment";
import { useAIAgentSession, ConversationMode } from "@/hooks/ai-agent";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmojiPickerButton } from "./EmojiPickerButton";
import { MediaUploadButton } from "./MediaUploadButton";
import { AIComposerButton } from "./AIComposerButton";
import { AudioRecorder } from "./AudioRecorder";
import { MacroSuggestions } from "./MacroSuggestions";
import { MacrosButton } from "./MacrosButton";
import { SmartReplySuggestions } from "./SmartReplySuggestions";
import { ReplyPreview } from "./ReplyPreview";
import { QuoteButton } from "@/components/chat/QuoteButton";
import { useWhatsAppMacros } from "@/hooks/whatsapp/useWhatsAppMacros";
import { useSmartReply } from "@/hooks/whatsapp/useSmartReply";
import { Tables } from "@/integrations/api/types";

type Message = Tables<'whatsapp_messages'>;

export interface MediaSendParams {
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  content?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
}

interface MessageInputContainerProps {
  conversationId: string;
  disabled?: boolean;
  replyingTo?: Message | null;
  leadId?: string;
  sectorId?: string;
  conversationMode?: ConversationMode;
  assignedTo?: string | null;
  lastCustomerMessageTime?: string | null;
  hybridTimeoutMinutes?: number;
  lastHumanResponseTime?: string | null;
  onSendText: (content: string, quotedMessageId?: string) => void;
  onSendMedia: (params: MediaSendParams) => void;
  onCancelReply?: () => void;
}

export const MessageInputContainer = ({ 
  conversationId, 
  disabled,
  replyingTo,
  leadId,
  sectorId,
  conversationMode = 'ai',
  assignedTo,
  lastCustomerMessageTime,
  hybridTimeoutMinutes = 5,
  lastHumanResponseTime,
  onSendText, 
  onSendMedia,
  onCancelReply
}: MessageInputContainerProps) => {
  console.log('[MessageInputContainer Debug] Received hybridTimeoutMinutes:', hybridTimeoutMinutes);
  
  const { user } = useAuth();
  const { assumeConversation } = useAIAgentSession(conversationId);
  const { assignConversation, isAssigning } = useConversationAssignment();
  
  // Verifica se o agente pode enviar mensagens
  const [localAssignedTo, setLocalAssignedTo] = useState<string | null>(assignedTo || null);
  useEffect(() => setLocalAssignedTo(assignedTo || null), [assignedTo]);
  const isAgentAssigned = (localAssignedTo || null) === user?.id;
  const isHumanOrHybridMode = conversationMode === 'human' || conversationMode === 'hybrid';
  const canSendMessage = isHumanOrHybridMode && isAgentAssigned;
  
  // Countdown para modo híbrido
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  
  useEffect(() => {
    if (conversationMode !== 'hybrid' || !lastCustomerMessageTime) {
      setCountdownSeconds(null);
      return;
    }
    
    const calculateRemaining = () => {
      const customerTime = new Date(lastCustomerMessageTime).getTime();
      const humanTime = lastHumanResponseTime ? new Date(lastHumanResponseTime).getTime() : 0;
      const referenceTime = Math.max(customerTime, humanTime);
      const timeoutMs = hybridTimeoutMinutes * 60 * 1000;
      console.log('[Hybrid Countdown Debug]', { hybridTimeoutMinutes, timeoutMs, customerTime, humanTime, referenceTime });
      const targetTime = referenceTime + timeoutMs;
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((targetTime - now) / 1000));
      console.log('[Hybrid Countdown Debug] Calculated remaining:', { targetTime, now, remaining });
      
      // Se o cliente enviou mensagem após a última resposta humana, mostrar countdown
      if (customerTime > humanTime) {
        return remaining;
      }
      return null;
    };
    
    const remaining = calculateRemaining();
    console.log('[Hybrid Countdown Debug] Final countdown:', remaining);
    setCountdownSeconds(remaining);
    
    if (remaining === null || remaining <= 0) return;
    
    const interval = setInterval(() => {
      const newRemaining = calculateRemaining();
      setCountdownSeconds(newRemaining);
      if (newRemaining === null || newRemaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [conversationMode, lastCustomerMessageTime, lastHumanResponseTime, hybridTimeoutMinutes]);
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showMacroSuggestions, setShowMacroSuggestions] = useState(false);
  const [filteredMacros, setFilteredMacros] = useState<any[]>([]);
  const [showSmartReplies, setShowSmartReplies] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { macros, incrementUsage } = useWhatsAppMacros();
  const { suggestions, isLoading: isLoadingSmartReplies, isRefreshing, refresh } = useSmartReply(conversationId);

  // Detect /macro: command and filter macros
  useEffect(() => {
    const match = message.match(/\/macro:\s*(\S*)$/i);
    if (match) {
      const searchTerm = match[1].toLowerCase();
      const filtered = macros.filter(m => 
        m.shortcut.toLowerCase().includes(searchTerm) ||
        m.name.toLowerCase().includes(searchTerm)
      );
      setFilteredMacros(filtered);
      setShowMacroSuggestions(filtered.length > 0);
    } else {
      setShowMacroSuggestions(false);
      setFilteredMacros([]);
    }
  }, [message, macros]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendText(message.trim(), replyingTo?.message_id);
      setMessage("");
      onCancelReply?.();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    if (!textareaRef.current) return;
    
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = message;
    const newText = text.substring(0, start) + emoji + text.substring(end);
    
    setMessage(newText);
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = start + emoji.length;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleMacroSelect = (macro: any) => {
    setMessage(macro.content);
    incrementUsage(macro.id);
    setShowMacroSuggestions(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleMacroButtonSelect = (content: string, macroId: string) => {
    setMessage(content);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleSmartReplySelect = (text: string) => {
    setMessage(text);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  if (isRecording) {
    return (
      <div className="p-4 border-t border-border bg-card">
        <AudioRecorder
          onSend={(params) => {
            onSendMedia(params);
            setIsRecording(false);
          }}
          onCancel={() => setIsRecording(false)}
        />
      </div>
    );
  }

  // Renderiza banner de modo AI se não puder enviar mensagens
  if (conversationMode === 'ai' && !isAgentAssigned) {
    return (
      <div className="border-t border-border bg-card p-4">
        <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-primary" />
            <div>
              <p className="font-medium text-sm">Conversa em modo I.A.</p>
              <p className="text-xs text-muted-foreground">O Assistente Virtual está atendendo automaticamente.</p>
            </div>
          </div>
          <Button
            onClick={() => user?.id && assumeConversation.mutate(user.id)}
            disabled={assumeConversation.isPending}
            size="sm"
          >
            <User className="h-4 w-4 mr-2" />
            Assumir Conversa
          </Button>
        </div>
      </div>
    );
  }
  
  // Se não está atribuído a este agente
  if (localAssignedTo && localAssignedTo !== user?.id) {

    return (
      <div className="border-t border-border bg-card p-4">
        <div className="flex items-center justify-between bg-muted/50 border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Esta conversa está atribuída a outro atendente.</p>
          <Button
            size="sm"
            onClick={() => {
              if (!conversationId || !user?.id) return;
              // Optimistic update so UI reflects assignment immediately
              setLocalAssignedTo(user.id);
              assignConversation({ conversationId, assignedTo: user.id });
            }}
            disabled={isAssigning}
          >
            Atribuir a mim
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-card">
      {/* Countdown para modo híbrido */}
      {conversationMode === 'hybrid' && countdownSeconds !== null && countdownSeconds > 0 && (
        <div className="px-4 pt-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 cursor-help">
                  <Timer className="h-4 w-4 text-amber-500 animate-pulse" />
                  <span className="text-sm font-medium text-amber-600">
                    {Math.floor(countdownSeconds / 60)}:{(countdownSeconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Faltam {countdownSeconds} segundos para o Assistente Virtual responder automaticamente</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      
      {replyingTo && onCancelReply && (
        <ReplyPreview message={replyingTo} onCancel={onCancelReply} />
      )}
      
      {showSmartReplies && (
        <SmartReplySuggestions
          suggestions={suggestions}
          isLoading={isLoadingSmartReplies}
          isRefreshing={isRefreshing}
          onSelectSuggestion={handleSmartReplySelect}
          onRefresh={refresh}
          onToggle={() => setShowSmartReplies(false)}
        />
      )}
      
      <div className="p-4">
        {showMacroSuggestions && (
          <MacroSuggestions
            macros={filteredMacros}
            onSelect={handleMacroSelect}
          />
        )}
        
        <div className="flex gap-2 items-end">
          <div className="relative flex-1 rounded-md border border-input bg-background">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              className="min-h-[44px] max-h-96 resize-y border-0 pr-56 focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={disabled}
            />
            
            <div className="absolute right-2 bottom-2 flex gap-1 items-center bg-background">
              <EmojiPickerButton onEmojiSelect={handleEmojiSelect} disabled={disabled} />
              
              <MacrosButton
                onSelectMacro={handleMacroButtonSelect}
                disabled={disabled}
              />
              
              <MediaUploadButton 
                conversationId={conversationId}
                onSendMedia={onSendMedia}
                disabled={disabled}
              />
              
              <AIComposerButton
                message={message}
                onComposed={(newMessage) => setMessage(newMessage)}
                disabled={disabled}
              />
              
              <QuoteButton
                conversationId={conversationId}
                leadId={leadId}
                sectorId={sectorId}
                disabled={disabled}
              />
              
              <Button
                type="button"
                onClick={() => setIsRecording(true)}
                size="icon"
                variant="ghost"
                disabled={disabled}
                className="h-9 w-9 shrink-0"
              >
                <Mic className="w-4 h-4" />
              </Button>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={() => setShowSmartReplies(!showSmartReplies)}
                      size="icon"
                      variant="ghost"
                      disabled={disabled}
                      className="h-9 w-9 shrink-0 transition-all duration-200"
                    >
                      {showSmartReplies ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {showSmartReplies ? 'Ocultar sugestões IA' : 'Mostrar sugestões IA'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <Button
                type="button"
                onClick={handleSend}
                size="icon"
                disabled={disabled || !message.trim()}
                className="h-9 w-9 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground mt-1">
          Enter para enviar, Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
};
