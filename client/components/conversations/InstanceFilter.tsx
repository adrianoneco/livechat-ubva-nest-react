import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useWhatsAppInstances } from '@/hooks/whatsapp';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface InstanceFilterProps {
  selectedInstance: string | null;
  onInstanceChange: (instanceId: string | null) => void;
}

export function InstanceFilter({ selectedInstance, onInstanceChange }: InstanceFilterProps) {
  const { instances, isLoading } = useWhatsAppInstances();
  const [open, setOpen] = useState(false);
  const [localInstances, setLocalInstances] = useState<string[]>(
    selectedInstance ? [selectedInstance] : []
  );

  const toggleInstance = (instanceId: string) => {
    if (instanceId === 'all') {
      setLocalInstances([]);
      onInstanceChange(null);
    } else {
      setLocalInstances(prev => {
        if (prev.includes(instanceId)) {
          const newInstances = prev.filter(id => id !== instanceId);
          onInstanceChange(newInstances.length > 0 ? newInstances[0] : null);
          return newInstances;
        } else {
          onInstanceChange(instanceId);
          return [...prev, instanceId];
        }
      });
    }
  };

  const getLabel = () => {
    if (localInstances.length === 0) return 'Todas as Instâncias';
    if (localInstances.length === 1) {
      const instance = instances?.find(i => i.id === localInstances[0]);
      return instance ? instance.name : 'Todas as Instâncias';
    }
    return `${localInstances.length} selecionadas`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {getLabel()}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Buscar instância..." />
          <CommandEmpty>Nenhuma instância encontrada.</CommandEmpty>
          <CommandGroup>
            <CommandItem
              value="all"
              onSelect={() => toggleInstance('all')}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  localInstances.length === 0 ? "opacity-100" : "opacity-0"
                )}
              />
              Todas as Instâncias
            </CommandItem>
            {isLoading ? (
              <CommandItem disabled>Carregando...</CommandItem>
            ) : (
              instances?.map((instance) => (
                <CommandItem
                  key={instance.id}
                  value={instance.id}
                  onSelect={() => toggleInstance(instance.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      localInstances.includes(instance.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {instance.name}
                </CommandItem>
              ))
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
