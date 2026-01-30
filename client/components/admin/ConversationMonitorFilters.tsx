import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWhatsAppInstances } from '@/hooks/whatsapp';
import { useAgents } from '@/hooks/useAgents';

interface ConversationMonitorFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  instanceId: string;
  onInstanceChange: (value: string) => void;
  agentId: string;
  onAgentChange: (value: string) => void;
}

export function ConversationMonitorFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  instanceId,
  onInstanceChange,
  agentId,
  onAgentChange,
}: ConversationMonitorFiltersProps) {
  const { instances } = useWhatsAppInstances();
  const { agents } = useAgents();

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por contato ou mensagem..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status Filter */}
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-full sm:w-[150px]">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="active">Ativas</SelectItem>
          <SelectItem value="waiting">Aguardando</SelectItem>
          <SelectItem value="closed">Encerradas</SelectItem>
        </SelectContent>
      </Select>

      {/* Instance Filter */}
      <Select value={instanceId} onValueChange={onInstanceChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Instância" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas instâncias</SelectItem>
          {instances.map((instance) => (
            <SelectItem key={instance.id} value={instance.id}>
              {instance.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Agent Filter */}
      <Select value={agentId} onValueChange={onAgentChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Atendente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos atendentes</SelectItem>
          <SelectItem value="unassigned">Sem atendente</SelectItem>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
