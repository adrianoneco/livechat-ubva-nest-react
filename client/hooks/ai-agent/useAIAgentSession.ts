import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface AIAgentSession {
  id: string;
  conversation_id: string;
  mode: 'ai' | 'human' | 'hybrid';
  auto_reply_count: number;
  last_ai_response_at: string | null;
  conversation_summary: string | null;
  detected_intent: string | null;
  lead_score: number | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  escalated_to: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationMode = 'ai' | 'human' | 'hybrid';

export const useAIAgentSession = (conversationId?: string | null) => {
  const queryClient = useQueryClient();

  const { data: session, isLoading, error } = useQuery({
    queryKey: ['ai-agent-session', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('ai_agent_sessions')
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (error) throw error;
      return data as AIAgentSession | null;
    },
    enabled: !!conversationId,
  });

  // Subscrição realtime para atualizações de sessão
  useEffect(() => {
    if (!conversationId) return;

    let sessionInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel(`ai-session-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_agent_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Debounce invalidation to prevent excessive re-renders
          clearTimeout(sessionInvalidateTimeout);
          sessionInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['ai-agent-session', conversationId] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(sessionInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const changeMode = useMutation({
    mutationFn: async ({ mode, userId }: { mode: ConversationMode; userId?: string }) => {
      if (!conversationId) throw new Error('No conversation ID');

      // Atualizar sessão
      const sessionUpdate: Record<string, any> = { mode };
      if (mode === 'human') {
        sessionUpdate.escalated_at = new Date().toISOString();
        sessionUpdate.escalation_reason = 'manual_takeover';
        if (userId) sessionUpdate.escalated_to = userId;
      } else if (mode === 'ai') {
        sessionUpdate.auto_reply_count = 0;
        sessionUpdate.escalated_at = null;
        sessionUpdate.escalation_reason = null;
        sessionUpdate.escalated_to = null;
      }

      // Verificar se sessão existe
      const { data: existingSession } = await supabase
        .from('ai_agent_sessions')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (existingSession) {
        await supabase
          .from('ai_agent_sessions')
          .update(sessionUpdate)
          .eq('conversation_id', conversationId);
      } else {
        await supabase
          .from('ai_agent_sessions')
          .insert({
            conversation_id: conversationId,
            ...sessionUpdate,
          });
      }

      // Atualizar conversa
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ conversation_mode: mode })
        .eq('id', conversationId);

      if (error) throw error;

      return mode;
    },
    onSuccess: (mode) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-session', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      
      const modeLabels: Record<ConversationMode, string> = {
        ai: 'Modo AI ativado',
        human: 'Modo humano ativado',
        hybrid: 'Modo híbrido ativado',
      };
      toast.success(modeLabels[mode]);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao alterar modo');
    },
  });

  const assumeConversation = useMutation({
    mutationFn: async (userId: string) => {
      if (!conversationId) throw new Error('No conversation ID');
      
      // Buscar nome do usuário
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();
      
      const userName = profile?.full_name || 'Agente';
      
      // 1. Atribuir conversa ao agente
      const { error: assignError } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          assigned_to: userId,
          conversation_mode: 'human'
        })
        .eq('id', conversationId);
      
      if (assignError) throw assignError;
      
      // 2. Atualizar sessão AI
      const sessionUpdate = {
        mode: 'human' as const,
        escalated_at: new Date().toISOString(),
        escalation_reason: 'manual_takeover',
        escalated_to: userId,
      };

      const { data: existingSession } = await supabase
        .from('ai_agent_sessions')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (existingSession) {
        await supabase
          .from('ai_agent_sessions')
          .update(sessionUpdate)
          .eq('conversation_id', conversationId);
      } else {
        await supabase
          .from('ai_agent_sessions')
          .insert({
            conversation_id: conversationId,
            ...sessionUpdate,
          });
      }

      // 3. Criar mensagem de sistema
      const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('contact_id, whatsapp_contacts(phone_number)')
        .eq('id', conversationId)
        .single();

      const remoteJid = (conversation?.whatsapp_contacts as any)?.phone_number || 'system';

      await supabase.from('whatsapp_messages').insert({
        conversation_id: conversationId,
        content: `👤 ${userName} assumiu a conversa`,
        message_type: 'text',
        is_from_me: true,
        is_internal: true,
        message_id: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        remote_jid: remoteJid,
        timestamp: new Date().toISOString(),
        status: 'sent',
      });

      return 'human';
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-session', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      toast.success('Conversa assumida com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao assumir conversa');
    },
  });

  const returnToAI = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error('No conversation ID');

      // 1. Atualizar sessão AI
      const sessionUpdate = {
        mode: 'ai' as const,
        auto_reply_count: 0,
        escalated_at: null,
        escalation_reason: null,
        escalated_to: null,
      };

      const { data: existingSession } = await supabase
        .from('ai_agent_sessions')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (existingSession) {
        await supabase
          .from('ai_agent_sessions')
          .update(sessionUpdate)
          .eq('conversation_id', conversationId);
      } else {
        await supabase
          .from('ai_agent_sessions')
          .insert({
            conversation_id: conversationId,
            ...sessionUpdate,
          });
      }

      // 2. Desatribuir conversa e atualizar modo
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          conversation_mode: 'ai',
          assigned_to: null 
        })
        .eq('id', conversationId);

      if (error) throw error;

      // 3. Criar mensagem de sistema
      const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('contact_id, whatsapp_contacts(phone_number)')
        .eq('id', conversationId)
        .single();

      const remoteJid = (conversation?.whatsapp_contacts as any)?.phone_number || 'system';

      await supabase.from('whatsapp_messages').insert({
        conversation_id: conversationId,
        content: '🤖 Conversa devolvida para a I.A.',
        message_type: 'text',
        is_from_me: true,
        is_internal: true,
        message_id: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        remote_jid: remoteJid,
        timestamp: new Date().toISOString(),
        status: 'sent',
      });

      return 'ai';
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-session', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      toast.success('Conversa devolvida para a I.A.');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao devolver conversa');
    },
  });

  const setHybridMode = useMutation({
    mutationFn: async (userId: string) => {
      return changeMode.mutateAsync({ mode: 'hybrid', userId });
    },
  });

  return {
    session,
    isLoading,
    error,
    changeMode,
    assumeConversation,
    returnToAI,
    setHybridMode,
    currentMode: session?.mode || 'human',
  };
};
