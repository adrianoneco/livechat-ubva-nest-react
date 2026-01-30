import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  DollarSign, 
  UserCheck, 
  Target, 
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeadScore, getScoreColor, getScoreBgColor, getScoreLabel } from '@/hooks/sales/useLeadScore';
import type { BANTAnalysis } from '@/hooks/sales/useLeadQualification';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface QualificationBreakdownProps {
  leadId: string;
  compact?: boolean;
}

interface BANTItemProps {
  label: string;
  icon: React.ReactNode;
  detected: boolean;
  confidence: number;
  details?: React.ReactNode;
  compact?: boolean;
}

const BANTItem = ({ label, icon, detected, confidence, details, compact }: BANTItemProps) => {
  const StatusIcon = detected ? CheckCircle2 : XCircle;
  const statusColor = detected ? 'text-green-500' : 'text-muted-foreground';
  const confidencePercent = Math.round(confidence * 100);

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full border',
              detected ? 'bg-green-500/10 border-green-500/30' : 'bg-muted border-border'
            )}>
              <span className={cn('text-xs font-bold', detected ? 'text-green-500' : 'text-muted-foreground')}>
                {label.charAt(0)}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-medium">{label}</p>
              <p>{detected ? 'Detectado' : 'Não detectado'}</p>
              {detected && <p>Confiança: {confidencePercent}%</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon className={cn('w-4 h-4', statusColor)} />
          {detected && (
            <span className="text-xs text-muted-foreground">{confidencePercent}%</span>
          )}
        </div>
      </div>
      {detected && (
        <>
          <Progress value={confidencePercent} className="h-1" />
          {details && (
            <div className="text-xs text-muted-foreground pl-6">
              {details}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const QualificationBreakdown = ({ leadId, compact = false }: QualificationBreakdownProps) => {
  const { scoreData, score, isLoading } = useLeadScore(leadId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scoreData) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <AlertCircle className="w-4 h-4" />
        <span>Nenhuma análise de qualificação disponível</span>
      </div>
    );
  }

  const budget = scoreData.bant_budget as BANTAnalysis['budget'] | null;
  const authority = scoreData.bant_authority as BANTAnalysis['authority'] | null;
  const need = scoreData.bant_need as BANTAnalysis['need'] | null;
  const timeline = scoreData.bant_timeline as BANTAnalysis['timeline'] | null;
  const qualData = scoreData.qualification_data as { 
    overall_intent?: string; 
    recommended_action?: string; 
    reasoning?: string 
  } | null;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn(
          'flex items-center justify-center w-10 h-10 rounded-full border font-bold',
          getScoreBgColor(score),
          getScoreColor(score)
        )}>
          {score}
        </div>
        <div className="flex items-center gap-1">
          <BANTItem 
            label="Budget" 
            icon={<DollarSign className="w-3 h-3" />} 
            detected={budget?.detected ?? false} 
            confidence={budget?.confidence ?? 0}
            compact
          />
          <BANTItem 
            label="Authority" 
            icon={<UserCheck className="w-3 h-3" />} 
            detected={authority?.detected ?? false} 
            confidence={authority?.confidence ?? 0}
            compact
          />
          <BANTItem 
            label="Need" 
            icon={<Target className="w-3 h-3" />} 
            detected={need?.detected ?? false} 
            confidence={need?.confidence ?? 0}
            compact
          />
          <BANTItem 
            label="Timeline" 
            icon={<Clock className="w-3 h-3" />} 
            detected={timeline?.detected ?? false} 
            confidence={timeline?.confidence ?? 0}
            compact
          />
        </div>
      </div>
    );
  }

  const getIntentLabel = (intent?: string) => {
    switch (intent) {
      case 'purchase': return 'Compra';
      case 'information': return 'Informação';
      case 'support': return 'Suporte';
      default: return 'Outro';
    }
  };

  const getActionLabel = (action?: string) => {
    switch (action) {
      case 'qualify': return { label: 'Qualificar', color: 'bg-green-500/10 text-green-500' };
      case 'nurture': return { label: 'Nutrir', color: 'bg-yellow-500/10 text-yellow-500' };
      case 'discard': return { label: 'Descartar', color: 'bg-red-500/10 text-red-500' };
      default: return { label: 'Analisar', color: 'bg-muted text-muted-foreground' };
    }
  };

  const urgencyLabel = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
  };

  const timeframeLabel = {
    immediate: 'Imediato',
    '1-2_weeks': '1-2 semanas',
    '1_month': '1 mês',
    indefinite: 'Indefinido',
  };

  const actionInfo = getActionLabel(qualData?.recommended_action);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Análise BANT</CardTitle>
          <div className="flex items-center gap-2">
            <div className={cn(
              'px-2 py-1 rounded-full border text-sm font-semibold',
              getScoreBgColor(score),
              getScoreColor(score)
            )}>
              {score}/100
            </div>
            <Badge variant="outline" className={getScoreColor(score)}>
              {getScoreLabel(score)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* BANT Items */}
        <div className="space-y-3">
          <BANTItem 
            label="Budget (Orçamento)" 
            icon={<DollarSign className="w-4 h-4 text-green-500" />} 
            detected={budget?.detected ?? false} 
            confidence={budget?.confidence ?? 0}
            details={budget?.estimated_value && (
              <span>Valor estimado: {budget.estimated_value}</span>
            )}
          />
          <BANTItem 
            label="Authority (Autoridade)" 
            icon={<UserCheck className="w-4 h-4 text-blue-500" />} 
            detected={authority?.detected ?? false} 
            confidence={authority?.confidence ?? 0}
            details={authority?.role && (
              <span>
                Cargo: {authority.role}
                {authority.is_decision_maker && ' (Decisor)'}
              </span>
            )}
          />
          <BANTItem 
            label="Need (Necessidade)" 
            icon={<Target className="w-4 h-4 text-purple-500" />} 
            detected={need?.detected ?? false} 
            confidence={need?.confidence ?? 0}
            details={need?.detected && (
              <div className="space-y-1">
                <span>Urgência: {urgencyLabel[need.urgency]}</span>
                {need.pain_points?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {need.pain_points.slice(0, 3).map((point, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {point}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          />
          <BANTItem 
            label="Timeline (Prazo)" 
            icon={<Clock className="w-4 h-4 text-orange-500" />} 
            detected={timeline?.detected ?? false} 
            confidence={timeline?.confidence ?? 0}
            details={timeline?.detected && (
              <span>Prazo: {timeframeLabel[timeline.timeframe]}</span>
            )}
          />
        </div>

        {/* Intent & Action */}
        {qualData && (
          <div className="pt-3 border-t space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Intenção:</span>
              <span>{getIntentLabel(qualData.overall_intent)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ação recomendada:</span>
              <Badge variant="outline" className={actionInfo.color}>
                {actionInfo.label}
              </Badge>
            </div>
          </div>
        )}

        {/* Reasoning */}
        {qualData?.reasoning && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground italic">
              "{qualData.reasoning}"
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
