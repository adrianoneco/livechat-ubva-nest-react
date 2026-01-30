import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Settings2, Check, ChevronsUpDown } from 'lucide-react';
import { InstanceFilter } from './InstanceFilter';
import { cn } from '@/lib/utils';

interface ConversationFiltersPopoverProps {
  statusFilter: string;
  onStatusChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  instanceFilter: string | null;
  onInstanceChange: (value: string | null) => void;
}

const sortOptions = [
  { value: 'recent', label: '🕐 Mais Recentes' },
  { value: 'unread', label: '🔔 Não Lidas Primeiro' },
  { value: 'waiting', label: '⏳ Aguardando Resposta' },
  { value: 'oldest', label: '📅 Mais Antigas' },
];

const statusOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Em Aberto' },
  { value: 'closed', label: 'Encerradas' },
  { value: 'archived', label: 'Arquivadas' },
];

export function ConversationFiltersPopover({
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
  instanceFilter,
  onInstanceChange,
}: ConversationFiltersPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [localSortBy, setLocalSortBy] = useState<string[]>(sortBy ? [sortBy] : ['recent']);
  const [localStatusFilter, setLocalStatusFilter] = useState<string[]>(
    statusFilter && statusFilter !== 'all' ? [statusFilter] : []
  );
  const [localInstanceFilter, setLocalInstanceFilter] = useState<string | null>(instanceFilter);

  // Conta quantos filtros estão ativos
  const activeFiltersCount = [
    statusFilter !== 'all',
    sortBy !== 'recent',
    instanceFilter !== null,
  ].filter(Boolean).length;

  const handleApply = () => {
    // Aplica os filtros
    onSortChange(localSortBy[0] || 'recent');
    onStatusChange(localStatusFilter.length > 0 ? localStatusFilter[0] : 'all');
    onInstanceChange(localInstanceFilter);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalSortBy(['recent']);
    setLocalStatusFilter([]);
    setLocalInstanceFilter(null);
    onStatusChange('all');
    onSortChange('recent');
    onInstanceChange(null);
  };

  const toggleSortItem = (value: string) => {
    setLocalSortBy(prev => {
      if (prev.includes(value)) {
        const newValues = prev.filter(v => v !== value);
        return newValues.length > 0 ? newValues : ['recent'];
      } else {
        return [...prev, value];
      }
    });
  };

  const toggleStatusItem = (value: string) => {
    if (value === 'all') {
      setLocalStatusFilter([]);
    } else {
      setLocalStatusFilter(prev => {
        if (prev.includes(value)) {
          return prev.filter(v => v !== value);
        } else {
          return [...prev, value];
        }
      });
    }
  };

  const getSortLabel = () => {
    if (localSortBy.length === 0) return 'Selecione...';
    if (localSortBy.length === 1) {
      const selected = sortOptions.find(opt => opt.value === localSortBy[0]);
      return selected ? selected.label : 'Selecione...';
    }
    return `${localSortBy.length} selecionados`;
  };

  const getStatusLabel = () => {
    if (localStatusFilter.length === 0) return 'Todas';
    if (localStatusFilter.length === 1) {
      const selected = statusOptions.find(opt => opt.value === localStatusFilter[0]);
      return selected ? selected.label : 'Todas';
    }
    return `${localStatusFilter.length} selecionados`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-8 w-8" title="Filtros">
          <Settings2 className="h-4 w-4" />
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center rounded-full text-[10px]"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-1">Filtros Avançados</h4>
            <p className="text-xs text-muted-foreground">
              Refine sua busca com filtros adicionais
            </p>
          </div>

          {/* Ordenação */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ordenação</label>
            <Popover open={sortOpen} onOpenChange={setSortOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={sortOpen}
                  className="w-full justify-between"
                >
                  {getSortLabel()}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="Buscar ordenação..." />
                  <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
                  <CommandGroup>
                    {sortOptions.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          toggleSortItem(option.value);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            localSortBy.includes(option.value) ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Popover open={statusOpen} onOpenChange={setStatusOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={statusOpen}
                  className="w-full justify-between"
                >
                  {getStatusLabel()}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="Buscar status..." />
                  <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
                  <CommandGroup>
                    {statusOptions.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          toggleStatusItem(option.value);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            (option.value === 'all' 
                              ? localStatusFilter.length === 0 
                              : localStatusFilter.includes(option.value))
                              ? "opacity-100" 
                              : "opacity-0"
                          )}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Instância */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Instância</label>
            <InstanceFilter
              selectedInstance={localInstanceFilter}
              onInstanceChange={setLocalInstanceFilter}
            />
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleClear}
            >
              Limpar
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleApply}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
