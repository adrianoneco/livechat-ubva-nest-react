import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSectors } from '@/hooks/useSectors';
import { useKanbanConfig, DEFAULT_COLUMNS } from '@/hooks/sales/useKanbanConfig';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Settings, RotateCcw, Save, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface KanbanColumnConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KanbanColumnConfigModal({ open, onOpenChange }: KanbanColumnConfigModalProps) {
  const { isAdmin, getSectorIds } = useAuth();
  const userSectorIds = getSectorIds();
  const { sectors } = useSectors();

  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [editedTitles, setEditedTitles] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { columnsConfig, isLoading, updateColumnTitle, resetToDefault } = useKanbanConfig(
    selectedSectorId || null
  );

  // Filter sectors based on user role
  const availableSectors = isAdmin 
    ? sectors 
    : sectors.filter(s => userSectorIds.includes(s.id));

  // Initialize edited titles when config loads
  useEffect(() => {
    if (columnsConfig) {
      const titles: Record<string, string> = {};
      DEFAULT_COLUMNS.forEach(col => {
        titles[col.id] = columnsConfig[col.id]?.custom_title || col.title;
      });
      setEditedTitles(titles);
    }
  }, [columnsConfig]);

  // Set default sector on open
  useEffect(() => {
    if (open && !selectedSectorId && availableSectors.length > 0) {
      setSelectedSectorId(availableSectors[0].id);
    }
  }, [open, availableSectors, selectedSectorId]);

  const handleTitleChange = (columnId: string, newTitle: string) => {
    setEditedTitles(prev => ({
      ...prev,
      [columnId]: newTitle,
    }));
  };

  const handleSave = async () => {
    if (!selectedSectorId) {
      toast.error('Selecione um setor');
      return;
    }

    setIsSaving(true);
    try {
      // Save all changed titles
      for (const col of DEFAULT_COLUMNS) {
        const newTitle = editedTitles[col.id];
        const currentTitle = columnsConfig?.[col.id]?.custom_title || col.title;

        if (newTitle && newTitle !== currentTitle) {
          await updateColumnTitle.mutateAsync({
            columnId: col.id,
            customTitle: newTitle,
          });
        }
      }
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedSectorId) return;

    try {
      await resetToDefault.mutateAsync(undefined);
      // Reset local state to defaults
      const defaults: Record<string, string> = {};
      DEFAULT_COLUMNS.forEach(col => {
        defaults[col.id] = col.title;
      });
      setEditedTitles(defaults);
    } catch (error) {
      console.error('Error resetting config:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configurar Colunas do Kanban
          </DialogTitle>
          <DialogDescription>
            Personalize os nomes das colunas do Kanban para cada setor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Sector selector */}
          <div className="space-y-2">
            <Label htmlFor="sector">Setor</Label>
            <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                {availableSectors.map((sector) => (
                  <SelectItem key={sector.id} value={sector.id}>
                    {sector.name}
                    {sector.instance_name && (
                      <span className="text-muted-foreground ml-2">
                        ({sector.instance_name})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Column titles editor */}
          {selectedSectorId && (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {DEFAULT_COLUMNS.map((col) => (
                  <div key={col.id} className="flex items-center gap-3">
                    <div 
                      className={`w-3 h-3 rounded-full ${col.color}`}
                      title={col.id}
                    />
                    <div className="flex-1">
                      <Label htmlFor={`col-${col.id}`} className="text-xs text-muted-foreground">
                        {col.title} (padrão)
                      </Label>
                      <Input
                        id={`col-${col.id}`}
                        value={editedTitles[col.id] || ''}
                        onChange={(e) => handleTitleChange(col.id, e.target.value)}
                        placeholder={col.title}
                        className="mt-1"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {!selectedSectorId && availableSectors.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum setor disponível para configuração.
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!selectedSectorId || isSaving || resetToDefault.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Resetar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedSectorId || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
