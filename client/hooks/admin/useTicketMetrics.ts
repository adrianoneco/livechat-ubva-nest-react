import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/api/client';

export interface TicketMetrics {
  total: number;
  byStatus: {
    aberto: number;
    em_atendimento: number;
    finalizado: number;
  };
  byPriority: {
    alta: number;
    media: number;
    baixa: number;
  };
  byCategory: Record<string, number>;
  slaViolated: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  avgFeedbackScore: number | null;
  ticketsToday: number;
  ticketsThisWeek: number;
  nps: number | null;
  promoters: number;
  detractors: number;
  passives: number;
}

export function useTicketMetrics(sectorId?: string, periodDays?: number) {
  const queryClient = useQueryClient();
  
  // Real-time subscription for ticket changes
  useEffect(() => {
    let invalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel('ticket-metrics-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
        },
        () => {
          clearTimeout(invalidateTimeout);
          invalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['ticket-metrics'] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(invalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['ticket-metrics', sectorId, periodDays],
    queryFn: async (): Promise<TicketMetrics> => {
      let query = supabase
        .from('tickets')
        .select(`
          id,
          status,
          prioridade,
          categoria,
          created_at,
          first_response_at,
          closed_at,
          sla_violated_at
        `);

      if (sectorId) {
        query = query.eq('sector_id', sectorId);
      }

      // Apply period filter if specified
      if (periodDays) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data: tickets, error } = await query;

      if (error) throw error;

      // Calculate metrics
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);

      const byStatus = { aberto: 0, em_atendimento: 0, finalizado: 0 };
      const byPriority = { alta: 0, media: 0, baixa: 0 };
      const byCategory: Record<string, number> = {};
      let slaViolated = 0;
      let ticketsToday = 0;
      let ticketsThisWeek = 0;

      const firstResponseTimes: number[] = [];
      const resolutionTimes: number[] = [];

      tickets?.forEach((ticket) => {
        // By status
        if (ticket.status in byStatus) {
          byStatus[ticket.status as keyof typeof byStatus]++;
        }

        // By priority
        const priority = ticket.prioridade || 'media';
        if (priority in byPriority) {
          byPriority[priority as keyof typeof byPriority]++;
        }

        // By category
        const category = ticket.categoria || 'outro';
        byCategory[category] = (byCategory[category] || 0) + 1;

        // SLA violated
        if (ticket.sla_violated_at) {
          slaViolated++;
        }

        // Tickets today/this week
        const createdAt = new Date(ticket.created_at);
        if (createdAt >= todayStart) ticketsToday++;
        if (createdAt >= weekStart) ticketsThisWeek++;

        // First response time
        if (ticket.first_response_at) {
          const responseTime = (new Date(ticket.first_response_at).getTime() - createdAt.getTime()) / 60000;
          firstResponseTimes.push(responseTime);
        }

        // Resolution time
        if (ticket.closed_at) {
          const resolutionTime = (new Date(ticket.closed_at).getTime() - createdAt.getTime()) / 60000;
          resolutionTimes.push(resolutionTime);
        }
      });

      // Fetch feedback scores and calculate NPS
      const { data: feedbacks } = await supabase
        .from('feedbacks')
        .select('nota, ticket_id')
        .in('ticket_id', tickets?.map(t => t.id) || []);

      const avgFeedbackScore = feedbacks && feedbacks.length > 0
        ? feedbacks.reduce((sum, f) => sum + f.nota, 0) / feedbacks.length
        : null;

      // Calculate NPS: Promoters (4-5), Passives (3), Detractors (1-2)
      let promoters = 0;
      let passives = 0;
      let detractors = 0;

      feedbacks?.forEach((f) => {
        if (f.nota >= 4) promoters++;
        else if (f.nota === 3) passives++;
        else detractors++;
      });

      const totalFeedbacks = feedbacks?.length || 0;
      const nps = totalFeedbacks > 0
        ? Math.round(((promoters - detractors) / totalFeedbacks) * 100)
        : null;

      return {
        total: tickets?.length || 0,
        byStatus,
        byPriority,
        byCategory,
        slaViolated,
        avgFirstResponseMinutes: firstResponseTimes.length > 0
          ? firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length
          : null,
        avgResolutionMinutes: resolutionTimes.length > 0
          ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
          : null,
        avgFeedbackScore,
        ticketsToday,
        ticketsThisWeek,
        nps,
        promoters,
        detractors,
        passives,
      };
    },
    refetchInterval: 30000,
  });
}

export function useRecentTickets(limit = 10) {
  return useQuery({
    queryKey: ['recent-tickets', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          conversation:whatsapp_conversations(
            id,
            contact:whatsapp_contacts(name, phone_number)
          ),
          sector:sectors(name),
          atendente:profiles!tickets_atendente_id_fkey(full_name)
        `)
        .in('status', ['aberto', 'em_atendimento'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });
}

export function useCriticalTickets() {
  const queryClient = useQueryClient();
  
  // Real-time subscription for critical tickets
  useEffect(() => {
    let invalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel('critical-tickets-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
        },
        () => {
          clearTimeout(invalidateTimeout);
          invalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['critical-tickets'] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(invalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['critical-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          conversation:whatsapp_conversations(
            id,
            contact:whatsapp_contacts(name, phone_number)
          ),
          sector:sectors(name),
          atendente:profiles!tickets_atendente_id_fkey(full_name)
        `)
        .in('status', ['aberto', 'em_atendimento'])
        .or('sla_violated_at.not.is.null,prioridade.eq.alta')
        .order('sla_violated_at', { ascending: false, nullsFirst: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });
}
