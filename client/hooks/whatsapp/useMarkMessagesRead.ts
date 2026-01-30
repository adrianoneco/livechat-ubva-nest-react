import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFunction } from '@/lib/api';

interface MarkReadParams {
  conversationId: string;
  messageIds?: string[];
}

interface MarkReadResult {
  success: boolean;
  markedCount: number;
  messageIds?: string[];
  error?: string;
}

export const useMarkMessagesRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: MarkReadParams): Promise<MarkReadResult> => {
      const { data, error } = await invokeFunction<MarkReadResult>('mark-messages-read', params);

      if (error) {
        console.error('[useMarkMessagesRead] Error:', error);
        throw error;
      }
      
      return data!;
    },
    onSuccess: (data, variables) => {
      // Invalidate conversations to update unread count immediately
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'conversations'] 
      });
      
      // Also invalidate the specific conversation query to ensure UI updates
      queryClient.invalidateQueries({
        queryKey: ['conversation', variables.conversationId]
      });
      
      // Force update the conversation data in cache with unread_count: 0
      queryClient.setQueryData(['conversation', variables.conversationId], (old: any) => {
        if (!old) return old;
        return { ...old, unread_count: 0 };
      });
      
      console.log('[useMarkMessagesRead] Marked', data.markedCount, 'messages as read');
    },
    onError: (error) => {
      console.error('[useMarkMessagesRead] Mutation error:', error);
    },
  });
};
