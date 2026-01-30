import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/api/client';
import { invokeFunction } from '@/lib/api';
import { toast } from 'sonner';

export interface Ticket {
  id: string;
  conversation_id: string;
  sector_id: string;
  status: 'aberto' | 'em_atendimento' | 'finalizado' | 'reaberto';
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
  // SLA fields
  canal: string | null;
  categoria: string | null;
  prioridade: 'alta' | 'media' | 'baixa';
  atendente_id: string | null;
  updated_at: string;
  first_response_at: string | null;
  sla_violated_at: string | null;
}

export interface Feedback {
  id: string;
  ticket_id: string;
  nota: number;
  comentario: string | null;
  created_at: string;
}

// Helper function to insert ticket event marker in conversation (uses server timestamp)
const insertTicketEventMarker = async (
  conversationId: string,
  ticketNumber: number,
  eventType: 'ticket_opened' | 'ticket_closed' | 'conversation_reopened'
) => {
  try {
    // Call server endpoint to insert marker with server timestamp
    const response = await fetch('/api/tickets/event-marker', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: JSON.stringify({
        conversationId,
        ticketNumber,
        eventType,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Error inserting ${eventType} marker:`, error);
      return error;
    }

    return null;
  } catch (error) {
    console.error(`Error inserting ${eventType} marker:`, error);
    return error;
  }
};

export const useTickets = (conversationId?: string) => {
  const queryClient = useQueryClient();

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      console.log('[useTickets] Fetching ticket for conversation:', conversationId);

      // First try to find an ACTIVE ticket (not finalizado)
      const { data: activeTicket, error: activeError } = await supabase
        .from('tickets')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', ['aberto', 'em_atendimento', 'reaberto'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeError) throw activeError;
      
      // If there's an active ticket, return it
      if (activeTicket) {
        console.log('[useTickets] Found active ticket:', activeTicket.id, 'status:', activeTicket.status);
        return activeTicket as Ticket;
      }
      
      // Otherwise, return the most recent ticket (even if finalizado)
      const { data: latestTicket, error: latestError } = await supabase
        .from('tickets')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;
      console.log('[useTickets] Found latest ticket:', latestTicket?.id, 'status:', latestTicket?.status);
      return latestTicket as Ticket | null;
    },
    enabled: !!conversationId,
    staleTime: 0,
    gcTime: 0, // Don't cache at all
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  // Realtime subscription for ticket updates
  useEffect(() => {
    if (!conversationId) return;

    let ticketInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel(`ticket-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Debounce invalidation to prevent excessive re-renders
          clearTimeout(ticketInvalidateTimeout);
          ticketInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['ticket', conversationId] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(ticketInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const createTicket = useMutation({
    mutationFn: async ({ conversationId, sectorId }: { conversationId: string; sectorId: string }) => {
      // Fetch sector details first to get the welcome message and sector name
      const { data: sectorData } = await supabase
        .from('sectors')
        .select('mensagem_boas_vindas, name')
        .eq('id', sectorId)
        .single();

      const { data, error } = await supabase
        .from('tickets')
        .insert({
          conversation_id: conversationId,
          sector_id: sectorId,
          status: 'aberto',
        })
        .select()
        .single();

      if (error) throw error;

      // Send welcome message if configured
      if (sectorData?.mensagem_boas_vindas) {
        try {
          // Fetch conversation to get contact_id
          const { data: conv } = await supabase
            .from('whatsapp_conversations')
            .select('contact_id, assigned_to')
            .eq('id', conversationId)
            .maybeSingle();

          // Fetch contact separately (apiClient doesn't support relations)
          let contact: { name?: string; phone_number?: string } | null = null;
          if (conv?.contact_id) {
            const { data: contactData } = await supabase
              .from('whatsapp_contacts')
              .select('name, phone_number')
              .eq('id', conv.contact_id)
              .maybeSingle();
            contact = contactData;
          }

          // Fetch agent name if assigned
          let atendenteNome = 'Atendente';
          if (conv?.assigned_to) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', conv.assigned_to)
              .maybeSingle();
            atendenteNome = profile?.full_name || 'Atendente';
          }

          const templateContext = {
            clienteNome: contact?.name || contact?.phone_number || 'Cliente',
            clienteTelefone: contact?.phone_number || '',
            atendenteNome,
            setorNome: sectorData?.name || '',
            ticketNumero: data.numero,
          } as any;

          const { data: sendData, error: sendErr } = await invokeFunction('send-whatsapp-message', {
            conversationId,
            content: sectorData.mensagem_boas_vindas,
            messageType: 'text',
            skipAgentPrefix: true,
            templateContext,
          });
          if (sendErr) {
            console.error('[useTickets] Error sending welcome message (invokeFunction):', sendErr);
            toast.error('Falha ao enviar mensagem de boas-vindas do ticket');
          } else {
            console.log('[useTickets] Welcome message sent for ticket:', data.id, sendData);
          }
        } catch (sendError) {
          console.error('[useTickets] Error sending welcome message:', sendError);
        }
      }

      // Insert ticket opened event marker
      if (data.id && data.numero) {
        await insertTicketEventMarker(
          conversationId,
          data.numero,
          'ticket_opened'
        );
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      toast.success('Ticket criado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar ticket');
    },
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: 'aberto' | 'em_atendimento' | 'finalizado' | 'reaberto' }) => {
      // Validate ticketId before making any requests
      if (!ticketId || ticketId === 'undefined' || ticketId === 'null') {
        console.warn('[useTickets] updateTicketStatus called with invalid ticketId:', ticketId);
        throw new Error('Invalid ticket ID');
      }

      console.log('[useTickets] updateTicketStatus called with:', { ticketId, status });

      // Fetch ticket data first
      const { data: ticketData, error: fetchError } = await supabase
        .from('tickets')
        .select('status, conversation_id, sector_id, numero')
        .eq('id', ticketId)
        .single();

      console.log('[useTickets] Fetched ticket data:', { ticketData, fetchError });

      // Fetch sector separately (apiClient doesn't support Supabase relations)
      let sector: { name?: string; mensagem_boas_vindas?: string; mensagem_reabertura?: string } | null = null;
      if (ticketData?.sector_id) {
        const { data: sectorData, error: sectorError } = await supabase
          .from('sectors')
          .select('name, mensagem_boas_vindas, mensagem_reabertura')
          .eq('id', ticketData.sector_id)
          .single();
        
        if (!sectorError) {
          sector = sectorData;
        } else {
          console.error('[useTickets] Error fetching sector:', sectorError);
        }
      }

      const updateData: any = { status };
      
      if (status === 'finalizado') {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.closed_at = new Date().toISOString();
        updateData.closed_by = user?.id;
      }

      const { data, error } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;

      // Send messages based on status transition
      console.log('[useTickets] Checking if should send message:', {
        hasTicketData: !!ticketData,
        conversationId: ticketData?.conversation_id,
        currentStatus: ticketData?.status,
        newStatus: status,
      });

      if (ticketData && ticketData.conversation_id) {
        let messageToSend: string | null = null;

        console.log('[useTickets] Sector data:', {
          sectorName: sector?.name,
          hasMensagemBoasVindas: !!sector?.mensagem_boas_vindas,
          hasMensagemReabertura: !!sector?.mensagem_reabertura,
          mensagemBoasVindas: sector?.mensagem_boas_vindas?.substring(0, 50),
          mensagemReabertura: sector?.mensagem_reabertura?.substring(0, 50),
        });

        if (status === 'em_atendimento' && ticketData.status === 'aberto') {
          // Starting attendance - send welcome message if configured
          messageToSend = sector?.mensagem_boas_vindas || null;
          console.log('[useTickets] Transitioning aberto -> em_atendimento, will send welcome message:', !!messageToSend);
        } else if (status === 'reaberto' && ticketData.status === 'finalizado') {
          // Reopening - send reopen message or welcome message
          messageToSend = sector?.mensagem_reabertura || sector?.mensagem_boas_vindas || null;
          console.log('[useTickets] Transitioning finalizado -> reaberto, will send reopen message:', !!messageToSend);
        } else {
          console.log('[useTickets] No message for this transition:', { from: ticketData.status, to: status });
        }

        if (messageToSend) {
          console.log('[useTickets] Message to send:', messageToSend.substring(0, 100));
          try {
            // Fetch conversation to get contact_id
            const { data: conv, error: convError } = await supabase
              .from('whatsapp_conversations')
              .select('contact_id, assigned_to')
              .eq('id', ticketData.conversation_id)
              .maybeSingle();

            console.log('[useTickets] Conversation fetch result:', { conv, convError });

            // Fetch contact separately (apiClient doesn't support relations)
            let contact: { name?: string; phone_number?: string } | null = null;
            if (conv?.contact_id) {
              const { data: contactData } = await supabase
                .from('whatsapp_contacts')
                .select('name, phone_number')
                .eq('id', conv.contact_id)
                .maybeSingle();
              contact = contactData;
            }

            // Fetch agent name
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
              ticketNumero: (ticketData as any).numero,
            } as any;

            console.log('[useTickets] Calling send-whatsapp-message with:', {
              conversationId: ticketData.conversation_id,
              content: messageToSend.substring(0, 50),
              messageType: 'text',
              skipAgentPrefix: true,
              templateContext,
            });

            const { data: sendData, error: sendErr } = await invokeFunction('send-whatsapp-message', {
              conversationId: ticketData.conversation_id,
              content: messageToSend,
              messageType: 'text',
              skipAgentPrefix: true,
              templateContext,
            });

            console.log('[useTickets] send-whatsapp-message response:', { sendData, sendErr });

            if (sendErr) {
              console.error('[useTickets] Error sending status transition message (invokeFunction):', sendErr);
              toast.error('Falha ao enviar mensagem automática de mudança de status do ticket');
            } else {
              console.log('[useTickets] Status transition message sent successfully', sendData);
            }
          } catch (sendError) {
            console.error('[useTickets] Error sending status transition message:', sendError);
          }
        }

        // Insert event marker for reopening
        if (status === 'reaberto' && ticketData.status === 'finalizado') {
          await insertTicketEventMarker(
            ticketData.conversation_id,
            ticketData.numero,
            'conversation_reopened'
          );
        }
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      if (variables.status === 'finalizado') {
        toast.success('Ticket finalizado');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar ticket');
    },
  });

  const closeTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      console.log('[useTickets] closeTicket STARTED with ticketId:', ticketId);
      
      // Validate ticketId before making any requests
      if (!ticketId || ticketId === 'undefined' || ticketId === 'null') {
        console.warn('[useTickets] closeTicket called with invalid ticketId:', ticketId);
        throw new Error('Invalid ticket ID');
      }

      const { data: { user } } = await supabase.auth.getUser();
      console.log('[useTickets] closeTicket - user:', user?.id);
      
      // Get ticket data for event marker (before closing)
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('id, conversation_id, sector_id, numero')
        .eq('id', ticketId)
        .single();
      
      if (ticketError) {
        console.error('Error fetching ticket:', ticketError);
        throw ticketError;
      }
      
      // Update ticket status to finalizado
      // The server will handle sending the closing message automatically
      const { data, error } = await supabase
        .from('tickets')
        .update({
          status: 'finalizado',
          closed_at: new Date().toISOString(),
          closed_by: user?.id,
        })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;

      console.log('[useTickets] closeTicket - ticket updated, server will handle message');
      
      // Insert ticket closed event marker
      if (ticketData?.conversation_id && ticketData?.numero) {
        await insertTicketEventMarker(
          ticketData.conversation_id,
          ticketData.numero,
          'ticket_closed'
        );
        
        // Dispatch webhook for ticket closed
        try {
          await invokeFunction('dispatch-webhook', {
            event: 'ticket_closed',
            data: {
              ticket_id: ticketId,
              ticket_number: ticketData.numero,
              conversation_id: ticketData.conversation_id,
              closed_by: user?.id
            }
          });
        } catch (webhookError) {
          console.error('Error dispatching ticket_closed webhook:', webhookError);
        }
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['critical-tickets'] });
      toast.success('Ticket finalizado com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao finalizar ticket');
    },
  });

  const submitFeedback = useMutation({
    mutationFn: async ({ ticketId, nota, comentario }: { ticketId: string; nota: number; comentario?: string }) => {
      const { data, error } = await supabase
        .from('feedbacks')
        .insert({
          ticket_id: ticketId,
          nota,
          comentario: comentario || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Feedback enviado, obrigado!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao enviar feedback');
    },
  });

  return {
    ticket,
    isLoading,
    createTicket,
    updateTicketStatus,
    closeTicket,
    submitFeedback,
  };
};

// Hook for listing all tickets (admin view)
export const useTicketsList = (sectorId?: string, status?: string) => {
  const queryClient = useQueryClient();
  
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets-list', sectorId, status],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          whatsapp_conversations!inner(
            id,
            whatsapp_contacts!inner(name, phone_number)
          ),
          sectors!inner(name)
        `)
        .order('created_at', { ascending: false });

      if (sectorId) {
        query = query.eq('sector_id', sectorId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription for ticket list updates
  useEffect(() => {
    let ticketInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel('tickets-list-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
        },
        () => {
          clearTimeout(ticketInvalidateTimeout);
          ticketInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(ticketInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { tickets, isLoading };
};

// Hook for getting ticket feedback
export const useTicketFeedback = (ticketId?: string) => {
  return useQuery({
    queryKey: ['ticket-feedback', ticketId],
    queryFn: async () => {
      if (!ticketId) return null;
      
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .eq('ticket_id', ticketId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Feedback | null;
    },
    enabled: !!ticketId,
  });
};
