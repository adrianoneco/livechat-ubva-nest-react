import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Lead } from '@/hooks/sales/useLeads';
import { Building2, Phone, Mail, DollarSign, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadScoreIndicator } from '../qualification/LeadScoreIndicator';

interface KanbanCardProps {
  lead: Lead;
  onClick?: () => void;
}

export const KanbanCard = ({ lead, onClick }: KanbanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      whatsapp: 'bg-green-500/20 text-green-400 border-green-500/30',
      website: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      referral: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      ads: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      organic: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      other: 'bg-muted text-muted-foreground border-border',
    };
    return colors[source] || colors.other;
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'p-3 cursor-pointer hover:border-primary/50 transition-all group',
        isDragging && 'opacity-50 shadow-lg rotate-2 scale-105'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          className="p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="font-medium truncate">{lead.name}</h4>
              {(lead as any).lead_score > 0 && (
                <LeadScoreIndicator score={(lead as any).lead_score} size="sm" />
              )}
            </div>
            <Badge variant="outline" className={cn('text-xs shrink-0', getSourceColor(lead.source))}>
              {lead.source}
            </Badge>
          </div>

          {lead.company && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="w-3 h-3" />
              <span className="truncate">{lead.company}</span>
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {lead.phone && (
              <div className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{lead.phone}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{lead.email}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1 text-sm font-medium text-primary">
              <DollarSign className="w-3.5 h-3.5" />
              {formatCurrency(lead.value || 0)}
            </div>

            {lead.assigned_agent && (
              <Avatar className="w-6 h-6">
                <AvatarImage src={lead.assigned_agent.avatar_url} />
                <AvatarFallback className="text-[10px]">
                  {lead.assigned_agent.full_name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
            )}
          </div>

          {lead.tags && lead.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {lead.tags.slice(0, 3).map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {lead.tags.length > 3 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{lead.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
