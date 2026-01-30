import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/client";
import { useToast } from "@/hooks/use-toast";

export interface PaymentLink {
  id: string;
  order_id: string;
  type: 'pix' | 'boleto' | 'bank_transfer' | 'stripe' | 'custom';
  url: string | null;
  description: string | null;
  instructions: string | null;
  amount: number;
  expires_at: string | null;
  used_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface CreatePaymentLinkInput {
  order_id: string;
  type: PaymentLink['type'];
  url?: string;
  description?: string;
  instructions?: string;
  amount: number;
  expires_at?: string;
}

export const usePaymentLinks = (orderId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: paymentLinks, isLoading, error } = useQuery({
    queryKey: ['payment-links', orderId],
    queryFn: async () => {
      if (!orderId) return [];

      const { data, error } = await supabase
        .from('payment_links')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PaymentLink[];
    },
    enabled: !!orderId,
  });

  const createPaymentLink = useMutation({
    mutationFn: async (input: CreatePaymentLinkInput) => {
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('payment_links')
        .insert({
          order_id: input.order_id,
          type: input.type,
          url: input.url,
          description: input.description,
          instructions: input.instructions,
          amount: input.amount,
          expires_at: input.expires_at,
          is_active: true,
          created_by: user?.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
      toast({
        title: "Link de pagamento criado",
        description: "O link de pagamento foi criado com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar link de pagamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markAsUsed = useMutation({
    mutationFn: async (paymentLinkId: string) => {
      const { data, error } = await supabase
        .from('payment_links')
        .update({
          used_at: new Date().toISOString(),
          is_active: false,
        })
        .eq('id', paymentLinkId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
    },
  });

  const deactivatePaymentLink = useMutation({
    mutationFn: async (paymentLinkId: string) => {
      const { data, error } = await supabase
        .from('payment_links')
        .update({ is_active: false })
        .eq('id', paymentLinkId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
      toast({
        title: "Link desativado",
        description: "O link de pagamento foi desativado.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao desativar link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    paymentLinks: paymentLinks || [],
    isLoading,
    error,
    createPaymentLink,
    markAsUsed,
    deactivatePaymentLink,
  };
};
