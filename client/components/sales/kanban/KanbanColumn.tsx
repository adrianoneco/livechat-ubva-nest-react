import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Lead, LeadStatus } from '@/hooks/sales/useLeads';
import { KanbanCard } from './KanbanCard';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KanbanColumnProps {
  id: LeadStatus;
  title: string;
  leads: Lead[];
  color: string;
  icon: React.ReactNode;
  onLeadClick?: (lead: Lead) => void;
  onAddLead?: (status: LeadStatus) => void;
}

export const KanbanColumn = ({
  id,
  title,
  leads,
  color,
  icon,
  onLeadClick,
  onAddLead,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  const totalValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
    }).format(value);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-72 shrink-0 bg-muted/30 rounded-lg border transition-colors',
        isOver && 'border-primary bg-primary/5'
      )}
    >
      {/* Column Header */}
      <div className={cn('p-3 border-b rounded-t-lg', color)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="font-semibold">{title}</h3>
            <span className="text-xs bg-background/80 px-2 py-0.5 rounded-full">
              {leads.length}
            </span>
          </div>
          {onAddLead && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onAddLead(id)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {formatCurrency(totalValue)}
        </div>
      </div>

      {/* Cards Container */}
      <ScrollArea className="flex-1 p-2">
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {leads.map((lead) => (
              <KanbanCard
                key={lead.id}
                lead={lead}
                onClick={() => onLeadClick?.(lead)}
              />
            ))}
          </div>
        </SortableContext>
        
        {leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">Nenhum lead</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
