import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/client";
import { useToast } from "@/hooks/use-toast";

export interface NegotiationLog {
  id: string;
  quote_id: string | null;
  order_id: string | null;
  action: string;
  original_value: number | null;
  new_value: number | null;
  discount_percent: number | null;
  agent_type: 'ai' | 'human';
  reason: string | null;
  customer_message: string | null;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  approver?: {
    id: string;
    full_name: string;
  };
  creator?: {
    id: string;
    full_name: string;
  };
}

export interface CreateNegotiationLogInput {
  quote_id?: string;
  order_id?: string;
  action: string;
  original_value?: number;
  new_value?: number;
  discount_percent?: number;
  agent_type?: 'ai' | 'human';
  reason?: string;
  customer_message?: string;
  requires_approval?: boolean;
}

export const useNegotiationLogs = (quoteId?: string, orderId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['negotiation-logs', quoteId, orderId],
    queryFn: async () => {
      let query = supabase
        .from('negotiation_logs')
        .select(`
          *,
          approver:profiles!negotiation_logs_approved_by_fkey(id, full_name),
          creator:profiles!negotiation_logs_created_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: true });

      if (quoteId) {
        query = query.eq('quote_id', quoteId);
      }

      if (orderId) {
        query = query.eq('order_id', orderId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as NegotiationLog[];
    },
    enabled: !!quoteId || !!orderId,
  });

  const createLog = useMutation({
    mutationFn: async (input: CreateNegotiationLogInput) => {
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('negotiation_logs')
        .insert({
          quote_id: input.quote_id,
          order_id: input.order_id,
          action: input.action,
          original_value: input.original_value,
          new_value: input.new_value,
          discount_percent: input.discount_percent,
          agent_type: input.agent_type || 'human',
          reason: input.reason,
          customer_message: input.customer_message,
          requires_approval: input.requires_approval || false,
          created_by: user?.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['negotiation-logs'] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao registrar negociação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveNegotiation = useMutation({
    mutationFn: async (logId: string) => {
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('negotiation_logs')
        .update({
          approved_by: user?.user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', logId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['negotiation-logs'] });
      toast({
        title: "Negociação aprovada",
        description: "O desconto foi aprovado com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao aprovar negociação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    logs: logs || [],
    isLoading,
    error,
    createLog,
    approveNegotiation,
  };
};

// Ações de negociação comuns
export const NEGOTIATION_ACTIONS = {
  QUOTE_CREATED: 'quote_created',
  QUOTE_SENT: 'quote_sent',
  QUOTE_VIEWED: 'quote_viewed',
  DISCOUNT_REQUESTED: 'discount_requested',
  DISCOUNT_APPLIED: 'discount_applied',
  DISCOUNT_APPROVED: 'discount_approved',
  DISCOUNT_REJECTED: 'discount_rejected',
  COUNTER_OFFER: 'counter_offer',
  PRICE_CHANGED: 'price_changed',
  QUOTE_ACCEPTED: 'quote_accepted',
  QUOTE_REJECTED: 'quote_rejected',
  ORDER_CREATED: 'order_created',
  PAYMENT_LINK_SENT: 'payment_link_sent',
  PAYMENT_CONFIRMED: 'payment_confirmed',
} as const;

export const getActionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    quote_created: 'Cotação criada',
    quote_sent: 'Cotação enviada',
    quote_viewed: 'Cotação visualizada',
    discount_requested: 'Desconto solicitado',
    discount_applied: 'Desconto aplicado',
    discount_approved: 'Desconto aprovado',
    discount_rejected: 'Desconto rejeitado',
    counter_offer: 'Contra-proposta',
    price_changed: 'Preço alterado',
    quote_accepted: 'Cotação aceita',
    quote_rejected: 'Cotação rejeitada',
    order_created: 'Pedido criado',
    payment_link_sent: 'Link de pagamento enviado',
    payment_confirmed: 'Pagamento confirmado',
  };
  return labels[action] || action;
};
