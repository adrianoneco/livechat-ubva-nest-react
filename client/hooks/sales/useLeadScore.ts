import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { useEffect } from 'react';
import type { BANTAnalysis } from './useLeadQualification';

export interface LeadScoreData {
  lead_score: number;
  bant_budget: BANTAnalysis['budget'] | null;
  bant_authority: BANTAnalysis['authority'] | null;
  bant_need: BANTAnalysis['need'] | null;
  bant_timeline: BANTAnalysis['timeline'] | null;
  qualification_data: {
    overall_intent?: string;
    recommended_action?: string;
    reasoning?: string;
  } | null;
  qualified_at: string | null;
  qualified_by: string | null;
  last_qualification_at: string | null;
}

export type ScoreLevel = 'cold' | 'warm' | 'hot' | 'qualified';

export const getScoreLevel = (score: number): ScoreLevel => {
  if (score >= 71) return 'qualified';
  if (score >= 51) return 'hot';
  if (score >= 31) return 'warm';
  return 'cold';
};

export const getScoreColor = (score: number): string => {
  const level = getScoreLevel(score);
  switch (level) {
    case 'qualified': return 'text-green-500';
    case 'hot': return 'text-blue-500';
    case 'warm': return 'text-yellow-500';
    case 'cold': return 'text-red-500';
  }
};

export const getScoreBgColor = (score: number): string => {
  const level = getScoreLevel(score);
  switch (level) {
    case 'qualified': return 'bg-green-500/10 border-green-500/20';
    case 'hot': return 'bg-blue-500/10 border-blue-500/20';
    case 'warm': return 'bg-yellow-500/10 border-yellow-500/20';
    case 'cold': return 'bg-red-500/10 border-red-500/20';
  }
};

export const getScoreLabel = (score: number): string => {
  const level = getScoreLevel(score);
  switch (level) {
    case 'qualified': return 'Qualificado';
    case 'hot': return 'Quente';
    case 'warm': return 'Morno';
    case 'cold': return 'Frio';
  }
};

export const useLeadScore = (leadId?: string) => {
  const queryClient = useQueryClient();

  const { data: scoreData, isLoading, error } = useQuery({
    queryKey: ['lead-score', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      
      const { data, error } = await supabase
        .from('leads')
        .select(`
          lead_score,
          bant_budget,
          bant_authority,
          bant_need,
          bant_timeline,
          qualification_data,
          qualified_at,
          qualified_by,
          last_qualification_at
        `)
        .eq('id', leadId)
        .single();

      if (error) throw error;
      return data as LeadScoreData;
    },
    enabled: !!leadId,
  });

  // Subscribe to realtime updates for qualification logs
  useEffect(() => {
    if (!leadId) return;

    const channel = supabase
      .channel(`lead-score-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_qualification_logs',
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          // Invalidate score query when logs change
          queryClient.invalidateQueries({ queryKey: ['lead-score', leadId] });
          queryClient.invalidateQueries({ queryKey: ['qualification-logs', leadId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, queryClient]);

  return {
    scoreData,
    score: scoreData?.lead_score ?? 0,
    level: getScoreLevel(scoreData?.lead_score ?? 0),
    isLoading,
    error,
    isQualified: !!scoreData?.qualified_at,
    qualifiedBy: scoreData?.qualified_by,
  };
};
