import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Inbox, User, Settings2, GripVertical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getFilterPillsSettings, saveFilterPillsSettings, FilterPillsSettingsData, FilterType } from "@/components/settings/FilterPillsSettings";

interface QuickFilterPillsProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  unreadCount?: number;
  waitingCount?: number;
  queueCount?: number;
  myConversationsCount?: number;
}

const filterLabels: Record<FilterType, string> = {
  all: "Todas",
  unread: "Não lidas",
  waiting: "Aguardando",
  queue: "Na Fila",
  mine: "Minhas",
};

const QuickFilterPills = ({ 
  activeFilter, 
  onFilterChange,
  unreadCount = 0,
  waitingCount = 0,
  queueCount = 0,
  myConversationsCount = 0
}: QuickFilterPillsProps) => {
  const [settings, setSettings] = useState<FilterPillsSettingsData>(getFilterPillsSettings);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [draggedItem, setDraggedItem] = useState<FilterType | null>(null);
  const [dragOverItem, setDragOverItem] = useState<FilterType | null>(null);

  // Listen for settings changes
  useEffect(() => {
    const handleSettingsChange = (e: CustomEvent<FilterPillsSettingsData>) => {
      setSettings(e.detail);
    };
    
    window.addEventListener("filter-pills-settings-changed" as any, handleSettingsChange);
    return () => {
      window.removeEventListener("filter-pills-settings-changed" as any, handleSettingsChange);
    };
  }, []);

  const filterCounts: Record<FilterType, number | undefined> = {
    all: undefined,
    unread: unreadCount,
    waiting: waitingCount,
    queue: queueCount,
    mine: myConversationsCount,
  };

  // Get visible filters in the correct order
  const visibleFiltersList = useMemo(() => {
    return settings.order.filter(key => settings[key] as boolean);
  }, [settings]);

  const updateVisibility = (key: FilterType, value: boolean) => {
    const enabledCount = settings.order.filter(k => settings[k] as boolean).length;
    if (!value && enabledCount <= 1) return;

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveFilterPillsSettings(newSettings);

    // If hiding the active filter, switch to first visible
    if (!value && activeFilter === key) {
      const firstVisible = newSettings.order.find(f => newSettings[f] as boolean);
      if (firstVisible) onFilterChange(firstVisible);
    }
  };

  const handleDragStart = (e: React.DragEvent, filter: FilterType) => {
    setDraggedItem(filter);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, filter: FilterType) => {
    e.preventDefault();
    if (draggedItem && draggedItem !== filter) {
      setDragOverItem(filter);
    }
  };

  const handleDragEnd = () => {
    if (draggedItem && dragOverItem && draggedItem !== dragOverItem) {
      const newOrder = [...settings.order];
      const draggedIndex = newOrder.indexOf(draggedItem);
      const targetIndex = newOrder.indexOf(dragOverItem);
      
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedItem);
      
      const newSettings = { ...settings, order: newOrder };
      setSettings(newSettings);
      saveFilterPillsSettings(newSettings);
    }
    setDraggedItem(null);
    setDragOverItem(null);
  };

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <div className="flex gap-1.5 overflow-x-auto flex-nowrap scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent flex-1">
        {visibleFiltersList.map((filterKey) => {
          const isActive = activeFilter === filterKey;
          const count = filterCounts[filterKey];

          return (
            <Button
              key={filterKey}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange(filterKey)}
              draggable
              onDragStart={(e) => handleDragStart(e, filterKey)}
              onDragOver={(e) => handleDragOver(e, filterKey)}
              onDragEnd={handleDragEnd}
              className={`
                h-7 px-2 text-xs font-medium rounded-full transition-colors whitespace-nowrap flex-shrink-0 cursor-grab active:cursor-grabbing
                ${dragOverItem === filterKey ? 'ring-2 ring-primary ring-offset-1' : ''}
                ${draggedItem === filterKey ? 'opacity-50' : ''}
                ${
                  isActive
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-sidebar-accent text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent/80"
                }
              `}
            >
              {filterLabels[filterKey]}
              {count !== undefined && count > 0 && (
                <Badge
                  variant={isActive ? "secondary" : "default"}
                  className="ml-1 h-4 px-1 text-xs"
                >
                  {count}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* Config button */}
      <Popover open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Configurar filtros"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52">
          <div className="space-y-2">
            <p className="text-sm font-medium mb-3">Filtros visíveis</p>
            {settings.order.map((filterKey) => (
              <div 
                key={filterKey} 
                className={`flex items-center justify-between py-1.5 px-1 rounded transition-colors ${
                  dragOverItem === filterKey ? 'bg-primary/10' : ''
                }`}
                draggable
                onDragStart={(e) => handleDragStart(e, filterKey)}
                onDragOver={(e) => handleDragOver(e, filterKey)}
                onDragEnd={handleDragEnd}
              >
                <div className="flex items-center gap-1.5">
                  <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
                  <Label className="text-xs cursor-pointer">{filterLabels[filterKey]}</Label>
                </div>
                <Switch
                  checked={settings[filterKey] as boolean}
                  onCheckedChange={(checked) => updateVisibility(filterKey, checked)}
                  className="scale-75"
                />
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default QuickFilterPills;
