import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Filter, GripVertical } from "lucide-react";

const FILTER_PILLS_SETTINGS_KEY = "filter-pills-settings";

export type FilterType = "all" | "unread" | "waiting" | "queue" | "mine";

export interface FilterPillsSettingsData {
  all: boolean;
  unread: boolean;
  waiting: boolean;
  queue: boolean;
  mine: boolean;
  order: FilterType[];
}

const defaultOrder: FilterType[] = ["all", "unread", "waiting", "queue", "mine"];

const defaultSettings: FilterPillsSettingsData = {
  all: true,
  unread: true,
  waiting: true,
  queue: true,
  mine: true,
  order: defaultOrder,
};

export function getFilterPillsSettings(): FilterPillsSettingsData {
  try {
    const saved = localStorage.getItem(FILTER_PILLS_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure order array exists and has all filters
      if (!parsed.order || parsed.order.length !== defaultOrder.length) {
        parsed.order = defaultOrder;
      }
      return { ...defaultSettings, ...parsed };
    }
  } catch (e) {
    console.error("Error loading filter pills settings:", e);
  }
  return defaultSettings;
}

export function saveFilterPillsSettings(settings: FilterPillsSettingsData): void {
  localStorage.setItem(FILTER_PILLS_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("filter-pills-settings-changed", { detail: settings }));
}

const filterLabels: Record<FilterType, string> = {
  all: "Todas",
  unread: "Não lidas",
  waiting: "Aguardando",
  queue: "Na Fila",
  mine: "Minhas",
};

export function FilterPillsSettings() {
  const [settings, setSettings] = useState<FilterPillsSettingsData>(getFilterPillsSettings);
  const [draggedItem, setDraggedItem] = useState<FilterType | null>(null);
  const [dragOverItem, setDragOverItem] = useState<FilterType | null>(null);

  const updateSetting = (key: FilterType, value: boolean) => {
    // Ensure at least one filter is always enabled
    const enabledCount = Object.entries(settings)
      .filter(([k, v]) => k !== 'order' && v === true)
      .length;
    if (!value && enabledCount <= 1) return;

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveFilterPillsSettings(newSettings);
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
      
      // Remove dragged item and insert at target position
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filtros Rápidos
        </CardTitle>
        <CardDescription>
          Escolha quais filtros aparecem e arraste para reordenar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {settings.order.map((key) => (
          <div 
            key={key} 
            className={`flex items-center justify-between py-2 px-2 rounded-md transition-colors ${
              dragOverItem === key ? 'bg-primary/10 border border-primary/30' : ''
            } ${draggedItem === key ? 'opacity-50' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, key)}
            onDragOver={(e) => handleDragOver(e, key)}
            onDragEnd={handleDragEnd}
            onDragLeave={() => setDragOverItem(null)}
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
              <span className="text-sm">{filterLabels[key]}</span>
            </div>
            <Switch
              checked={settings[key] as boolean}
              onCheckedChange={(checked) => updateSetting(key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
