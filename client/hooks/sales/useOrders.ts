import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/api/types";
import { QuoteItem } from "./useQuotes";

type OrderStatus = Database['public']['Enums']['order_status'];
type PaymentStatus = Database['public']['Enums']['payment_status'];

export interface Order {
  id: string;
  order_number: string;
  quote_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  sector_id: string | null;
  status: OrderStatus;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string | null;
  payment_status: PaymentStatus;
  payment_link: string | null;
  payment_notes: string | null;
  payment_proof_url: string | null;
  paid_at: string | null;
  confirmed_by: string | null;
  shipping_address: string | null;
  delivery_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  quote?: {
    id: string;
    quote_number: string;
  };
  lead?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  conversation?: {
    id: string;
    contact: {
      name: string;
      phone_number: string;
    };
  };
  confirmer?: {
    id: string;
    full_name: string;
  };
}

export interface OrderFilters {
  status?: OrderStatus | OrderStatus[];
  paymentStatus?: PaymentStatus | PaymentStatus[];
  sectorId?: string;
  leadId?: string;
  conversationId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface CreateOrderInput {
  quote_id?: string;
  lead_id?: string;
  conversation_id?: string;
  sector_id?: string;
  items: QuoteItem[];
  payment_method?: string;
  payment_notes?: string;
  shipping_address?: string;
  delivery_notes?: string;
}

export interface UpdateOrderInput {
  id: string;
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  payment_method?: string;
  payment_link?: string;
  payment_notes?: string;
  payment_proof_url?: string;
  paid_at?: string;
  confirmed_by?: string;
  shipping_address?: string;
  delivery_notes?: string;
}

export const useOrders = (filters?: OrderFilters) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          quote:quotes(id, quote_number),
          lead:leads(id, name, email, phone),
          conversation:whatsapp_conversations(
            id,
            contact:whatsapp_contacts(name, phone_number)
          ),
          confirmer:profiles!orders_confirmed_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.paymentStatus) {
        if (Array.isArray(filters.paymentStatus)) {
          query = query.in('payment_status', filters.paymentStatus);
        } else {
          query = query.eq('payment_status', filters.paymentStatus);
        }
      }

      if (filters?.sectorId) {
        query = query.eq('sector_id', filters.sectorId);
      }

      if (filters?.leadId) {
        query = query.eq('lead_id', filters.leadId);
      }

      if (filters?.conversationId) {
        query = query.eq('conversation_id', filters.conversationId);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }

      if (filters?.search) {
        query = query.or(`order_number.ilike.%${filters.search}%,payment_notes.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(o => ({
        ...o,
        items: (o.items as unknown as QuoteItem[]) || [],
      })) as Order[];
    },
  });

  const generateOrderNumber = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_order_number');
      if (error) throw error;
      return data as string;
    },
  });

  const createOrder = useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const orderNumber = await generateOrderNumber.mutateAsync();

      const subtotal = input.items.reduce((acc, item) => acc + item.subtotal, 0);
      const discount = input.items.reduce((acc, item) => acc + item.discount_amount, 0);
      const total = subtotal - discount;

      const { data, error } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          quote_id: input.quote_id,
          lead_id: input.lead_id,
          conversation_id: input.conversation_id,
          sector_id: input.sector_id,
          items: input.items as unknown as Database['public']['Tables']['orders']['Insert']['items'],
          subtotal,
          discount,
          total,
          payment_method: input.payment_method,
          payment_notes: input.payment_notes,
          shipping_address: input.shipping_address,
          delivery_notes: input.delivery_notes,
          status: 'pending',
          payment_status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: "Pedido criado",
        description: "O pedido foi criado com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar pedido",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createOrderFromQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      // Fetch the quote
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single();

      if (quoteError) throw quoteError;

      // Update quote status to accepted
      await supabase
        .from('quotes')
        .update({ 
          status: 'accepted' as Database['public']['Enums']['quote_status'],
          responded_at: new Date().toISOString(),
        })
        .eq('id', quoteId);

      // Create order
      const orderNumber = await generateOrderNumber.mutateAsync();

      const { data, error } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          quote_id: quoteId,
          lead_id: quote.lead_id,
          conversation_id: quote.conversation_id,
          sector_id: quote.sector_id,
          items: quote.items,
          subtotal: quote.subtotal,
          discount: quote.discount_total,
          total: quote.total,
          status: 'pending',
          payment_status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: "Pedido criado",
        description: "O pedido foi criado a partir da cotação.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar pedido",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateOrder = useMutation({
    mutationFn: async (input: UpdateOrderInput) => {
      const updateData: Record<string, unknown> = {};

      if (input.status !== undefined) updateData.status = input.status;
      if (input.payment_status !== undefined) updateData.payment_status = input.payment_status;
      if (input.payment_method !== undefined) updateData.payment_method = input.payment_method;
      if (input.payment_link !== undefined) updateData.payment_link = input.payment_link;
      if (input.payment_notes !== undefined) updateData.payment_notes = input.payment_notes;
      if (input.payment_proof_url !== undefined) updateData.payment_proof_url = input.payment_proof_url;
      if (input.paid_at !== undefined) updateData.paid_at = input.paid_at;
      if (input.confirmed_by !== undefined) updateData.confirmed_by = input.confirmed_by;
      if (input.shipping_address !== undefined) updateData.shipping_address = input.shipping_address;
      if (input.delivery_notes !== undefined) updateData.delivery_notes = input.delivery_notes;

      const { data, error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({
        title: "Pedido atualizado",
        description: "O pedido foi atualizado com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar pedido",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const confirmPayment = useMutation({
    mutationFn: async ({ orderId, paymentProofUrl }: { orderId: string; paymentProofUrl?: string }) => {
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('orders')
        .update({
          payment_status: 'confirmed' as PaymentStatus,
          status: 'paid' as OrderStatus,
          paid_at: new Date().toISOString(),
          confirmed_by: user?.user?.id,
          payment_proof_url: paymentProofUrl,
        })
        .eq('id', orderId)
        .select(`*, lead:leads(id)`)
        .single();

      if (error) throw error;

      // Update lead to won if exists
      if (data.lead_id) {
        await supabase
          .from('leads')
          .update({ 
            status: 'won',
            won_at: new Date().toISOString(),
          })
          .eq('id', data.lead_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-metrics'] });
      toast({
        title: "Pagamento confirmado",
        description: "O pagamento foi confirmado e o pedido atualizado.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao confirmar pagamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({
        title: "Pedido excluído",
        description: "O pedido foi excluído com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir pedido",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    orders: orders || [],
    isLoading,
    error,
    createOrder,
    createOrderFromQuote,
    updateOrder,
    confirmPayment,
    deleteOrder,
  };
};

// Hook para buscar um pedido específico
export const useOrder = (orderId: string | undefined) => {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      if (!orderId) return null;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          quote:quotes(id, quote_number),
          lead:leads(id, name, email, phone),
          conversation:whatsapp_conversations(
            id,
            contact:whatsapp_contacts(name, phone_number)
          ),
          confirmer:profiles!orders_confirmed_by_fkey(id, full_name)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;

      return {
        ...data,
        items: (data.items as unknown as QuoteItem[]) || [],
      } as Order;
    },
    enabled: !!orderId,
  });
};
