import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, CheckSquare, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { WEBHOOK_EVENT_CATEGORIES, Webhook } from '@/hooks/webhooks/useWebhooks';

interface WebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook?: Webhook | null;
  createWebhook: (data: any) => void;
  updateWebhook: (data: any) => void;
  isCreating: boolean;
  isUpdating: boolean;
}

type CategoryKey = keyof typeof WEBHOOK_EVENT_CATEGORIES;

export function WebhookDialog({ 
  open, 
  onOpenChange, 
  webhook,
  createWebhook,
  updateWebhook,
  isCreating,
  isUpdating
}: WebhookDialogProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('whatsapp');
  const dialogRef = useRef<HTMLDivElement>(null);

  const webhookId = webhook?.id;

  useEffect(() => {
    if (open && webhook) {
      setName(webhook.name);
      setUrl(webhook.url);
      setSecretKey(webhook.secret_key || '');
      setSelectedEvents([...webhook.events]);
      setActiveTab('whatsapp');
    } else if (open && !webhook) {
      setName('');
      setUrl('');
      setSecretKey('');
      setSelectedEvents([]);
      setActiveTab('whatsapp');
    }
  }, [webhookId, open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const categorySelectedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(WEBHOOK_EVENT_CATEGORIES).forEach(([key, category]) => {
      counts[key] = category.events.filter(e => selectedEvents.includes(e.value)).length;
    });
    return counts;
  }, [selectedEvents]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      name,
      url,
      secret_key: secretKey || undefined,
      events: selectedEvents,
    };

    if (webhook) {
      updateWebhook({ id: webhook.id, ...data });
    } else {
      createWebhook(data);
    }
    
    onOpenChange(false);
  };

  const handleEventToggle = (event: string) => {
    setSelectedEvents(prev =>
      prev.includes(event)
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  };

  const handleSelectAllInCategory = (categoryKey: CategoryKey) => {
    const categoryEvents = WEBHOOK_EVENT_CATEGORIES[categoryKey].events.map(e => e.value);
    const allSelected = categoryEvents.every(e => selectedEvents.includes(e));
    
    if (allSelected) {
      setSelectedEvents(prev => prev.filter(e => !categoryEvents.includes(e)));
    } else {
      setSelectedEvents(prev => [...new Set([...prev, ...categoryEvents])]);
    }
  };

  const handleSelectAll = () => {
    const allEvents = Object.values(WEBHOOK_EVENT_CATEGORIES)
      .flatMap(category => category.events.map(e => e.value));
    
    if (selectedEvents.length === allEvents.length) {
      setSelectedEvents([]);
    } else {
      setSelectedEvents(allEvents);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  };

  if (!open) return null;

  const isSubmitting = isCreating || isUpdating;
  const totalEvents = Object.values(WEBHOOK_EVENT_CATEGORIES)
    .flatMap(category => category.events).length;
  
  const activeCategory = WEBHOOK_EVENT_CATEGORIES[activeTab as CategoryKey];

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80" />
      
      {/* Dialog */}
      <div 
        ref={dialogRef}
        className="relative z-50 w-full max-w-[700px] max-h-[90vh] bg-background border rounded-lg shadow-lg flex flex-col overflow-hidden mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold">{webhook ? 'Editar Webhook' : 'Novo Webhook'}</h2>
            <p className="text-sm text-muted-foreground">
              Configure um endpoint para receber notificações de eventos
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 px-6 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Nome</Label>
              <Input
                id="webhook-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Meu webhook"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-secret">Chave Secreta (opcional)</Label>
              <Input
                id="webhook-secret"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Header X-Webhook-Secret"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.exemplo.com/webhook"
              required
            />
          </div>

          <div className="flex flex-col flex-1 min-h-0 space-y-2">
            <div className="flex items-center justify-between flex-shrink-0">
              <Label>Eventos</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {selectedEvents.length} / {totalEvents} selecionados
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedEvents.length === totalEvents ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Desmarcar todos
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Marcar todos
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Custom tabs */}
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-lg flex-shrink-0">
                {Object.entries(WEBHOOK_EVENT_CATEGORIES).map(([key, category]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5",
                      activeTab === key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    {category.label}
                    {categorySelectedCounts[key] > 0 && (
                      <Badge 
                        variant="default" 
                        className="h-5 min-w-5 px-1.5 text-xs"
                      >
                        {categorySelectedCounts[key]}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 mt-2 rounded-md border overflow-auto" style={{ maxHeight: '320px' }}>
                {activeCategory && (
                  <div className="p-3">
                    <div className="flex items-center justify-between pb-3 border-b mb-3">
                      <div>
                        <p className="text-sm font-medium">{activeCategory.label}</p>
                        <p className="text-xs text-muted-foreground">{activeCategory.description}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectAllInCategory(activeTab as CategoryKey)}
                      >
                        {activeCategory.events.every(e => selectedEvents.includes(e.value)) ? (
                          <>
                            <Square className="h-4 w-4 mr-1" />
                            Desmarcar
                          </>
                        ) : (
                          <>
                            <CheckSquare className="h-4 w-4 mr-1" />
                            Marcar todos
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {activeCategory.events.map((event) => (
                        <div 
                          key={event.value} 
                          className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => handleEventToggle(event.value)}
                        >
                          <input
                            type="checkbox"
                            id={`event-${event.value}`}
                            checked={selectedEvents.includes(event.value)}
                            onChange={() => handleEventToggle(event.value)}
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                          />
                          <div className="flex-1">
                            <label 
                              htmlFor={`event-${event.value}`} 
                              className="text-sm font-normal cursor-pointer block"
                            >
                              {event.label}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {event.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || selectedEvents.length === 0}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {webhook ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
