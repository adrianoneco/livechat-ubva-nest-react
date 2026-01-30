import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { useSectors, type SectorWithInstance } from "@/hooks/useSectors";
import { Ticket, Bot, MessageSquare, Sparkles, Loader2, Users, User, Search, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/api/client";
import { invokeFunction } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

// Available template variables for ticket messages
const TEMPLATE_VARIABLES = [
  { key: '{{clienteNome}}', label: 'Nome do Cliente', description: 'Nome do contato/cliente' },
  { key: '{{clienteTelefone}}', label: 'Telefone', description: 'Número de telefone do cliente' },
  { key: '{{atendenteNome}}', label: 'Nome do Atendente', description: 'Nome do atendente atribuído' },
  { key: '{{ticketNumero}}', label: 'Nº do Ticket', description: 'Número do protocolo' },
  { key: '{{setorNome}}', label: 'Nome do Setor', description: 'Nome do setor atual' },
  { key: '{{dataAtual}}', label: 'Data Atual', description: 'Data no formato DD/MM/AAAA' },
  { key: '{{horaAtual}}', label: 'Hora Atual', description: 'Hora no formato HH:MM' },
];

interface SectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sector?: SectorWithInstance;
}

interface FormData {
  name: string;
  description: string;
  instance_ids: string[];
  is_default: boolean;
  tipo_atendimento: 'humano' | 'chatbot';
  gera_ticket: boolean;
  gera_ticket_usuarios: boolean;
  gera_ticket_grupos: boolean;
  grupos_permitidos_todos: boolean;
  mensagem_boas_vindas: string;
  mensagem_encerramento: string;
  mensagem_reabertura: string;
}

interface GroupContact {
  id: string;
  phone_number: string;
  name: string;
}

export function SectorDialog({
  open,
  onOpenChange,
  sector,
}: SectorDialogProps) {
  const { instances = [] } = useWhatsAppInstances();
  const { createSector, updateSector } = useSectors();
  const { toast } = useToast();
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [activeTextareaField, setActiveTextareaField] = useState<'mensagem_boas_vindas' | 'mensagem_encerramento' | 'mensagem_reabertura' | null>(null);

  const { register, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      name: "",
      description: "",
      instance_ids: [],
      is_default: false,
      tipo_atendimento: "humano",
      gera_ticket: false,
      gera_ticket_usuarios: false,
      gera_ticket_grupos: false,
      grupos_permitidos_todos: true,
      mensagem_boas_vindas: "",
      mensagem_encerramento: "",
      mensagem_reabertura: "",
    },
  });

  const geraTicketUsuarios = watch("gera_ticket_usuarios");
  const geraTicketGrupos = watch("gera_ticket_grupos");
  const geraTicket = geraTicketUsuarios || geraTicketGrupos;
  const gruposPermitidosTodos = watch("grupos_permitidos_todos");
  const instanceIds = watch("instance_ids");
  const tipoAtendimento = watch("tipo_atendimento");

  // Fetch group contacts for the selected instances
  const { data: groupContacts = [] } = useQuery({
    queryKey: ['group-contacts', instanceIds],
    queryFn: async () => {
      if (!instanceIds || instanceIds.length === 0) return [];
      const { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('id, phone_number, name')
        .is('deleted_at', null)
        .in('instance_id', instanceIds)
        .eq('is_group', true)
        .order('name');
      // Exclude soft-deleted groups
      // NOTE: RLS will also enforce this, but add explicit client-side filter
      // in case the database isn't migrated yet.
      // (supabase-js supports .is for IS NULL checks)
      // If the query builder ignores the duplicate .is call, the RLS policy will still apply.
      if (error) throw error;
      return data as GroupContact[];
    },
    enabled: instanceIds && instanceIds.length > 0,
  });

  // Fetch allowed groups for this sector
  const { data: allowedGroups = [] } = useQuery({
    queryKey: ['sector-allowed-groups', sector?.id],
    queryFn: async () => {
      if (!sector?.id) return [];
      const { data, error } = await supabase
        .from('sector_allowed_groups')
        .select('group_phone_number')
        .eq('sector_id', sector.id);
      if (error) throw error;
      return data.map(g => g.group_phone_number);
    },
    enabled: !!sector?.id,
  });

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!groupSearch) return groupContacts;
    const search = groupSearch.toLowerCase();
    return groupContacts.filter(g => 
      g.name?.toLowerCase().includes(search) || 
      g.phone_number.includes(search)
    );
  }, [groupContacts, groupSearch]);

  // Update selected groups when allowedGroups loads
  useEffect(() => {
    if (allowedGroups.length > 0) {
      setSelectedGroups(allowedGroups);
    }
  }, [allowedGroups]);

  useEffect(() => {
    if (sector) {
      // Usar instance_ids se disponível, senão usar instance_id legado
      const sectorInstanceIds = (sector as any).instance_ids?.length > 0 
        ? (sector as any).instance_ids 
        : sector.instance_id ? [sector.instance_id] : [];
      
      reset({
        name: sector.name,
        description: sector.description || "",
        instance_ids: sectorInstanceIds,
        is_default: sector.is_default,
        tipo_atendimento: sector.tipo_atendimento || "humano",
        gera_ticket: sector.gera_ticket || false,
        gera_ticket_usuarios: (sector as any).gera_ticket_usuarios || sector.gera_ticket || false,
        gera_ticket_grupos: (sector as any).gera_ticket_grupos || false,
        grupos_permitidos_todos: (sector as any).grupos_permitidos_todos !== false,
        mensagem_boas_vindas: sector.mensagem_boas_vindas || "",
        mensagem_encerramento: sector.mensagem_encerramento || "",
        mensagem_reabertura: (sector as any).mensagem_reabertura || "",
      });
    } else {
      reset({
        name: "",
        description: "",
        instance_ids: instances.length === 1 ? [instances[0].id] : [],
        is_default: false,
        tipo_atendimento: "humano",
        gera_ticket: false,
        gera_ticket_usuarios: false,
        gera_ticket_grupos: false,
        grupos_permitidos_todos: true,
        mensagem_boas_vindas: "",
        mensagem_encerramento: "",
        mensagem_reabertura: "",
      });
      setSelectedGroups([]);
    }
  }, [sector, instances, reset]);

  const generateWithAI = async (field: keyof FormData, context: string) => {
    setGeneratingField(field);
    try {
      const prompts: Record<string, string> = {
        mensagem_boas_vindas: `Crie uma mensagem de boas-vindas curta e profissional para um sistema de tickets de suporte. 
A mensagem deve:
- Informar que o ticket foi aberto
- Ser acolhedora e profissional
- Ter no máximo 2-3 frases
- Pode usar emojis moderadamente

Contexto do setor: ${context || 'Atendimento ao cliente'}

Importante: quando fizer referência ao cliente ou ao ticket, use as variáveis de template exatamente assim: {{clienteNome}}, {{ticketNumero}}, {{dataAtual}}, {{horaAtual}}, {{atendenteNome}}.`,
        
        mensagem_encerramento: `Crie uma mensagem de encerramento curta e profissional para um sistema de tickets de suporte.
A mensagem deve:
- Informar que o atendimento foi encerrado
- Solicitar avaliação do atendimento de 1 a 5
- Ser cordial
- Ter no máximo 2-3 frases
- Pode usar emojis moderadamente

Contexto do setor: ${context || 'Atendimento ao cliente'}

Importante: quando fizer referência ao cliente ou ao ticket, use as variáveis de template exatamente assim: {{clienteNome}}, {{ticketNumero}}, {{dataAtual}}, {{horaAtual}}, {{atendenteNome}}.`,

        mensagem_reabertura: `Crie uma mensagem curta e profissional para informar que um ticket foi reaberto.
A mensagem deve:
- Informar que o ticket foi reaberto
- Indicar que o atendimento será retomado em breve
- Ser acolhedora
- Ter no máximo 2-3 frases
- Pode usar emojis moderadamente

Contexto do setor: ${context || 'Atendimento ao cliente'}

Importante: quando fizer referência ao cliente ou ao ticket, use as variáveis de template exatamente assim: {{clienteNome}}, {{ticketNumero}}, {{dataAtual}}, {{horaAtual}}, {{atendenteNome}}.`,
      };

      const prompt = prompts[field];
      if (!prompt) return;

      const { data, error } = await invokeFunction('compose-whatsapp-message', {
        message: prompt,
        action: 'expand'
      });

      if (error) throw error;

      // Server returns composedText field
      if (data?.composedText) {
        setValue(field, data.composedText);
        toast({
          title: "Mensagem gerada",
          description: "A mensagem foi gerada com sucesso pela IA.",
        });
      } else {
        throw new Error('Resposta da IA vazia');
      }
    } catch (error) {
      console.error('Error generating with AI:', error);
      toast({
        title: "Erro ao gerar mensagem",
        description: "Não foi possível gerar a mensagem com IA. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setGeneratingField(null);
    }
  };

  // Insert variable at the end of the active textarea field
  const insertVariable = (variable: string) => {
    const activeField = activeTextareaField || 'mensagem_boas_vindas';
    const currentValue = watch(activeField) as string || '';
    setValue(activeField, currentValue + variable);
  };

  // Copy variable to clipboard
  const copyVariable = (variable: string) => {
    navigator.clipboard.writeText(variable);
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const onSubmit = async (data: FormData) => {
    if (data.instance_ids.length === 0) {
      toast({
        title: "Selecione ao menos uma instância",
        variant: "destructive",
      });
      return;
    }

    const geraTicketAtivo = data.gera_ticket_usuarios || data.gera_ticket_grupos;
    
    const payload = {
      name: data.name,
      description: data.description || null,
      instance_id: data.instance_ids[0], // Primeira instância para compatibilidade
      instance_ids: data.instance_ids,
      is_default: data.is_default,
      is_active: true,
      tipo_atendimento: data.tipo_atendimento,
      gera_ticket: geraTicketAtivo,
      gera_ticket_usuarios: data.gera_ticket_usuarios,
      gera_ticket_grupos: data.gera_ticket_grupos,
      grupos_permitidos_todos: data.grupos_permitidos_todos,
      mensagem_boas_vindas: geraTicketAtivo ? (data.mensagem_boas_vindas || null) : null,
      mensagem_encerramento: geraTicketAtivo ? (data.mensagem_encerramento || null) : null,
      mensagem_reabertura: geraTicketAtivo ? (data.mensagem_reabertura || null) : null,
    };

    let sectorId: string;
    
    if (sector) {
      await updateSector.mutateAsync({ id: sector.id, ...payload });
      sectorId = sector.id;
    } else {
      const result = await createSector.mutateAsync(payload);
      sectorId = result.id;
    }

    // Manage allowed groups if groups ticket is enabled and not all groups
    if (data.gera_ticket_grupos && !data.grupos_permitidos_todos) {
      // Delete existing allowed groups
      await supabase
        .from('sector_allowed_groups')
        .delete()
        .eq('sector_id', sectorId);

      // Insert new allowed groups
      if (selectedGroups.length > 0) {
        const groupsToInsert = selectedGroups.map(phoneNumber => {
          const group = groupContacts.find(g => g.phone_number === phoneNumber);
          return {
            sector_id: sectorId,
            group_phone_number: phoneNumber,
            group_name: group?.name || null,
          };
        });
        
        await supabase
          .from('sector_allowed_groups')
          .insert(groupsToInsert);
      }
    } else if (sector) {
      // If all groups are allowed or groups ticket is disabled, clear the allowed list
      await supabase
        .from('sector_allowed_groups')
        .delete()
        .eq('sector_id', sectorId);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {sector ? "Editar Setor" : "Novo Setor"}
          </DialogTitle>
          <DialogDescription>
            Configure os detalhes do setor para organizar sua equipe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Setor</Label>
            <Input
              id="name"
              placeholder="Ex: Suporte, Vendas, Financeiro"
              {...register("name", { required: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Descreva o propósito deste setor..."
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label>Instâncias</Label>
            <div className="rounded-md border p-3 space-y-2">
              {instances.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma instância disponível</p>
              ) : (
                instances.map((instance) => (
                  <div key={instance.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`instance-${instance.id}`}
                      checked={instanceIds.includes(instance.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setValue("instance_ids", [...instanceIds, instance.id]);
                        } else {
                          setValue("instance_ids", instanceIds.filter(id => id !== instance.id));
                        }
                      }}
                    />
                    <Label 
                      htmlFor={`instance-${instance.id}`} 
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {instance.name}
                    </Label>
                  </div>
                ))
              )}
            </div>
            {instanceIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {instanceIds.length} instância(s) selecionada(s)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tipo de Atendimento</Label>
            <Select
              value={watch("tipo_atendimento")}
              onValueChange={(value: 'humano' | 'chatbot') => setValue("tipo_atendimento", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="humano">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    <span>Atendimento Humano</span>
                  </div>
                </SelectItem>
                <SelectItem value="chatbot">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <span>Chatbot (IA)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {tipoAtendimento === 'chatbot' 
                ? 'Respostas automáticas serão geradas por IA'
                : 'Mensagens serão respondidas por atendentes humanos'}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="is_default">Setor Padrão</Label>
              <p className="text-xs text-muted-foreground">
                Novas conversas serão atribuídas a este setor automaticamente
              </p>
            </div>
            <Switch
              id="is_default"
              checked={watch("is_default")}
              onCheckedChange={(checked) => setValue("is_default", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-primary mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="gera_ticket_usuarios">Gera Tickets de Suporte para Usuários</Label>
                <p className="text-xs text-muted-foreground">
                  Ativar sistema de tickets para conversas individuais
                </p>
              </div>
            </div>
            <Switch
              id="gera_ticket_usuarios"
              checked={watch("gera_ticket_usuarios")}
              onCheckedChange={(checked) => setValue("gera_ticket_usuarios", checked)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="gera_ticket_grupos">Gera Tickets de Suporte para Grupos</Label>
                  <p className="text-xs text-muted-foreground">
                    Ativar sistema de tickets para conversas de grupo
                  </p>
                </div>
              </div>
              <Switch
                id="gera_ticket_grupos"
                checked={watch("gera_ticket_grupos")}
                onCheckedChange={(checked) => setValue("gera_ticket_grupos", checked)}
              />
            </div>

            {geraTicketGrupos && (
              <div className="ml-8 space-y-3 rounded-lg border border-border p-4 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="grupos_permitidos_todos"
                    checked={gruposPermitidosTodos}
                    onCheckedChange={(checked) => setValue("grupos_permitidos_todos", !!checked)}
                  />
                  <Label htmlFor="grupos_permitidos_todos" className="text-sm font-normal">
                    Permitir todos os grupos
                  </Label>
                </div>

                {!gruposPermitidosTodos && (
                  <div className="space-y-2">
                    <Label className="text-sm">Selecionar grupos permitidos</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Pesquisar grupos..."
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <ScrollArea className="h-[150px] rounded-md border p-2">
                      {filteredGroups.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {groupContacts.length === 0 ? 'Nenhum grupo encontrado na instância' : 'Nenhum grupo corresponde à pesquisa'}
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {filteredGroups.map((group) => (
                            <div key={group.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted">
                              <Checkbox
                                id={`group-${group.id}`}
                                checked={selectedGroups.includes(group.phone_number)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedGroups(prev => [...prev, group.phone_number]);
                                  } else {
                                    setSelectedGroups(prev => prev.filter(p => p !== group.phone_number));
                                  }
                                }}
                              />
                              <Label htmlFor={`group-${group.id}`} className="text-sm font-normal flex-1 cursor-pointer">
                                {group.name || group.phone_number}
                              </Label>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    {selectedGroups.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedGroups.length} grupo(s) selecionado(s)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {geraTicket && (
            <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/30">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Configurações do Ticket
              </h4>

              {/* Variables Panel */}
              <div className="rounded-lg border border-dashed border-border p-3 bg-background/50">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Variáveis Disponíveis
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    Clique para inserir no campo ativo
                  </span>
                </div>
                <TooltipProvider>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map((variable) => (
                      <Tooltip key={variable.key}>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs font-mono px-2 py-0.5 gap-1"
                            onClick={() => insertVariable(variable.key)}
                          >
                            {variable.key}
                            <button
                              type="button"
                              className="ml-1 hover:text-primary-foreground/80"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyVariable(variable.key);
                              }}
                            >
                              {copiedVar === variable.key ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="font-medium">{variable.label}</p>
                          <p className="text-xs text-muted-foreground">{variable.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mensagem_boas_vindas">Mensagem de Boas-vindas</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI('mensagem_boas_vindas', watch('name'))}
                    disabled={generatingField !== null}
                    className="h-7 text-xs gap-1"
                  >
                    {generatingField === 'mensagem_boas_vindas' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Gerar com IA
                  </Button>
                </div>
                <Textarea
                  id="mensagem_boas_vindas"
                  placeholder="Olá {{clienteNome}}! Seu ticket #{{ticketNumero}} foi aberto. Em breve um atendente irá ajudá-lo."
                  {...register("mensagem_boas_vindas")}
                  rows={2}
                  onFocus={() => setActiveTextareaField('mensagem_boas_vindas')}
                />
                <p className="text-xs text-muted-foreground">
                  Enviada automaticamente quando um novo ticket é criado
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mensagem_reabertura">Mensagem de Reabertura</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI('mensagem_reabertura', watch('name'))}
                    disabled={generatingField !== null}
                    className="h-7 text-xs gap-1"
                  >
                    {generatingField === 'mensagem_reabertura' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Gerar com IA
                  </Button>
                </div>
                <Textarea
                  id="mensagem_reabertura"
                  placeholder="Olá {{clienteNome}}! Seu ticket #{{ticketNumero}} foi reaberto. {{atendenteNome}} irá retomar seu atendimento."
                  {...register("mensagem_reabertura")}
                  rows={2}
                  onFocus={() => setActiveTextareaField('mensagem_reabertura')}
                />
                <p className="text-xs text-muted-foreground">
                  Enviada quando um ticket é reaberto manualmente por um agente
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mensagem_encerramento">Mensagem de Encerramento</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI('mensagem_encerramento', watch('name'))}
                    disabled={generatingField !== null}
                    className="h-7 text-xs gap-1"
                  >
                    {generatingField === 'mensagem_encerramento' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Gerar com IA
                  </Button>
                </div>
                <Textarea
                  id="mensagem_encerramento"
                  placeholder="Olá {{clienteNome}}! Seu atendimento #{{ticketNumero}} foi encerrado. Avalie nosso atendimento de 1 a 5."
                  {...register("mensagem_encerramento")}
                  rows={2}
                  onFocus={() => setActiveTextareaField('mensagem_encerramento')}
                />
                <p className="text-xs text-muted-foreground">
                  Enviada quando o ticket é finalizado, seguida de solicitação de feedback
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createSector.isPending || updateSector.isPending}
            >
              {sector ? "Salvar Alterações" : "Criar Setor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
