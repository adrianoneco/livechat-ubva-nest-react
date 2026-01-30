import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/api";
import { toast } from "sonner";

export interface SmartReplySuggestion {
  text: string;
  tone: 'formal' | 'friendly' | 'direct';
}

export interface SmartReplyResponse {
  suggestions: SmartReplySuggestion[];
  context?: {
    contactName: string;
    lastMessage: string;
  } | null;
  error?: string;
}

export const useSmartReply = (conversationId: string | null) => {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['smart-replies', conversationId],
    queryFn: async (): Promise<SmartReplyResponse> => {
      if (!conversationId) {
        throw new Error('No conversation selected');
      }

      const { data, error } = await invokeFunction<SmartReplyResponse>('suggest-smart-replies', {
        conversationId
      });

      // If function returned a body, prefer it even when response status indicates error.
      if (data) {
        return data;
      }

      if (error) {
        console.warn('Smart reply function error with no data:', error);
        throw error;
      }

      return { suggestions: [], context: null };
    },
    enabled: !!conversationId,
    staleTime: 10 * 60 * 1000, // Cache por 10 minutos
    gcTime: 15 * 60 * 1000, // Manter em cache por 15 minutos
    retry: false, // Não retentar para evitar rate limit
    refetchOnWindowFocus: false, // Não refetch ao focar janela
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) {
        throw new Error('No conversation selected');
      }

      const { data, error } = await invokeFunction<SmartReplyResponse>('suggest-smart-replies', {
        conversationId
      });

      if (data) return data;

      if (error) {
        console.warn('Smart reply refresh error with no data:', error);
        throw error;
      }

      return { suggestions: [], context: null };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['smart-replies', conversationId], data);
      toast.success('Novas sugestões geradas!');
    },
    onError: (error: any) => {
      console.error('Refresh error:', error);
      
      if (error.message?.includes('Rate limit')) {
        toast.error('Muitas requisições. Aguarde um momento.');
      } else if (error.message?.includes('credits') || error.message?.includes('402')) {
        toast.error('Créditos insuficientes. Adicione créditos ao seu workspace.');
      } else {
        toast.error('Erro ao gerar novas sugestões. Tente novamente.');
      }
    }
  });

  return {
    suggestions: data?.suggestions || [],
    context: data?.context || null,
    isLoading,
    isRefreshing: refreshMutation.isPending,
    refresh: () => refreshMutation.mutate(),
    error: error as Error | null,
    refetch,
  };
};
