import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/api/types";

type QuoteStatus = Database['public']['Enums']['quote_status'];

export interface QuoteItem {
  product_id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  subtotal: number;
  notes?: string;
}

export interface Quote {
  id: string;
  quote_number: string;
  lead_id: string | null;
  conversation_id: string | null;
  sector_id: string | null;
  status: QuoteStatus;
  items: QuoteItem[];
  subtotal: number;
  discount_total: number;
  total: number;
  valid_until: string | null;
  payment_terms: string | null;
  notes: string | null;
  created_by: string | null;
  is_ai_generated: boolean;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
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
  creator?: {
    id: string;
    full_name: string;
  };
}

export interface QuoteFilters {
  status?: QuoteStatus | QuoteStatus[];
  sectorId?: string;
  leadId?: string;
  conversationId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface CreateQuoteInput {
  lead_id?: string;
  conversation_id?: string;
  sector_id?: string;
  items: QuoteItem[];
  valid_until?: string;
  payment_terms?: string;
  notes?: string;
  is_ai_generated?: boolean;
}

export interface UpdateQuoteInput {
  id: string;
  status?: QuoteStatus;
  items?: QuoteItem[];
  valid_until?: string;
  payment_terms?: string;
  notes?: string;
  sent_at?: string;
  viewed_at?: string;
  responded_at?: string;
}

export const useQuotes = (filters?: QuoteFilters) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quotes, isLoading, error } = useQuery({
    queryKey: ['quotes', filters],
    queryFn: async () => {
      let query = supabase
        .from('quotes')
        .select(`
          *,
          lead:leads(id, name, email, phone),
          conversation:whatsapp_conversations(
            id,
            contact:whatsapp_contacts(name, phone_number)
          ),
          creator:profiles!quotes_created_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
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
        query = query.or(`quote_number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(q => ({
        ...q,
        items: (q.items as unknown as QuoteItem[]) || [],
      })) as Quote[];
    },
  });

  const generateQuoteNumber = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_quote_number');
      if (error) throw error;
      return data as string;
    },
  });

  const createQuote = useMutation({
    mutationFn: async (input: CreateQuoteInput) => {
      // Generate quote number
      const quoteNumber = await generateQuoteNumber.mutateAsync();

      // Calculate totals
      const subtotal = input.items.reduce((acc, item) => acc + item.subtotal, 0);
      const discountTotal = input.items.reduce((acc, item) => acc + item.discount_amount, 0);
      const total = subtotal - discountTotal;

      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('quotes')
        .insert({
          quote_number: quoteNumber,
          lead_id: input.lead_id,
          conversation_id: input.conversation_id,
          sector_id: input.sector_id,
          items: input.items as unknown as Database['public']['Tables']['quotes']['Insert']['items'],
          subtotal,
          discount_total: discountTotal,
          total,
          valid_until: input.valid_until,
          payment_terms: input.payment_terms,
          notes: input.notes,
          is_ai_generated: input.is_ai_generated || false,
          created_by: user?.user?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: "Cotação criada",
        description: "A cotação foi criada com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar cotação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateQuote = useMutation({
    mutationFn: async (input: UpdateQuoteInput) => {
      const updateData: Record<string, unknown> = {};

      if (input.status !== undefined) updateData.status = input.status;
      if (input.items !== undefined) {
        updateData.items = input.items;
        updateData.subtotal = input.items.reduce((acc, item) => acc + item.subtotal, 0);
        updateData.discount_total = input.items.reduce((acc, item) => acc + item.discount_amount, 0);
        updateData.total = (updateData.subtotal as number) - (updateData.discount_total as number);
      }
      if (input.valid_until !== undefined) updateData.valid_until = input.valid_until;
      if (input.payment_terms !== undefined) updateData.payment_terms = input.payment_terms;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.sent_at !== undefined) updateData.sent_at = input.sent_at;
      if (input.viewed_at !== undefined) updateData.viewed_at = input.viewed_at;
      if (input.responded_at !== undefined) updateData.responded_at = input.responded_at;

      const { data, error } = await supabase
        .from('quotes')
        .update(updateData)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: "Cotação atualizada",
        description: "A cotação foi atualizada com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar cotação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: "Cotação excluída",
        description: "A cotação foi excluída com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir cotação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase
        .from('quotes')
        .update({
          status: 'sent' as QuoteStatus,
          sent_at: new Date().toISOString(),
        })
        .eq('id', quoteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: "Cotação enviada",
        description: "A cotação foi marcada como enviada.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao enviar cotação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    quotes: quotes || [],
    isLoading,
    error,
    createQuote,
    updateQuote,
    deleteQuote,
    sendQuote,
  };
};

// Hook para buscar uma cotação específica
export const useQuote = (quoteId: string | undefined) => {
  return useQuery({
    queryKey: ['quote', quoteId],
    queryFn: async () => {
      if (!quoteId) return null;

      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          lead:leads(id, name, email, phone),
          conversation:whatsapp_conversations(
            id,
            contact:whatsapp_contacts(name, phone_number)
          ),
          creator:profiles!quotes_created_by_fkey(id, full_name)
        `)
        .eq('id', quoteId)
        .single();

      if (error) throw error;

      return {
        ...data,
        items: (data.items as unknown as QuoteItem[]) || [],
      } as Quote;
    },
    enabled: !!quoteId,
  });
};
