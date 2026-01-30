import { cn } from '@/lib/utils';
import { getScoreLevel, getScoreColor, getScoreBgColor, getScoreLabel } from '@/hooks/sales/useLeadScore';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LeadScoreIndicatorProps {
  score: number;
  previousScore?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showTrend?: boolean;
  className?: string;
}

export const LeadScoreIndicator = ({
  score,
  previousScore,
  size = 'md',
  showLabel = false,
  showTrend = false,
  className,
}: LeadScoreIndicatorProps) => {
  const level = getScoreLevel(score);
  const colorClass = getScoreColor(score);
  const bgClass = getScoreBgColor(score);
  const label = getScoreLabel(score);
  
  const scoreChange = previousScore !== undefined ? score - previousScore : 0;

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base font-semibold',
  };

  const TrendIcon = scoreChange > 0 ? TrendingUp : scoreChange < 0 ? TrendingDown : Minus;
  const trendColorClass = scoreChange > 0 ? 'text-green-500' : scoreChange < 0 ? 'text-red-500' : 'text-muted-foreground';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1.5', className)}>
            <div
              className={cn(
                'rounded-full border flex items-center justify-center font-medium',
                sizeClasses[size],
                bgClass,
                colorClass
              )}
            >
              {score}
            </div>
            
            {showLabel && (
              <span className={cn('text-xs', colorClass)}>
                {label}
              </span>
            )}
            
            {showTrend && scoreChange !== 0 && (
              <div className={cn('flex items-center gap-0.5', trendColorClass)}>
                <TrendIcon className="w-3 h-3" />
                <span className="text-xs">
                  {scoreChange > 0 ? '+' : ''}{scoreChange}
                </span>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">Score: {score}/100</p>
            <p className="text-muted-foreground">{label}</p>
            {previousScore !== undefined && scoreChange !== 0 && (
              <p className={trendColorClass}>
                {scoreChange > 0 ? 'Aumento' : 'Queda'} de {Math.abs(scoreChange)} pontos
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
