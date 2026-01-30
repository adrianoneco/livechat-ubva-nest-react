import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { invokeFunction } from '@/lib/api';
import { toast } from 'sonner';
import { Tables } from '@/integrations/api/types';

type Message = Tables<'whatsapp_messages'>;

interface SendMessageParams {
  conversationId: string;
  content?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
  quotedMessageId?: string;
  // Supervisor message support
  isSupervisorMessage?: boolean;
  supervisorId?: string;
}

export const useWhatsAppSend = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: SendMessageParams) => {
      // 1. Check if conversation is closed
      const { data: conv } = await supabase
        .from('whatsapp_conversations')
        .select(`
          status, 
          sector_id, 
          contact_id,
          sectors(name, mensagem_boas_vindas, mensagem_reabertura, gera_ticket),
          whatsapp_contacts(name, phone_number)
        `)
        .eq('id', params.conversationId)
        .single();

      if (conv?.status === 'closed') {
        console.log('[useWhatsAppSend] Conversation is closed, reopening before sending message...');
        
        // Reopen conversation status
        await supabase
          .from('whatsapp_conversations')
          .update({ status: 'active' })
          .eq('id', params.conversationId);

        // Fetch last ticket
        const { data: lastTicket } = await supabase
          .from('tickets')
          .select('id, status, numero')
          .eq('conversation_id', params.conversationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const shouldCreateNewTicket = (conv as any)?.sectors?.gera_ticket && (!lastTicket || lastTicket.status === 'finalizado');

        let activeTicketNumber = lastTicket?.numero || 0;
        let markerType: 'ticket_opened' | 'conversation_reopened' = 'conversation_reopened';

        // Fetch current user (agent) name for template context
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

        // Build template context for automatic messages
        const contact = (conv as any)?.whatsapp_contacts;
        const sector = (conv as any)?.sectors;
        const templateContext: any = {
          clienteNome: contact?.name || contact?.phone_number || 'Cliente',
          clienteTelefone: contact?.phone_number || '',
          atendenteNome,
          setorNome: sector?.name || '',
          ticketNumero: activeTicketNumber,
        };

        if (shouldCreateNewTicket) {
          console.log('[useWhatsAppSend] Creating new ticket as per sector config...');
          const { data: newTicket } = await supabase
            .from('tickets')
            .insert({
              conversation_id: params.conversationId,
              sector_id: conv.sector_id,
              status: 'aberto',
            })
            .select()
            .single();
          
          if (newTicket) {
            activeTicketNumber = newTicket.numero;
            templateContext.ticketNumero = newTicket.numero;
            markerType = 'ticket_opened';
            
            // Send welcome message if configured
            const welcomeMsg = (conv as any)?.sectors?.mensagem_boas_vindas;
            if (welcomeMsg) {
              const { data: sendData, error: sendErr } = await invokeFunction('send-whatsapp-message', {
                conversationId: params.conversationId,
                content: welcomeMsg,
                messageType: 'text',
                skipAgentPrefix: true,
                templateContext,
              });
              if (sendErr) {
                console.error('[useWhatsAppSend] Error sending welcome message (invokeFunction):', sendErr);
                toast.error('Falha ao enviar mensagem automática de boas-vindas');
              } else {
                console.log('[useWhatsAppSend] Welcome message send result:', sendData);
              }
            }
          }
        } else if (lastTicket && lastTicket.status === 'finalizado') {
          console.log('[useWhatsAppSend] Reopening last ticket...');
          await supabase
            .from('tickets')
            .update({ 
              status: 'reaberto',
              closed_at: null,
              closed_by: null,
            })
            .eq('id', lastTicket.id);
          
          templateContext.ticketNumero = lastTicket.numero;
            
          // Send reopen message if configured
          const reopenMsg = (conv as any)?.sectors?.mensagem_reabertura || (conv as any)?.sectors?.mensagem_boas_vindas;
          if (reopenMsg) {
            const { data: sendData, error: sendErr } = await invokeFunction('send-whatsapp-message', {
              conversationId: params.conversationId,
              content: reopenMsg,
              messageType: 'text',
              skipAgentPrefix: true,
              templateContext,
            });
            if (sendErr) {
              console.error('[useWhatsAppSend] Error sending reopen message (invokeFunction):', sendErr);
              toast.error('Falha ao enviar mensagem automática de reabertura');
            } else {
              console.log('[useWhatsAppSend] Reopen message send result:', sendData);
            }
          }
        }

        // Insert event marker using server timestamp
        try {
          const response = await fetch('/api/tickets/event-marker', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({
              conversationId: params.conversationId,
              ticketNumber: activeTicketNumber,
              eventType: markerType,
            }),
          });
          if (!response.ok) {
            console.error(`Error inserting ${markerType} marker:`, await response.text());
          }
        } catch (err) {
          console.error(`Error inserting ${markerType} marker:`, err);
        }
      }

      // 2. Auto-assign agent if conversation has no agent and no assignment rules exist
      // Fetch full conversation data including instance_id and assigned_to
      const { data: fullConv } = await supabase
        .from('whatsapp_conversations')
        .select('assigned_to, instance_id, sector_id')
        .eq('id', params.conversationId)
        .single();

      if (fullConv && !fullConv.assigned_to) {
        // Check if there are any active assignment rules for this instance/sector
        let rulesQuery = supabase
          .from('assignment_rules')
          .select('id')
          .eq('is_active', true)
          .eq('instance_id', fullConv.instance_id);
        
        // If conversation has a sector, also check for sector-specific rules
        if (fullConv.sector_id) {
          rulesQuery = rulesQuery.or(`sector_id.eq.${fullConv.sector_id},sector_id.is.null`);
        }
        
        const { data: activeRules } = await rulesQuery.limit(1);
        
        // If no active rules exist, auto-assign current user
        if (!activeRules || activeRules.length === 0) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            console.log('[useWhatsAppSend] No assignment rules found, auto-assigning to current agent:', user.id);
            await supabase
              .from('whatsapp_conversations')
              .update({ assigned_to: user.id })
              .eq('id', params.conversationId);
          }
        }
      }

      // 3. Send the actual message
      const { data, error } = await invokeFunction('send-whatsapp-message', params);

      if (error) throw error;
      return data;
    },
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'messages', newMessage.conversationId] });
      
      const previousMessages = queryClient.getQueryData(['whatsapp', 'messages', newMessage.conversationId]);
      
      const optimisticMessage: Partial<Message> = {
        id: 'temp-' + Date.now(),
        conversation_id: newMessage.conversationId,
        content: newMessage.content || '',
        message_type: newMessage.messageType,
        media_url: newMessage.mediaUrl,
        media_mimetype: newMessage.mediaMimetype,
        status: 'sending',
        is_from_me: true,
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        message_id: '',
        remote_jid: '',
        quoted_message_id: newMessage.quotedMessageId || null,
        metadata: {},
      };

      queryClient.setQueryData(['whatsapp', 'messages', newMessage.conversationId], (old: Message[] = []) => [
        ...old,
        optimisticMessage as Message,
      ]);

      return { previousMessages };
    },
    onError: (err, newMessage, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['whatsapp', 'messages', newMessage.conversationId], context.previousMessages);
      }
      try {
        toast.error('Falha ao enviar mensagem. Tente novamente.');
      } catch (e) {}
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['ticket', variables.conversationId] });
    },
  });

  return mutation;
};
