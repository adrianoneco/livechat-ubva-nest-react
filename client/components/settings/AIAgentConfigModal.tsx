import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bot, MessageSquare, Clock, AlertTriangle, BookOpen, Brain, Image as ImageIcon, User, Cpu, Zap, Shield, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KnowledgeBaseManager, ResponseTemplatesEditor, LearningExamplesPanel, KnowledgeInsights } from "@/components/ai-agent";
import { useAIAgentConfig, AIAgentConfigInsert } from "@/hooks/ai-agent";
import { Sector } from "@/hooks/useSectors";
import { cn } from "@/lib/utils";

// Modelos disponíveis
const AI_MODELS = [
  { 
    id: "llama-3.1-8b-instant", 
    name: "Llama 3.1 8B",
    description: "Rápido e eficiente",
    icon: Zap,
    speed: "Rápido",
    quality: "Básico"
  },
  { 
    id: "llama-3.3-70b-versatile", 
    name: "Llama 3.3 70B",
    description: "Equilibrado",
    icon: Sparkles,
    speed: "Médio",
    quality: "Alto"
  },
  { 
    id: "mixtral-8x7b-32768", 
    name: "Mixtral 8x7B",
    description: "Raciocínio avançado",
    icon: Brain,
    speed: "Médio",
    quality: "Muito Alto"
  },
  { 
    id: "llama-guard-3-8b", 
    name: "Llama Guard 3",
    description: "Moderação/Segurança",
    icon: Shield,
    speed: "Rápido",
    quality: "Especializado"
  },
];

interface AIAgentConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sector: Sector | null;
}

interface FormData {
  agent_name: string;
  agent_image: string;
  persona_description: string;
  welcome_message: string;
  tone_of_voice: 'professional' | 'friendly' | 'casual';
  default_model: string;
  system_prompt: string;
  is_enabled: boolean;
  auto_reply_enabled: boolean;
  max_auto_replies: number;
  response_delay_seconds: number;
  hybrid_timeout_minutes: number;
  escalation_keywords: string;
  escalation_after_minutes: number;
  escalation_on_negative_sentiment: boolean;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  out_of_hours_message: string;
  business_context: string;
  faq_context: string;
  product_catalog: string;
}

const weekDays = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

export const AIAgentConfigModal = ({ open, onOpenChange, sector }: AIAgentConfigModalProps) => {
  const { config, isLoading, createConfig, updateConfig, toggleEnabled } = useAIAgentConfig(sector?.id);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>({
    defaultValues: {
      agent_name: 'Assistente',
      agent_image: '',
      persona_description: '',
      welcome_message: '',
      tone_of_voice: 'professional',
      default_model: 'llama-3.3-70b-versatile',
      system_prompt: '',
      is_enabled: false,
      auto_reply_enabled: true,
      max_auto_replies: 5,
      response_delay_seconds: 2,
      hybrid_timeout_minutes: 5,
      escalation_keywords: 'falar com humano, atendente, pessoa real',
      escalation_after_minutes: 30,
      escalation_on_negative_sentiment: true,
      working_hours_start: '08:00',
      working_hours_end: '18:00',
      working_days: [1, 2, 3, 4, 5],
      out_of_hours_message: '',
      business_context: '',
      faq_context: '',
      product_catalog: '',
    },
  });

  const isEnabled = watch('is_enabled');

  useEffect(() => {
    if (config) {
      reset({
        agent_name: config.agent_name,
        agent_image: config.agent_image || '',
        persona_description: config.persona_description || '',
        welcome_message: config.welcome_message || '',
        tone_of_voice: config.tone_of_voice,
        default_model: config.default_model || 'llama-3.3-70b-versatile',
        system_prompt: config.system_prompt || '',
        is_enabled: config.is_enabled,
        auto_reply_enabled: config.auto_reply_enabled,
        max_auto_replies: config.max_auto_replies,
        response_delay_seconds: config.response_delay_seconds,
        hybrid_timeout_minutes: (config as any).hybrid_timeout_minutes || 5,
        escalation_keywords: config.escalation_keywords?.join(', ') || '',
        escalation_after_minutes: config.escalation_after_minutes,
        escalation_on_negative_sentiment: config.escalation_on_negative_sentiment,
        working_hours_start: config.working_hours_start,
        working_hours_end: config.working_hours_end,
        working_days: config.working_days,
        out_of_hours_message: config.out_of_hours_message || '',
        business_context: config.business_context || '',
        faq_context: config.faq_context || '',
        product_catalog: config.product_catalog || '',
      });
      // Convert working_days to numbers (PostgreSQL returns strings)
      const daysAsNumbers = (config.working_days || []).map((d: any) => typeof d === 'string' ? parseInt(d, 10) : d);
      setSelectedDays(daysAsNumbers);
    } else {
      reset({
        agent_name: 'Assistente',
        agent_image: '',
        persona_description: '',
        welcome_message: '',
        tone_of_voice: 'professional',
        default_model: 'llama-3.3-70b-versatile',
        system_prompt: '',
        is_enabled: false,
        auto_reply_enabled: true,
        max_auto_replies: 5,
        response_delay_seconds: 2,
        hybrid_timeout_minutes: 5,
        escalation_keywords: 'falar com humano, atendente, pessoa real',
        escalation_after_minutes: 30,
        escalation_on_negative_sentiment: true,
        working_hours_start: '08:00',
        working_hours_end: '18:00',
        working_days: [1, 2, 3, 4, 5],
        out_of_hours_message: '',
        business_context: '',
        faq_context: '',
        product_catalog: '',
      });
      setSelectedDays([1, 2, 3, 4, 5]);
    }
  }, [config, reset]);

  const toggleDay = (day: number) => {
    setSelectedDays(prev => {
      // Normalize to numbers to avoid string/number comparison issues
      const normalized = prev.map((d: any) => typeof d === 'string' ? parseInt(d, 10) : d);
      // Remove duplicates
      const unique = [...new Set(normalized)];
      
      if (unique.includes(day)) {
        return unique.filter(d => d !== day);
      } else {
        return [...unique, day].sort((a, b) => a - b);
      }
    });
  };

  const onSubmit = async (data: FormData) => {
    console.log('[AIAgentConfigModal] onSubmit called with:', { sector: sector?.id, config: config?.id, data });
    if (!sector) {
      console.log('[AIAgentConfigModal] No sector, returning');
      return;
    }

    const configData: AIAgentConfigInsert = {
      sector_id: sector.id,
      agent_name: data.agent_name,
      agent_image: data.agent_image || null,
      persona_description: data.persona_description || null,
      welcome_message: data.welcome_message || null,
      tone_of_voice: data.tone_of_voice,
      default_model: data.default_model,
      system_prompt: data.system_prompt || null,
      is_enabled: data.is_enabled,
      auto_reply_enabled: data.auto_reply_enabled,
      max_auto_replies: data.max_auto_replies,
      response_delay_seconds: data.response_delay_seconds,
      hybrid_timeout_minutes: data.hybrid_timeout_minutes,
      escalation_keywords: data.escalation_keywords.split(',').map(k => k.trim()).filter(Boolean),
      escalation_after_minutes: data.escalation_after_minutes,
      escalation_on_negative_sentiment: data.escalation_on_negative_sentiment,
      working_hours_start: data.working_hours_start,
      working_hours_end: data.working_hours_end,
      working_timezone: 'America/Sao_Paulo',
      working_days: selectedDays,
      out_of_hours_message: data.out_of_hours_message || null,
      business_context: data.business_context || null,
      faq_context: data.faq_context || null,
      product_catalog: data.product_catalog || null,
    };

    console.log('[AIAgentConfigModal] configData:', configData);

    try {
      if (config) {
        console.log('[AIAgentConfigModal] Updating existing config with id:', config.id);
        await updateConfig.mutateAsync({ id: config.id, ...configData });
      } else {
        console.log('[AIAgentConfigModal] Creating new config');
        await createConfig.mutateAsync(configData);
      }
      console.log('[AIAgentConfigModal] Save successful');
    } catch (err) {
      console.error('[AIAgentConfigModal] Save error:', err);
    }

    onOpenChange(false);
  };

  const handleToggleEnabled = async () => {
    if (config) {
      await toggleEnabled.mutateAsync({ id: config.id, enabled: !config.is_enabled });
    }
  };

  if (!sector) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Configurar AI Agent - {sector.name}
          </DialogTitle>
          <DialogDescription>
            Configure o assistente de IA para responder automaticamente às conversas deste setor.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Toggle principal */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Bot className={`h-8 w-8 ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <p className="font-medium">AI Agent</p>
                <p className="text-sm text-muted-foreground">
                  {isEnabled ? 'Ativo - Respondendo automaticamente' : 'Inativo'}
                </p>
              </div>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => setValue('is_enabled', checked)}
            />
          </div>

          <Tabs defaultValue="persona" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="persona">
                <MessageSquare className="h-4 w-4 mr-2" />
                Persona
              </TabsTrigger>
              <TabsTrigger value="behavior">
                <Bot className="h-4 w-4 mr-2" />
                Comportamento
              </TabsTrigger>
              <TabsTrigger value="schedule">
                <Clock className="h-4 w-4 mr-2" />
                Horários
              </TabsTrigger>
              <TabsTrigger value="context">
                <BookOpen className="h-4 w-4 mr-2" />
                Contexto
              </TabsTrigger>
              <TabsTrigger value="dna">
                <Brain className="h-4 w-4 mr-2" />
                DNA
              </TabsTrigger>
            </TabsList>

            <TabsContent value="persona" className="space-y-4 mt-4">
              {/* Agent Identity Section */}
              <div className="flex gap-4 items-start p-4 rounded-lg border bg-muted/30">
                {/* Avatar Preview */}
                <div className="flex-shrink-0">
                  <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/20 flex items-center justify-center">
                    {watch('agent_image') ? (
                      <img 
                        src={watch('agent_image')} 
                        alt="Avatar do Agente" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`absolute inset-0 flex items-center justify-center ${watch('agent_image') ? 'hidden' : ''}`}>
                      <Bot className="h-10 w-10 text-primary/50" />
                    </div>
                  </div>
                </div>
                
                {/* Name and Image Fields */}
                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="agent_name" className="text-sm font-medium flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      Nome do Agente
                    </Label>
                    <Input
                      id="agent_name"
                      {...register('agent_name')}
                      placeholder="Ex: Sofia, Assistente Virtual"
                      className="h-9"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="agent_image" className="text-sm font-medium flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5" />
                      Imagem do Agente (URL)
                    </Label>
                    <Input
                      id="agent_image"
                      {...register('agent_image')}
                      placeholder="https://exemplo.com/avatar.png"
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL de uma imagem para o avatar do assistente virtual
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tone_of_voice">Tom de Voz</Label>
                <Select
                  value={watch('tone_of_voice')}
                  onValueChange={(value: 'professional' | 'friendly' | 'casual') => 
                    setValue('tone_of_voice', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Profissional</SelectItem>
                    <SelectItem value="friendly">Amigável</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Modelo de IA - Compacto */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Modelo de IA
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {AI_MODELS.map((model) => {
                    const ModelIcon = model.icon;
                    const isSelected = watch('default_model') === model.id;
                    return (
                      <div
                        key={model.id}
                        onClick={() => setValue('default_model', model.id)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                          isSelected 
                            ? "border-primary bg-primary/10 ring-1 ring-primary" 
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        )}
                      >
                        <ModelIcon className={cn(
                          "h-4 w-4 flex-shrink-0",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )} />
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            "text-xs font-medium truncate",
                            isSelected ? "text-primary" : ""
                          )}>
                            {model.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {model.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system_prompt" className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  System Prompt (Instruções do Sistema)
                </Label>
                <Textarea
                  id="system_prompt"
                  {...register('system_prompt')}
                  placeholder="Você é um assistente virtual especializado em atendimento ao cliente. Seja sempre educado, prestativo e objetivo nas respostas..."
                  rows={4}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Instruções técnicas para o modelo de IA. Define como ele deve se comportar em nível mais profundo.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="persona_description">Descrição da Persona (Business DNA)</Label>
                <Textarea
                  id="persona_description"
                  {...register('persona_description')}
                  placeholder="Descreva a personalidade do agente, como ele deve se comportar, seus valores e estilo de comunicação..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Esta é a "alma" do seu agente. Seja específico sobre como ele deve agir.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="welcome_message">Mensagem de Boas-vindas</Label>
                <Textarea
                  id="welcome_message"
                  {...register('welcome_message')}
                  placeholder="Olá! 👋 Sou o assistente virtual. Como posso ajudar?"
                  rows={2}
                />
              </div>
            </TabsContent>

            <TabsContent value="behavior" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Resposta Automática</Label>
                  <p className="text-sm text-muted-foreground">
                    Responder automaticamente às mensagens
                  </p>
                </div>
                <Switch
                  checked={watch('auto_reply_enabled')}
                  onCheckedChange={(checked) => setValue('auto_reply_enabled', checked)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_auto_replies">Máximo de Respostas</Label>
                  <Input
                    id="max_auto_replies"
                    type="number"
                    {...register('max_auto_replies', { valueAsNumber: true })}
                    min={1}
                    max={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    Após esse número, escala para humano
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="response_delay_seconds">Delay de Resposta (seg)</Label>
                  <Input
                    id="response_delay_seconds"
                    type="number"
                    {...register('response_delay_seconds', { valueAsNumber: true })}
                    min={0}
                    max={30}
                  />
                  <p className="text-xs text-muted-foreground">
                    Simula tempo de digitação
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hybrid_timeout_minutes">Timeout Híbrido (min)</Label>
                  <Input
                    id="hybrid_timeout_minutes"
                    type="number"
                    {...register('hybrid_timeout_minutes', { valueAsNumber: true })}
                    min={1}
                    max={60}
                  />
                  <p className="text-xs text-muted-foreground">
                    No modo híbrido, I.A. responde após esse tempo sem resposta humana
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Palavras-chave de Escalação
                </Label>
                <Textarea
                  {...register('escalation_keywords')}
                  placeholder="falar com humano, atendente, gerente, reclamação"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Separe por vírgula. Quando detectadas, transfere para humano.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Escalar em Sentimento Negativo</Label>
                  <p className="text-sm text-muted-foreground">
                    Transferir quando cliente demonstrar frustração
                  </p>
                </div>
                <Switch
                  checked={watch('escalation_on_negative_sentiment')}
                  onCheckedChange={(checked) => setValue('escalation_on_negative_sentiment', checked)}
                />
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Dias de Funcionamento</Label>
                <div className="flex gap-2">
                  {weekDays.map(day => (
                    <Badge
                      key={day.value}
                      variant={selectedDays.includes(day.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="working_hours_start">Início</Label>
                  <Input
                    id="working_hours_start"
                    type="time"
                    {...register('working_hours_start')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="working_hours_end">Fim</Label>
                  <Input
                    id="working_hours_end"
                    type="time"
                    {...register('working_hours_end')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="out_of_hours_message">Mensagem Fora do Horário</Label>
                <Textarea
                  id="out_of_hours_message"
                  {...register('out_of_hours_message')}
                  placeholder="Olá! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos em breve!"
                  rows={3}
                />
              </div>
            </TabsContent>

            <TabsContent value="context" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="business_context">Contexto do Negócio</Label>
                <Textarea
                  id="business_context"
                  {...register('business_context')}
                  placeholder="Somos uma empresa de tecnologia focada em soluções para PMEs. Nossos principais produtos são..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Informações sobre sua empresa que o agente deve conhecer.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="faq_context">FAQ - Perguntas Frequentes</Label>
                <Textarea
                  id="faq_context"
                  {...register('faq_context')}
                  placeholder="P: Qual o prazo de entrega? R: 3 a 5 dias úteis.
P: Aceitam PIX? R: Sim, aceitamos PIX, cartão e boleto."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product_catalog">Catálogo de Produtos/Serviços</Label>
                <Textarea
                  id="product_catalog"
                  {...register('product_catalog')}
                  placeholder="Liste seus produtos, serviços e preços aqui..."
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="dna" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <Tabs defaultValue="knowledge" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 mb-4">
                    <TabsTrigger value="knowledge">Base de Conhecimento</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                    <TabsTrigger value="examples">Exemplos</TabsTrigger>
                    <TabsTrigger value="insights">Insights</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="knowledge">
                    <KnowledgeBaseManager sectorId={sector.id} />
                  </TabsContent>
                  
                  <TabsContent value="templates">
                    <ResponseTemplatesEditor sectorId={sector.id} />
                  </TabsContent>
                  
                  <TabsContent value="examples">
                    <LearningExamplesPanel sectorId={sector.id} />
                  </TabsContent>
                  
                  <TabsContent value="insights">
                    <KnowledgeInsights sectorId={sector.id} />
                  </TabsContent>
                </Tabs>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={createConfig.isPending || updateConfig.isPending}
            >
              {config ? 'Salvar Alterações' : 'Criar Configuração'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
