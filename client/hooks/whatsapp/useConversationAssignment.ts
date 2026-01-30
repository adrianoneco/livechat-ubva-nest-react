import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';

interface AssignmentHistory {
  id: string;
  conversation_id: string;
  assigned_from: string | null;
  assigned_to: string;
  assigned_by: string | null;
  reason: string | null;
  created_at: string;
}

// Helper para buscar nome do perfil
const getProfileName = async (userId: string | null): Promise<string> => {
  if (!userId) return 'Fila';
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();
  return data?.full_name || 'Desconhecido';
};

// Helper para criar mensagem de sistema
const createSystemMessage = async (
  conversationId: string,
  content: string
) => {
  // Get conversation to get remote_jid
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('contact_id, whatsapp_contacts(phone_number)')
    .eq('id', conversationId)
    .single();

  const remoteJid = (conversation?.whatsapp_contacts as any)?.phone_number || 'system';

  await supabase.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    content,
    message_type: 'text',
    is_from_me: true,
    is_internal: true,
    message_id: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    remote_jid: remoteJid,
    timestamp: new Date().toISOString(),
    status: 'sent',
  });
};

// Helper para criar marker de transferência (badge visível)
const createTransferMarker = async (
  conversationId: string,
  fromAgent: string,
  toAgent: string,
  reason?: string
) => {
  // Get conversation to get remote_jid
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('contact_id, whatsapp_contacts(phone_number)')
    .eq('id', conversationId)
    .single();

  const remoteJid = (conversation?.whatsapp_contacts as any)?.phone_number || 'system';
  
  // Format: TRANSFER:fromAgent|toAgent|reason
  const content = reason 
    ? `TRANSFER:${fromAgent}|${toAgent}|${reason}`
    : `TRANSFER:${fromAgent}|${toAgent}`;

  await supabase.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    content,
    message_type: 'conversation_transferred',
    is_from_me: true,
    message_id: `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    remote_jid: remoteJid,
    timestamp: new Date().toISOString(),
    status: 'sent',
  });
};

export const useConversationAssignment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const assignConversation = useMutation({
    mutationFn: async ({ 
      conversationId, 
      assignedTo, 
      reason 
    }: { 
      conversationId: string; 
      assignedTo: string; 
      reason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Get current assigned_to
      const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('assigned_to')
        .eq('id', conversationId)
        .single();

      const previousAssignee = conversation?.assigned_to;

      // Update conversation
      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update({ assigned_to: assignedTo })
        .eq('id', conversationId);

      if (updateError) throw updateError;

      // Log assignment history
      const { error: historyError } = await supabase
        .from('conversation_assignments')
        .insert({
          conversation_id: conversationId,
          assigned_from: previousAssignee || null,
          assigned_to: assignedTo,
          assigned_by: user.id,
          reason: reason || null,
        });

      if (historyError) throw historyError;

      // Create system message
      const fromName = await getProfileName(previousAssignee);
      const toName = await getProfileName(assignedTo);
      await createSystemMessage(
        conversationId,
        `📋 Conversa atribuída de ${fromName} para ${toName}`
      );

      return { conversationId, assignedTo };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages'] });
      toast({
        title: "Conversa atribuída",
        description: "A conversa foi atribuída com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error assigning conversation:', error);
      toast({
        title: "Erro ao atribuir",
        description: "Não foi possível atribuir a conversa.",
        variant: "destructive",
      });
    },
  });

  const transferConversation = useMutation({
    mutationFn: async ({ 
      conversationId, 
      newAssignee, 
      reason 
    }: { 
      conversationId: string; 
      newAssignee: string; 
      reason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Get current assigned_to
      const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('assigned_to')
        .eq('id', conversationId)
        .single();

      const previousAssignee = conversation?.assigned_to;

      // Update conversation
      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update({ assigned_to: newAssignee })
        .eq('id', conversationId);

      if (updateError) throw updateError;

      // Log transfer history
      const { error: historyError } = await supabase
        .from('conversation_assignments')
        .insert({
          conversation_id: conversationId,
          assigned_from: previousAssignee || null,
          assigned_to: newAssignee,
          assigned_by: user.id,
          reason: reason || null,
        });

      if (historyError) throw historyError;

      // Create transfer marker (visible badge)
      const fromName = await getProfileName(previousAssignee);
      const toName = await getProfileName(newAssignee);
      await createTransferMarker(
        conversationId,
        fromName,
        toName,
        reason
      );

      return { conversationId, newAssignee };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages'] });
      toast({
        title: "Conversa transferida",
        description: "A conversa foi transferida com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error transferring conversation:', error);
      toast({
        title: "Erro ao transferir",
        description: "Não foi possível transferir a conversa.",
        variant: "destructive",
      });
    },
  });

  const unassignConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Get current assigned_to
      const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('assigned_to')
        .eq('id', conversationId)
        .single();

      // Remove assignment
      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update({ assigned_to: null })
        .eq('id', conversationId);

      if (updateError) throw updateError;

      // Log history (returning to queue)
      if (conversation?.assigned_to) {
        const { error: historyError } = await supabase
          .from('conversation_assignments')
          .insert({
            conversation_id: conversationId,
            assigned_from: conversation.assigned_to,
            assigned_to: user.id,
            assigned_by: user.id,
            reason: 'Devolvido para a fila',
          });

        if (historyError) throw historyError;
      }

      return conversationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      toast({
        title: "Conversa devolvida",
        description: "A conversa foi devolvida para a fila.",
      });
    },
    onError: (error) => {
      console.error('Error unassigning conversation:', error);
      toast({
        title: "Erro ao devolver",
        description: "Não foi possível devolver a conversa.",
        variant: "destructive",
      });
    },
  });

  const getAssignmentHistory = (conversationId: string) => {
    return useQuery({
      queryKey: ['conversation-assignments', conversationId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('conversation_assignments')
          .select(`
            *,
            assigned_from_profile:profiles!conversation_assignments_assigned_from_fkey(full_name, avatar_url),
            assigned_to_profile:profiles!conversation_assignments_assigned_to_fkey(full_name, avatar_url),
            assigned_by_profile:profiles!conversation_assignments_assigned_by_fkey(full_name, avatar_url)
          `)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data as AssignmentHistory[];
      },
      enabled: !!conversationId,
    });
  };

  return {
    assignConversation: assignConversation.mutate,
    transferConversation: transferConversation.mutate,
    unassignConversation: unassignConversation.mutate,
    getAssignmentHistory,
    isAssigning: assignConversation.isPending,
    isTransferring: transferConversation.isPending,
  };
};
