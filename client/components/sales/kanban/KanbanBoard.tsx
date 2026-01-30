import { useState, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { useLeads, Lead, LeadStatus, KanbanViewFilters } from '@/hooks/sales/useLeads';
import { useLeadStatusHistory } from '@/hooks/sales/useLeadStatusHistory';
import { useKanbanConfig } from '@/hooks/sales/useKanbanConfig';
import { useAuth } from '@/contexts/AuthContext';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { LeadDetailModal } from './LeadDetailModal';
import { NewLeadModal } from './NewLeadModal';
import { KanbanFilters, KanbanViewMode } from './KanbanFilters';
import { KanbanColumnConfigModal } from './KanbanColumnConfigModal';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { 
  UserPlus, 
  MessageCircle, 
  CheckCircle, 
  FileText, 
  Handshake,
  Trophy,
  XCircle,
  Settings,
} from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const DEFAULT_COLUMNS: {
  id: LeadStatus;
  title: string;
  color: string;
  icon: React.ReactNode;
}[] = [
  { 
    id: 'new', 
    title: 'Novo', 
    color: 'bg-blue-500/20',
    icon: <UserPlus className="w-4 h-4 text-blue-400" />,
  },
  { 
    id: 'contacted', 
    title: 'Em Contato', 
    color: 'bg-sky-500/20',
    icon: <MessageCircle className="w-4 h-4 text-sky-400" />,
  },
  { 
    id: 'qualified', 
    title: 'Qualificado', 
    color: 'bg-yellow-500/20',
    icon: <CheckCircle className="w-4 h-4 text-yellow-400" />,
  },
  { 
    id: 'proposal', 
    title: 'Proposta', 
    color: 'bg-orange-500/20',
    icon: <FileText className="w-4 h-4 text-orange-400" />,
  },
  { 
    id: 'negotiation', 
    title: 'Negociação', 
    color: 'bg-purple-500/20',
    icon: <Handshake className="w-4 h-4 text-purple-400" />,
  },
  { 
    id: 'won', 
    title: 'Ganho', 
    color: 'bg-green-500/20',
    icon: <Trophy className="w-4 h-4 text-green-400" />,
  },
  { 
    id: 'lost', 
    title: 'Perdido', 
    color: 'bg-red-500/20',
    icon: <XCircle className="w-4 h-4 text-red-400" />,
  },
];

export const KanbanBoard = () => {
  const { user, isAdmin, isSupervisor } = useAuth();
  
  // Filter state for admin/supervisor
  const [viewMode, setViewMode] = useState<KanbanViewMode>('all');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Get kanban config for selected sector
  const { getColumnTitle } = useKanbanConfig(selectedSectorId);

  // Build columns with custom titles
  const COLUMNS = useMemo(() => {
    return DEFAULT_COLUMNS.map(col => ({
      ...col,
      title: getColumnTitle(col.id),
    }));
  }, [getColumnTitle, selectedSectorId]);

  // Build filters based on role and view mode
  const filters = useMemo<KanbanViewFilters>(() => {
    // Agents only see their own leads (RLS enforces this, but we also filter client-side for UX)
    if (!isAdmin && !isSupervisor) {
      return { assignedTo: user?.id };
    }
    
    // Admin/Supervisor filters
    if (viewMode === 'member' && selectedMemberId) {
      return { selectedMemberId };
    }
    if (viewMode === 'sector' && selectedSectorId) {
      return { selectedSectorId };
    }
    
    return {}; // All leads
  }, [isAdmin, isSupervisor, user?.id, viewMode, selectedMemberId, selectedSectorId]);

  const { leads: leadsRaw, isLoading, updateLeadStatus } = useLeads(filters);

  // Defensive: ensure leads is an array
  const leads = useMemo(() => {
    if (Array.isArray(leadsRaw)) {
      return leadsRaw;
    }
    if (leadsRaw && typeof leadsRaw === 'object' && Array.isArray((leadsRaw as any).data)) {
      return (leadsRaw as any).data;
    }
    return [] as typeof leadsRaw;
  }, [leadsRaw]);
  const { recordStatusChange } = useLeadStatusHistory();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [newLeadStatus, setNewLeadStatus] = useState<LeadStatus | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const leadsByStatus = useMemo(() => {
    const grouped: Record<LeadStatus, Lead[]> = {
      new: [],
      contacted: [],
      qualified: [],
      proposal: [],
      negotiation: [],
      won: [],
      lost: [],
    };

    leads.forEach((lead) => {
      if (grouped[lead.status]) {
        grouped[lead.status].push(lead);
      }
    });

    return grouped;
  }, [leads]);

  const activeLead = useMemo(() => {
    if (!activeId) return null;
    return leads.find((l) => l.id === activeId) || null;
  }, [activeId, leads]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = active.id as string;
    const newStatus = over.id as LeadStatus;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    const oldStatus = lead.status;

    try {
      // Update lead status
      await updateLeadStatus.mutateAsync({
        id: leadId,
        status: newStatus,
      });

      // Record history
      await recordStatusChange.mutateAsync({
        leadId,
        oldStatus,
        newStatus,
      });

      toast.success(`Lead movido para "${COLUMNS.find(c => c.id === newStatus)?.title}"`);
    } catch (error) {
      toast.error('Erro ao mover lead');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      {/* Admin/Supervisor Filters */}
      <div className="flex items-center justify-between mb-2">
        <KanbanFilters
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedMemberId={selectedMemberId}
          onMemberChange={setSelectedMemberId}
          selectedSectorId={selectedSectorId}
          onSectorChange={setSelectedSectorId}
        />
        
        {(isAdmin || isSupervisor) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfigModal(true)}
            className="ml-auto"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurar Colunas
          </Button>
        )}
      </div>

      <ScrollArea className="w-full">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 p-4 min-h-[600px]">
            {COLUMNS.map((column) => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                color={column.color}
                icon={column.icon}
                leads={leadsByStatus[column.id]}
                onLeadClick={setSelectedLead}
                onAddLead={setNewLeadStatus}
              />
            ))}
          </div>

          <DragOverlay>
            {activeLead && <KanbanCard lead={activeLead} />}
          </DragOverlay>
        </DndContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <LeadDetailModal
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      />

      <NewLeadModal
        open={!!newLeadStatus}
        onClose={() => setNewLeadStatus(null)}
        defaultStatus={newLeadStatus || 'new'}
      />

      <KanbanColumnConfigModal
        open={showConfigModal}
        onOpenChange={setShowConfigModal}
      />
    </>
  );
};
