import { useAuth } from '@/contexts/AuthContext';
import { useAgents } from '@/hooks/useAgents';
import { useSectors } from '@/hooks/useSectors';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Building2, Eye } from 'lucide-react';

export type KanbanViewMode = 'personal' | 'member' | 'sector' | 'all';

interface KanbanFiltersProps {
  viewMode: KanbanViewMode;
  onViewModeChange: (mode: KanbanViewMode) => void;
  selectedMemberId: string | null;
  onMemberChange: (memberId: string | null) => void;
  selectedSectorId: string | null;
  onSectorChange: (sectorId: string | null) => void;
}

export const KanbanFilters = ({
  viewMode,
  onViewModeChange,
  selectedMemberId,
  onMemberChange,
  selectedSectorId,
  onSectorChange,
}: KanbanFiltersProps) => {
  const { isAdmin, isSupervisor } = useAuth();
  const { agents } = useAgents();
  const { sectors } = useSectors();

  // Only admins and supervisors can see filters
  if (!isAdmin && !isSupervisor) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border bg-muted/30">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Eye className="w-4 h-4" />
        <span>Visualização:</span>
      </div>

      {/* View Mode Buttons */}
      <div className="flex gap-1">
        <Button
          variant={viewMode === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            onViewModeChange('all');
            onMemberChange(null);
            onSectorChange(null);
          }}
        >
          Geral
        </Button>
        <Button
          variant={viewMode === 'member' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('member')}
        >
          <Users className="w-4 h-4 mr-1" />
          Por Membro
        </Button>
        <Button
          variant={viewMode === 'sector' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('sector')}
        >
          <Building2 className="w-4 h-4 mr-1" />
          Por Setor
        </Button>
      </div>

      {/* Member Selector */}
      {viewMode === 'member' && (
        <Select
          value={selectedMemberId || 'all'}
          onValueChange={(val) => onMemberChange(val === 'all' ? null : val)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Selecionar membro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os membros</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Sector Selector */}
      {viewMode === 'sector' && (
        <Select
          value={selectedSectorId || 'all'}
          onValueChange={(val) => onSectorChange(val === 'all' ? null : val)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Selecionar setor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os setores</SelectItem>
            {sectors.map((sector) => (
              <SelectItem key={sector.id} value={sector.id}>
                {sector.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};
