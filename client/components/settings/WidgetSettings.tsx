import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Trash2, Copy, ExternalLink, Code, Settings2, Palette, Clock, Globe, MessageSquare } from 'lucide-react';
import { useWidgetConfigs, useCreateWidgetConfig, useUpdateWidgetConfig, useDeleteWidgetConfig, WidgetConfig } from '@/hooks/useWidgetConfig';
import { useWhatsAppInstances } from '@/hooks/whatsapp/useWhatsAppInstances';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

export function WidgetSettings() {
  const { toast } = useToast();
  const { data: widgets, isLoading } = useWidgetConfigs();
  const { instances } = useWhatsAppInstances();
  const createWidget = useCreateWidgetConfig();
  const updateWidget = useUpdateWidgetConfig();
  const deleteWidget = useDeleteWidgetConfig();
  
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newWidgetName, setNewWidgetName] = useState('');
  const [newWidgetInstance, setNewWidgetInstance] = useState('');
  
  const currentWidget = widgets?.find(w => w.id === selectedWidget);

  const handleCreate = async () => {
    if (!newWidgetName) return;
    
    try {
      await createWidget.mutateAsync({
        name: newWidgetName,
        instance_id: newWidgetInstance === '__none__' ? null : (newWidgetInstance || null),
      });
      setIsCreateDialogOpen(false);
      setNewWidgetName('');
      setNewWidgetInstance('');
      toast({ title: 'Widget criado com sucesso!' });
    } catch (error) {
      toast({ title: 'Erro ao criar widget', variant: 'destructive' });
    }
  };

  const handleUpdate = async (id: string, updates: Partial<WidgetConfig>) => {
    try {
      await updateWidget.mutateAsync({ id, ...updates });
      toast({ title: 'Widget atualizado!' });
    } catch (error) {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWidget.mutateAsync(id);
      setSelectedWidget(null);
      toast({ title: 'Widget excluído' });
    } catch (error) {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const getApiUrl = () => {
    // In development, use the Supabase local URL
    const origin = window.location.origin;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin.replace(/:\d+$/, ':54321') + '/functions/v1/widget-api';
    }
    // In production, use the same origin
    return origin + '/functions/v1/widget-api';
  };

  const getEmbedCode = (widgetId: string) => {
    return `<script src="${window.location.origin}/widget.js" data-widget-id="${widgetId}" data-api-url="${getApiUrl()}" async></script>`;
  };

  const copyEmbedCode = (widgetId: string) => {
    navigator.clipboard.writeText(getEmbedCode(widgetId));
    toast({ title: 'Código copiado!' });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Widget de Chat</h2>
          <p className="text-muted-foreground">Configure widgets de chat para seu site</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Widget
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar novo widget</DialogTitle>
              <DialogDescription>Configure um novo widget de chat para seu site</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do widget</Label>
                <Input
                  value={newWidgetName}
                  onChange={(e) => setNewWidgetName(e.target.value)}
                  placeholder="Ex: Widget do Site Principal"
                />
              </div>
              <div className="space-y-2">
                <Label>Instância WhatsApp (opcional)</Label>
                <Select value={newWidgetInstance} onValueChange={setNewWidgetInstance}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma instância" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma (apenas chat)</SelectItem>
                    {instances?.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se selecionada, as mensagens serão enviadas via WhatsApp
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={!newWidgetName}>
                Criar Widget
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Widgets */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Seus Widgets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {widgets?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum widget configurado
              </p>
            ) : (
              widgets?.map((widget) => (
                <button
                  key={widget.id}
                  onClick={() => setSelectedWidget(widget.id)}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left transition-colors",
                    selectedWidget === widget.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{widget.name}</span>
                    <Badge variant={widget.enabled ? "default" : "secondary"}>
                      {widget.enabled ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  {widget.whatsapp_instances && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {widget.whatsapp_instances.instance_name}
                    </p>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Configurações do Widget */}
        <Card className="lg:col-span-2">
          {!currentWidget ? (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              Selecione um widget para configurar
            </div>
          ) : (
            <>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{currentWidget.name}</CardTitle>
                    <CardDescription>Configure as opções do widget</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={currentWidget.enabled}
                      onCheckedChange={(enabled) => handleUpdate(currentWidget.id, { enabled })}
                    />
                    <span className="text-sm">
                      {currentWidget.enabled ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="general">
                  <TabsList className="mb-4">
                    <TabsTrigger value="general">
                      <Settings2 className="h-4 w-4 mr-2" />
                      Geral
                    </TabsTrigger>
                    <TabsTrigger value="appearance">
                      <Palette className="h-4 w-4 mr-2" />
                      Aparência
                    </TabsTrigger>
                    <TabsTrigger value="messages">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Mensagens
                    </TabsTrigger>
                    <TabsTrigger value="hours">
                      <Clock className="h-4 w-4 mr-2" />
                      Horários
                    </TabsTrigger>
                    <TabsTrigger value="embed">
                      <Code className="h-4 w-4 mr-2" />
                      Instalar
                    </TabsTrigger>
                  </TabsList>

                  {/* Geral */}
                  <TabsContent value="general" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nome do Widget</Label>
                      <Input
                        value={currentWidget.name}
                        onChange={(e) => handleUpdate(currentWidget.id, { name: e.target.value })}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Instância WhatsApp</Label>
                      <Select
                        value={currentWidget.instance_id || '__none__'}
                        onValueChange={(value) => handleUpdate(currentWidget.id, { instance_id: value === '__none__' ? null : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma instância" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma (apenas chat)</SelectItem>
                          {instances?.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.instance_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-4 pt-4">
                      <Label>Campos obrigatórios</Label>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Nome</span>
                          <Switch
                            checked={currentWidget.require_name}
                            onCheckedChange={(require_name) => handleUpdate(currentWidget.id, { require_name })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">E-mail</span>
                          <Switch
                            checked={currentWidget.require_email}
                            onCheckedChange={(require_email) => handleUpdate(currentWidget.id, { require_email })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Telefone (WhatsApp)</span>
                          <Switch
                            checked={currentWidget.require_phone}
                            onCheckedChange={(require_phone) => handleUpdate(currentWidget.id, { require_phone })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-4">
                      <Label>Domínios permitidos</Label>
                      <Textarea
                        value={currentWidget.allowed_domains?.join('\n') || ''}
                        onChange={(e) => handleUpdate(currentWidget.id, {
                          allowed_domains: e.target.value.split('\n').filter(d => d.trim())
                        })}
                        placeholder="exemplo.com&#10;app.exemplo.com&#10;(vazio = todos os domínios)"
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Um domínio por linha. Deixe vazio para permitir todos.
                      </p>
                    </div>

                    <div className="pt-4">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir Widget
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir widget?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. O widget será removido e não funcionará mais nos sites onde está instalado.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(currentWidget.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TabsContent>

                  {/* Aparência */}
                  <TabsContent value="appearance" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Cor principal</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={currentWidget.primary_color}
                          onChange={(e) => handleUpdate(currentWidget.id, { primary_color: e.target.value })}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={currentWidget.primary_color}
                          onChange={(e) => handleUpdate(currentWidget.id, { primary_color: e.target.value })}
                          placeholder="#10B981"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Posição</Label>
                      <Select
                        value={currentWidget.position}
                        onValueChange={(position: any) => handleUpdate(currentWidget.id, { position })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bottom-right">Inferior direito</SelectItem>
                          <SelectItem value="bottom-left">Inferior esquerdo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Tamanho do botão</Label>
                      <Select
                        value={currentWidget.button_size}
                        onValueChange={(button_size: any) => handleUpdate(currentWidget.id, { button_size })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Pequeno</SelectItem>
                          <SelectItem value="medium">Médio</SelectItem>
                          <SelectItem value="large">Grande</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Preview */}
                    <div className="pt-4">
                      <Label>Preview</Label>
                      <div className="mt-2 border rounded-lg p-8 bg-muted/30 relative h-48">
                        <div
                          className={cn(
                            "absolute rounded-full flex items-center justify-center shadow-lg",
                            currentWidget.position === 'bottom-right' ? 'right-4 bottom-4' : 'left-4 bottom-4',
                            currentWidget.button_size === 'small' ? 'w-12 h-12' : currentWidget.button_size === 'large' ? 'w-16 h-16' : 'w-14 h-14'
                          )}
                          style={{ backgroundColor: currentWidget.primary_color }}
                        >
                          <MessageSquare className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Mensagens */}
                  <TabsContent value="messages" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Título de boas-vindas</Label>
                      <Input
                        value={currentWidget.welcome_title}
                        onChange={(e) => handleUpdate(currentWidget.id, { welcome_title: e.target.value })}
                        placeholder="Olá! 👋"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Mensagem de boas-vindas</Label>
                      <Textarea
                        value={currentWidget.welcome_message}
                        onChange={(e) => handleUpdate(currentWidget.id, { welcome_message: e.target.value })}
                        placeholder="Como podemos ajudar você hoje?"
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Mensagem fora do horário</Label>
                      <Textarea
                        value={currentWidget.offline_message}
                        onChange={(e) => handleUpdate(currentWidget.id, { offline_message: e.target.value })}
                        placeholder="Estamos fora do horário de atendimento..."
                        rows={3}
                      />
                    </div>
                  </TabsContent>

                  {/* Horários */}
                  <TabsContent value="hours" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Horário de atendimento</Label>
                        <p className="text-sm text-muted-foreground">
                          Exibe mensagem de offline fora do horário
                        </p>
                      </div>
                      <Switch
                        checked={currentWidget.business_hours_enabled}
                        onCheckedChange={(business_hours_enabled) => handleUpdate(currentWidget.id, { business_hours_enabled })}
                      />
                    </div>

                    {currentWidget.business_hours_enabled && (
                      <div className="space-y-3 pt-4">
                        {DAYS_OF_WEEK.map((day) => {
                          const hours = currentWidget.business_hours?.[day.key] || { start: '09:00', end: '18:00', enabled: true };
                          return (
                            <div key={day.key} className="flex items-center gap-4">
                              <div className="w-24">
                                <span className="text-sm font-medium">{day.label}</span>
                              </div>
                              <Switch
                                checked={hours.enabled}
                                onCheckedChange={(enabled) => handleUpdate(currentWidget.id, {
                                  business_hours: {
                                    ...currentWidget.business_hours,
                                    [day.key]: { ...hours, enabled }
                                  }
                                })}
                              />
                              {hours.enabled && (
                                <>
                                  <Input
                                    type="time"
                                    value={hours.start}
                                    onChange={(e) => handleUpdate(currentWidget.id, {
                                      business_hours: {
                                        ...currentWidget.business_hours,
                                        [day.key]: { ...hours, start: e.target.value }
                                      }
                                    })}
                                    className="w-28"
                                  />
                                  <span className="text-muted-foreground">até</span>
                                  <Input
                                    type="time"
                                    value={hours.end}
                                    onChange={(e) => handleUpdate(currentWidget.id, {
                                      business_hours: {
                                        ...currentWidget.business_hours,
                                        [day.key]: { ...hours, end: e.target.value }
                                      }
                                    })}
                                    className="w-28"
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* Instalar */}
                  <TabsContent value="embed" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Modo do Widget</Label>
                      <p className="text-sm text-muted-foreground">
                        Escolha como o widget será exibido
                      </p>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div 
                          className="border rounded-lg p-4 cursor-pointer hover:border-primary transition-colors"
                          onClick={() => window.open(`/widget.html?id=${currentWidget.id}&mode=widget`, '_blank')}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                              <MessageSquare className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-medium">Widget</h4>
                              <p className="text-xs text-muted-foreground">Botão flutuante</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Aparece como um botão no canto da página que abre um popup de chat.
                          </p>
                        </div>
                        <div 
                          className="border rounded-lg p-4 cursor-pointer hover:border-primary transition-colors"
                          onClick={() => window.open(`/widget.html?id=${currentWidget.id}&mode=page`, '_blank')}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                              <Globe className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-medium">Página</h4>
                              <p className="text-xs text-muted-foreground">Tela cheia</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            O chat ocupa toda a tela, ideal para páginas dedicadas de suporte.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-4">
                      <Label>Código de instalação (Modo Widget)</Label>
                      <p className="text-sm text-muted-foreground">
                        Cole este código antes do fechamento da tag &lt;/body&gt; do seu site
                      </p>
                      <div className="relative">
                        <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                          {getEmbedCode(currentWidget.id)}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2"
                          onClick={() => copyEmbedCode(currentWidget.id)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 pt-4">
                      <Label>Link direto (Modo Página)</Label>
                      <p className="text-sm text-muted-foreground">
                        Use este link para uma página de chat dedicada
                      </p>
                      <div className="flex gap-2">
                        <Input value={`${window.location.origin}/widget.html?id=${currentWidget.id}&mode=page`} readOnly />
                        <Button
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/widget.html?id=${currentWidget.id}&mode=page`);
                            toast({ title: 'Link copiado!' });
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 pt-4">
                      <Label>Testar widget</Label>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => window.open(`/widget.html?id=${currentWidget.id}&mode=widget`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Modo Widget
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => window.open(`/widget.html?id=${currentWidget.id}&mode=page`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Modo Página
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 pt-4">
                      <Label>ID do Widget</Label>
                      <div className="flex gap-2">
                        <Input value={currentWidget.id} readOnly />
                        <Button
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(currentWidget.id);
                            toast({ title: 'ID copiado!' });
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
