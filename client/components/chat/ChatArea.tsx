import { useState, useMemo } from "react";
import { useWhatsAppMessages, useWhatsAppSend, useWhatsAppSentiment } from "@/hooks/whatsapp";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/client";
import { ChatHeader } from "./ChatHeader";
import { MessagesContainer } from "./MessagesContainer";
import { MessageInputContainer, MediaSendParams } from "./input";
import { MessageCircle } from "lucide-react";
import { Tables } from "@/integrations/api/types";
import { useConversationLead } from "@/hooks/sales/useConversationLead";
import { useAIAgentConfig } from "@/hooks/ai-agent/useAIAgentConfig";

type Message = Tables<'whatsapp_messages'>;

interface ChatAreaProps {
  conversationId: string | null;
  rightSidebarPercent?: number; // percentage width of right sidebar (0-100)
}

export const ChatArea = ({ conversationId, rightSidebarPercent = 0 }: ChatAreaProps) => {
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { messages, isLoading: messagesLoading } = useWhatsAppMessages(conversationId);
  const { sentiment, isAnalyzing, analyze } = useWhatsAppSentiment(conversationId);
  const sendMutation = useWhatsAppSend();
  const queryClient = useQueryClient();
  const { lead } = useConversationLead(conversationId);
  
  // Calcular última mensagem do cliente e última resposta humana para o countdown
  const { lastCustomerMessageTime, lastHumanResponseTime } = useMemo(() => {
    if (!messages || messages.length === 0) {
      return { lastCustomerMessageTime: null, lastHumanResponseTime: null };
    }
    
    // Última mensagem do cliente (não é from_me)
    const lastCustomerMsg = [...messages].reverse().find(m => !m.is_from_me);
    
    // Última mensagem do agente humano (is_from_me e não é da IA)
    const lastHumanMsg = [...messages].reverse().find(m => 
      m.is_from_me && 
      (!m.metadata || (m.metadata as any)?.sender !== 'ai')
    );
    
    return {
      lastCustomerMessageTime: lastCustomerMsg?.created_at || null,
      lastHumanResponseTime: lastHumanMsg?.created_at || null,
    };
  }, [messages]);

  // Fetch conversation details including contact
  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select(`
          *,
          contact:whatsapp_contacts(*)
        `)
        .eq('id', conversationId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
    // Clear previous data when conversationId changes to avoid showing stale contact
    placeholderData: undefined,
    staleTime: 0,
  });

  const { config: aiConfig } = useAIAgentConfig(conversation?.sector_id);

  console.log('[ChatArea Debug] AI Config:', { 
    sectorId: conversation?.sector_id, 
    aiConfig, 
    hybridTimeout: aiConfig?.hybrid_timeout_minutes 
  });

  const handleRefresh = () => {
    if (!conversationId) return;
    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
  };

  const handleSendText = (content: string, quotedMessageId?: string) => {
    if (!conversationId || !content.trim()) return;

    sendMutation.mutate({
      conversationId,
      content,
      messageType: 'text',
      quotedMessageId,
    });
    setReplyingTo(null);
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSendMedia = (params: MediaSendParams) => {
    if (!conversationId) return;

    sendMutation.mutate({
      conversationId,
      ...params,
    });
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20 h-full">
        <div className="flex flex-col items-center text-center space-y-3">
          <MessageCircle className="w-24 h-24 mx-auto text-muted-foreground/40" />
          <h3 className="text-lg font-semibold text-foreground">
            Selecione uma conversa
          </h3>
          <p className="text-sm text-muted-foreground">
            Escolha uma conversa na lista para começar
          </p>
        </div>
      </div>
    );
  }

  const finalHybridTimeout = (aiConfig as any)?.hybrid_timeout_minutes || 5;
  console.log('[ChatArea Debug] Passing hybridTimeoutMinutes to MessageInputContainer:', finalHybridTimeout);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
      <ChatHeader
        key={conversationId}
        contact={conversation?.contact}
        sentiment={sentiment}
        isAnalyzing={isAnalyzing}
        onAnalyze={analyze}
        conversationId={conversationId}
        conversation={conversation}
        onRefresh={handleRefresh}
      />

      <MessagesContainer
        messages={messages}
        isLoading={messagesLoading}
        conversationId={conversationId}
        onReplyMessage={handleReply}
        isGroupChat={conversation?.contact?.is_group || false}
        rightSidebarPercent={rightSidebarPercent}
      />

      <MessageInputContainer
        conversationId={conversationId}
        replyingTo={replyingTo}
        leadId={lead?.id}
        sectorId={conversation?.sector_id ?? undefined}
        conversationMode={conversation?.conversation_mode || 'ai'}
        assignedTo={conversation?.assigned_to}
        lastCustomerMessageTime={lastCustomerMessageTime}
        lastHumanResponseTime={lastHumanResponseTime}
        hybridTimeoutMinutes={finalHybridTimeout}
        onSendText={handleSendText}
        onSendMedia={handleSendMedia}
        onCancelReply={handleCancelReply}
      />
    </div>
  );
};
