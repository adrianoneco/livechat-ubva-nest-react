import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFunction } from '@/lib/api';
import { toast } from 'sonner';

interface EditMessageParams {
  messageId: string;
  conversationId: string;
  newContent: string;
}

export const useEditMessage = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: EditMessageParams) => {
      const { data, error } = await invokeFunction('edit-whatsapp-message', params);

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success('Mensagem editada com sucesso');
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', variables.conversationId] });
        queryClient.invalidateQueries({ queryKey: ['message-edit-history', variables.messageId] });
      } else {
        toast.error(data.error || 'Erro ao editar mensagem');
      }
    },
    onError: (error: any) => {
      console.error('[useEditMessage] Error:', error);
      toast.error(error.message || 'Erro ao editar mensagem');
    },
  });

  return mutation;
};
