import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFunction } from '@/lib/api';
import { toast } from 'sonner';

interface DeleteMessageParams {
  messageId: string;
  conversationId: string;
  reason?: string;
}

export const useDeleteMessage = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: DeleteMessageParams) => {
      const { data, error } = await invokeFunction('delete-whatsapp-message', params);

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success('Mensagem excluída com sucesso');
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', variables.conversationId] });
      } else {
        toast.error(data.error || 'Erro ao excluir mensagem');
      }
    },
    onError: (error: any) => {
      console.error('[useDeleteMessage] Error:', error);
      toast.error(error.message || 'Erro ao excluir mensagem');
    },
  });

  return mutation;
};
