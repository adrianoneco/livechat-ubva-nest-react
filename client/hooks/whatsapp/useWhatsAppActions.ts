import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { invokeFunction } from '@/lib/api';
import { webhookEvents } from '@/utils/webhookDispatcher';
import { toast } from 'sonner';

export const useWhatsAppActions = () => {
  const queryClient = useQueryClient();

  // Archive conversation
  const archiveMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'archived' })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'conversations'] });
      const previousConversations = queryClient.getQueryData(['whatsapp', 'conversations']);
      
      queryClient.setQueryData(['whatsapp', 'conversations'], (old: any) => {
        if (!old) return old;
        return old.map((conv: any) => 
          conv.id === conversationId ? { ...conv, status: 'archived' } : conv
        );
      });
      
      return { previousConversations };
    },
    onSuccess: (_, conversationId) => {
      toast.success('Conversa arquivada com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
    onError: (error, _, context: any) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['whatsapp', 'conversations'], context.previousConversations);
      }
      console.error('Erro ao arquivar conversa:', error);
      toast.error('Erro ao arquivar conversa');
    },
  });

  // Close conversation
  const closeMutation = useMutation({
    mutationFn: async ({ conversationId, generateSummary }: { 
      conversationId: string; 
      generateSummary: boolean;
    }) => {
      if (generateSummary) {
        try {
          await invokeFunction('generate-conversation-summary', { conversationId });
        } catch (e) {
          console.error('Erro ao gerar resumo:', e);
        }
      }

      // Fetch conversation and sector info to get closing message
      const { data: convData } = await supabase
        .from('whatsapp_conversations')
        .select(`
          sector_id, 
          sectors(name, mensagem_encerramento),
          whatsapp_contacts(name, phone_number)
        `)
        .eq('id', conversationId)
        .single();

      // Fetch last ticket before closing
      const { data: lastTicket } = await supabase
        .from('tickets')
        .select('id, numero, status')
        .eq('conversation_id', conversationId)
        .neq('status', 'finalizado')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Build template context for closing message
      const contact = (convData as any)?.whatsapp_contacts;
      const sector = (convData as any)?.sectors;

      // Fetch current user (agent) name
      let atendenteNome = 'Atendente';
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        atendenteNome = profile?.full_name || 'Atendente';
      }

      const templateContext = {
        clienteNome: contact?.name || contact?.phone_number || 'Cliente',
        clienteTelefone: contact?.phone_number || '',
        atendenteNome,
        setorNome: sector?.name || '',
        ticketNumero: lastTicket?.numero || 0,
      };

      // Send closing message if configured
      const closingMsg = (convData as any)?.sectors?.mensagem_encerramento;
      if (closingMsg) {
        try {
          await invokeFunction('send-whatsapp-message', {
            conversationId: conversationId,
            content: closingMsg,
            messageType: 'text',
            skipAgentPrefix: true,
            templateContext,
          });
          console.log('[useWhatsAppActions] Closing message sent');
        } catch (sendError) {
          console.error('[useWhatsAppActions] Error sending closing message:', sendError);
          toast.error('Falha ao enviar mensagem de encerramento');
        }
      }

      // Close the ticket if there's an open one
      if (lastTicket && lastTicket.status !== 'finalizado') {
        await supabase
          .from('tickets')
          .update({
            status: 'finalizado',
            closed_at: new Date().toISOString(),
            closed_by: user?.id,
          })
          .eq('id', lastTicket.id);
        console.log('[useWhatsAppActions] Ticket closed:', lastTicket.id);
      }

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'closed' })
        .eq('id', conversationId);
      if (error) throw error;

      // Insert ticket_closed marker using server timestamp
      const ticketNumber = lastTicket?.numero || 0;
      try {
        const response = await fetch('/api/tickets/event-marker', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            conversationId,
            ticketNumber,
            eventType: 'ticket_closed',
          }),
        });
        if (!response.ok) {
          console.error('Error inserting ticket_closed marker:', await response.text());
        }
      } catch (err) {
        console.error('Error inserting ticket_closed marker:', err);
      }

      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || '';
        // Fire-and-forget webhook dispatch
        webhookEvents.conversationClosed(conversationId, userId);
      } catch (err) {
        console.error('Error dispatching conversation_closed webhook:', err);
      }
    },
    onSuccess: (_, variables) => {
      toast.success('Conversa encerrada com sucesso');
      // Force immediate refetch of ticket data
      queryClient.invalidateQueries({ queryKey: ['ticket', variables.conversationId] });
      queryClient.refetchQueries({ queryKey: ['ticket', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', variables.conversationId] });
    },
    onError: (error) => {
      console.error('Erro ao encerrar conversa:', error);
      toast.error('Erro ao encerrar conversa');
    },
  });

  // Reopen conversation
  const reopenMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      // Fetch conversation and sector info to get configured messages
      const { data: convData } = await supabase
        .from('whatsapp_conversations')
        .select('sector_id, sectors(mensagem_boas_vindas, mensagem_reabertura), whatsapp_contacts(name, phone_number)')
        .eq('id', conversationId)
        .single();

      // Fetch last ticket number before reopening
      const { data: lastTicket } = await supabase
        .from('tickets')
        .select('id, numero, status')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Reopen the ticket with status 'reaberto' if it was finalized
      if (lastTicket && lastTicket.status === 'finalizado') {
        await supabase
          .from('tickets')
          .update({ 
            status: 'reaberto',
            closed_at: null,
            closed_by: null,
          })
          .eq('id', lastTicket.id);
        console.log('[useWhatsAppActions] Ticket reopened:', lastTicket.id);
      }

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'active' })
        .eq('id', conversationId);
      if (error) throw error;

      // Send reopen message or welcome message on reopen if configured
      const sector = (convData as any)?.sectors;
      const contact = (convData as any)?.whatsapp_contacts;
      const reopenMsg = sector?.mensagem_reabertura || sector?.mensagem_boas_vindas;
      
      if (reopenMsg) {
        try {
          // Fetch current user (agent) name for reopen
          let atendenteNome = 'Atendente';
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', user.id)
              .maybeSingle();
            atendenteNome = profile?.full_name || 'Atendente';
          }

          const templateContext = {
            clienteNome: contact?.name || contact?.phone_number || 'Cliente',
            clienteTelefone: contact?.phone_number || '',
            atendenteNome,
            setorNome: sector?.name || '',
            ticketNumero: lastTicket?.numero || 0,
          } as any;

          await invokeFunction('send-whatsapp-message', {
            conversationId,
            content: reopenMsg,
            messageType: 'text',
            skipAgentPrefix: true,
            templateContext,
          });
          console.log('[useWhatsAppActions] Reopen message sent');
        } catch (sendError) {
          console.error('[useWhatsAppActions] Error sending reopen message:', sendError);
          toast.error('Falha ao enviar mensagem de reabertura');
        }
      }

      // Insert conversation_reopened marker using server timestamp
      const ticketNumber = lastTicket?.numero || 0;
      try {
        const response = await fetch('/api/tickets/event-marker', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            conversationId,
            ticketNumber,
            eventType: 'conversation_reopened',
          }),
        });
        if (!response.ok) {
          console.error('Error inserting conversation_reopened marker:', await response.text());
        }
      } catch (err) {
        console.error('Error inserting conversation_reopened marker:', err);
      }

      try {
        // Fetch conversation details to include in webhook payload
        const { data: conv } = await supabase
          .from('whatsapp_conversations')
          .select('id, contact_id, instance_id')
          .eq('id', conversationId)
          .maybeSingle();

        if (conv) {
          // Get contact name
          const { data: contact } = await supabase
            .from('whatsapp_contacts')
            .select('id, name')
            .is('deleted_at', null)
            .eq('id', conv.contact_id)
            .maybeSingle();

          const previousTicketNumber = lastTicket?.numero || null;

          // Dispatch webhook (fire-and-forget)
          webhookEvents.conversationReopened(
            conversationId,
            contact?.name || '',
            conv.instance_id,
            previousTicketNumber || undefined
          );
        }
      } catch (err) {
        console.error('Error dispatching conversation_reopened webhook:', err);
      }
    },
    onSuccess: (_, conversationId) => {
      toast.success('Conversa reaberta com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['ticket', conversationId] });
    },
    onError: (error) => {
      console.error('Erro ao reabrir conversa:', error);
      toast.error('Erro ao reabrir conversa');
    },
  });

  // Mark as unread
  const markAsUnreadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 1 })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'conversations'] });
      const previousConversations = queryClient.getQueryData(['whatsapp', 'conversations']);
      
      queryClient.setQueryData(['whatsapp', 'conversations'], (old: any) => {
        if (!old) return old;
        return old.map((conv: any) => 
          conv.id === conversationId ? { ...conv, unread_count: 1 } : conv
        );
      });
      
      return { previousConversations };
    },
    onSuccess: () => {
      toast.success('Conversa marcada como não lida');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error, _, context: any) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['whatsapp', 'conversations'], context.previousConversations);
      }
      toast.error('Erro ao marcar conversa como não lida');
    },
  });

  // Update contact
  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, data }: {
      contactId: string;
      data: { name: string; notes: string | null };
    }) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({
          name: data.name,
          notes: data.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contato atualizado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error) => {
      console.error('Erro ao atualizar contato:', error);
      toast.error('Erro ao atualizar contato');
    },
  });

  // Soft-delete contact
  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: (_, contactId) => {
      toast.success('Contato removido (soft-delete)');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact-details', contactId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error) => {
      console.error('Erro ao remover contato:', error);
      toast.error('Erro ao remover contato');
    },
  });

  return {
    archiveConversation: archiveMutation.mutate,
    isArchiving: archiveMutation.isPending,

    closeConversation: closeMutation.mutate,
    isClosing: closeMutation.isPending,

    reopenConversation: reopenMutation.mutate,
    isReopening: reopenMutation.isPending,

    markAsUnread: markAsUnreadMutation.mutate,
    isMarkingUnread: markAsUnreadMutation.isPending,

    updateContact: updateContactMutation.mutate,
    isUpdatingContact: updateContactMutation.isPending,
    deleteContact: deleteContactMutation.mutate,
    isDeletingContact: deleteContactMutation.isPending,
  };
};
