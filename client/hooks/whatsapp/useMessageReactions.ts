import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/api/client';
import { Tables } from '@/integrations/api/types';

type Reaction = Tables<'whatsapp_reactions'>;

export const useMessageReactions = (conversationId: string | null) => {
  const queryClient = useQueryClient();

  const { data: reactions = [], isLoading } = useQuery({
    queryKey: ['whatsapp', 'reactions', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      console.log('[useMessageReactions] Fetching reactions for conversation:', conversationId);
      const { data, error } = await supabase
        .from('whatsapp_reactions')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[useMessageReactions] Error fetching reactions:', error);
        throw error;
      }
      console.log('[useMessageReactions] Fetched reactions:', data?.length || 0, data);
      return data as Reaction[];
    },
    enabled: !!conversationId,
  });

  // Realtime subscription for reactions
  useEffect(() => {
    if (!conversationId) return;

    let reactionsInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel(`reactions-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_reactions',
        filter: `conversation_id=eq.${conversationId}`
      }, () => {
        // Debounce invalidation to prevent excessive re-renders
        clearTimeout(reactionsInvalidateTimeout);
        reactionsInvalidateTimeout = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp', 'reactions', conversationId] });
        }, 100);
      })
      .subscribe();

    return () => {
      clearTimeout(reactionsInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Group reactions by message_id
  const reactionsByMessage = useMemo(() => {
    const grouped: Record<string, Reaction[]> = {};
    
    reactions.forEach(reaction => {
      if (!grouped[reaction.message_id]) {
        grouped[reaction.message_id] = [];
      }
      grouped[reaction.message_id].push(reaction);
    });
    
    return grouped;
  }, [reactions]);

  return {
    reactions,
    reactionsByMessage,
    isLoading,
  };
};
