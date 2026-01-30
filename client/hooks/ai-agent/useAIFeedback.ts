import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

export interface AIFeedback {
  id: string;
  log_id: string | null;
  conversation_id: string;
  rating: number | null;
  feedback_type: string | null;
  corrected_response: string | null;
  correction_reason: string | null;
  given_by: string | null;
  created_at: string;
}

export type FeedbackType = 'helpful' | 'incorrect' | 'incomplete' | 'tone_wrong' | 'perfect';

export const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: string }[] = [
  { value: 'perfect', label: 'Perfeito', icon: '⭐' },
  { value: 'helpful', label: 'Útil', icon: '👍' },
  { value: 'incomplete', label: 'Incompleto', icon: '📝' },
  { value: 'tone_wrong', label: 'Tom errado', icon: '🎭' },
  { value: 'incorrect', label: 'Incorreto', icon: '❌' },
];

export const useAIFeedback = (conversationId?: string) => {
  const queryClient = useQueryClient();

  // Fetch feedback for a conversation
  const { data: feedbackList, isLoading, error } = useQuery({
    queryKey: ['ai-feedback', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      const { data, error } = await supabase
        .from('ai_response_feedback')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AIFeedback[];
    },
    enabled: !!conversationId,
  });

  // Submit quick feedback (thumbs up/down)
  const submitQuickFeedback = useMutation({
    mutationFn: async ({ 
      logId, 
      rating, 
      feedbackType 
    }: { 
      logId?: string; 
      rating: number; 
      feedbackType: FeedbackType 
    }) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('ai_response_feedback')
        .insert({
          log_id: logId || null,
          conversation_id: conversationId,
          rating,
          feedback_type: feedbackType,
          given_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-feedback', conversationId] });
      toast.success('Feedback registrado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao registrar feedback');
    },
  });

  // Submit detailed feedback with correction
  const submitDetailedFeedback = useMutation({
    mutationFn: async ({ 
      logId, 
      rating, 
      feedbackType,
      correctedResponse,
      correctionReason,
    }: { 
      logId?: string; 
      rating: number; 
      feedbackType: FeedbackType;
      correctedResponse?: string;
      correctionReason?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('ai_response_feedback')
        .insert({
          log_id: logId || null,
          conversation_id: conversationId,
          rating,
          feedback_type: feedbackType,
          corrected_response: correctedResponse,
          correction_reason: correctionReason,
          given_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-feedback', conversationId] });
      toast.success('Feedback detalhado registrado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao registrar feedback');
    },
  });

  // Get feedback statistics for a sector
  const useFeedbackStats = (sectorId?: string) => {
    return useQuery({
      queryKey: ['ai-feedback-stats', sectorId],
      queryFn: async () => {
        if (!sectorId) return null;
        
        // Get all feedback for conversations in this sector
        const { data: conversations } = await supabase
          .from('whatsapp_conversations')
          .select('id')
          .eq('sector_id', sectorId);

        if (!conversations || conversations.length === 0) {
          return { total: 0, avgRating: 0, byType: {} };
        }

        const conversationIds = conversations.map(c => c.id);

        const { data: feedback } = await supabase
          .from('ai_response_feedback')
          .select('rating, feedback_type')
          .in('conversation_id', conversationIds);

        if (!feedback || feedback.length === 0) {
          return { total: 0, avgRating: 0, byType: {} };
        }

        const byType: Record<string, number> = {};
        let totalRating = 0;
        let ratingCount = 0;

        feedback.forEach(f => {
          if (f.feedback_type) {
            byType[f.feedback_type] = (byType[f.feedback_type] || 0) + 1;
          }
          if (f.rating !== null) {
            totalRating += f.rating;
            ratingCount++;
          }
        });

        return {
          total: feedback.length,
          avgRating: ratingCount > 0 ? totalRating / ratingCount : 0,
          byType,
        };
      },
      enabled: !!sectorId,
    });
  };

  return {
    feedbackList: feedbackList || [],
    isLoading,
    error,
    submitQuickFeedback,
    submitDetailedFeedback,
    useFeedbackStats,
    isSubmitting: submitQuickFeedback.isPending || submitDetailedFeedback.isPending,
  };
};
