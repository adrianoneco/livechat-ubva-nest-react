import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret_key: string | null;
  events: string[];
  is_active: boolean;
  headers: Record<string, string>;
  retry_count: number;
  timeout_ms: number;
  last_triggered_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  payload: any;
  response_status: number | null;
  response_body: string | null;
  response_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  attempt_number: number;
  created_at: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  secret_key?: string;
  headers?: Record<string, string>;
  retry_count?: number;
  timeout_ms?: number;
}

export const WEBHOOK_EVENT_CATEGORIES = {
  whatsapp: {
    label: 'WhatsApp',
    description: 'Eventos relacionados ao WhatsApp',
    events: [
      { value: 'new_conversation', label: 'Nova conversa', description: 'Quando uma nova conversa é iniciada' },
      { value: 'conversation_reopened', label: 'Conversa reaberta', description: 'Quando uma conversa é reaberta após encerramento' },
      { value: 'new_message', label: 'Nova mensagem', description: 'Quando uma nova mensagem é recebida' },
      { value: 'message_sent', label: 'Mensagem enviada', description: 'Quando uma mensagem é enviada com sucesso' },
      { value: 'message_delivered', label: 'Mensagem entregue', description: 'Quando uma mensagem é entregue ao destinatário' },
      { value: 'message_read', label: 'Mensagem lida', description: 'Quando uma mensagem é lida pelo destinatário' },
      { value: 'conversation_closed', label: 'Conversa encerrada', description: 'Quando uma conversa é encerrada' },
      { value: 'contact_created', label: 'Contato criado', description: 'Quando um novo contato é criado' },
      { value: 'contact_updated', label: 'Contato atualizado', description: 'Quando um contato é atualizado' },
    ],
  },
  tickets: {
    label: 'Tickets',
    description: 'Eventos relacionados a tickets de suporte',
    events: [
      { value: 'ticket_created', label: 'Ticket criado', description: 'Quando um novo ticket é criado' },
      { value: 'ticket_closed', label: 'Ticket fechado', description: 'Quando um ticket é fechado' },
      { value: 'ticket_assigned', label: 'Ticket atribuído', description: 'Quando um ticket é atribuído a um atendente' },
      { value: 'ticket_sla_warning', label: 'Alerta de SLA', description: 'Quando um ticket está próximo de violar o SLA' },
      { value: 'ticket_sla_violated', label: 'SLA violado', description: 'Quando o SLA de um ticket é violado' },
      { value: 'feedback_received', label: 'Feedback recebido', description: 'Quando um feedback é enviado pelo cliente' },
    ],
  },
  leads: {
    label: 'Leads/CRM',
    description: 'Eventos relacionados a leads e vendas',
    events: [
      { value: 'lead_created', label: 'Lead criado', description: 'Quando um novo lead é criado' },
      { value: 'lead_status_changed', label: 'Status do lead alterado', description: 'Quando o status de um lead muda' },
      { value: 'lead_assigned', label: 'Lead atribuído', description: 'Quando um lead é atribuído a um vendedor' },
      { value: 'lead_converted', label: 'Lead convertido', description: 'Quando um lead é convertido em cliente' },
      { value: 'opportunity_created', label: 'Oportunidade criada', description: 'Quando uma oportunidade de venda é criada' },
      { value: 'opportunity_won', label: 'Oportunidade ganha', description: 'Quando uma oportunidade é ganha' },
      { value: 'opportunity_lost', label: 'Oportunidade perdida', description: 'Quando uma oportunidade é perdida' },
    ],
  },
  campaigns: {
    label: 'Campanhas',
    description: 'Eventos relacionados a campanhas de marketing',
    events: [
      { value: 'campaign_started', label: 'Campanha iniciada', description: 'Quando uma campanha é iniciada' },
      { value: 'campaign_completed', label: 'Campanha concluída', description: 'Quando uma campanha é concluída' },
      { value: 'campaign_message_sent', label: 'Mensagem de campanha enviada', description: 'Quando uma mensagem de campanha é enviada' },
      { value: 'campaign_message_failed', label: 'Falha em mensagem de campanha', description: 'Quando uma mensagem de campanha falha' },
    ],
  },
  ai: {
    label: 'IA/Agente',
    description: 'Eventos relacionados ao agente de IA',
    events: [
      { value: 'ai_response_sent', label: 'Resposta da IA enviada', description: 'Quando a IA envia uma resposta automática' },
      { value: 'ai_escalation', label: 'Escalação da IA', description: 'Quando a IA escala a conversa para um humano' },
      { value: 'ai_intent_detected', label: 'Intenção detectada', description: 'Quando a IA detecta uma intenção específica' },
      { value: 'sentiment_analyzed', label: 'Sentimento analisado', description: 'Quando o sentimento da conversa é analisado' },
    ],
  },
  system: {
    label: 'Sistema',
    description: 'Eventos do sistema e instâncias',
    events: [
      { value: 'instance_connected', label: 'Instância conectada', description: 'Quando uma instância WhatsApp é conectada' },
      { value: 'instance_disconnected', label: 'Instância desconectada', description: 'Quando uma instância WhatsApp é desconectada' },
      { value: 'user_login', label: 'Login de usuário', description: 'Quando um usuário faz login' },
      { value: 'user_created', label: 'Usuário criado', description: 'Quando um novo usuário é criado' },
    ],
  },
} as const;

// Flatten all events for backwards compatibility
export const WEBHOOK_EVENTS = Object.values(WEBHOOK_EVENT_CATEGORIES)
  .flatMap(category => category.events);

// Get all event values
export const getAllEventValues = (): string[] => 
  WEBHOOK_EVENTS.map(e => e.value);

// Get events by category
export const getEventsByCategory = (categoryKey: keyof typeof WEBHOOK_EVENT_CATEGORIES) =>
  WEBHOOK_EVENT_CATEGORIES[categoryKey].events;

export const useWebhooks = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: webhooks, isLoading, error } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Normalize webhooks to ensure events is always an array
      return (data || []).map(webhook => ({
        ...webhook,
        events: webhook.events || [],
        headers: webhook.headers || {},
      })) as Webhook[];
    },
  });

  const createWebhook = useMutation({
    mutationFn: async (input: CreateWebhookInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('webhooks')
        .insert({
          ...input,
          user_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({
        title: "Webhook criado",
        description: "O webhook foi criado com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error creating webhook:', error);
      toast({
        title: "Erro ao criar webhook",
        description: "Não foi possível criar o webhook.",
        variant: "destructive",
      });
    },
  });

  const updateWebhook = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Webhook> & { id: string }) => {
      const { data, error } = await supabase
        .from('webhooks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({
        title: "Webhook atualizado",
        description: "O webhook foi atualizado com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error updating webhook:', error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o webhook.",
        variant: "destructive",
      });
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({
        title: "Webhook excluído",
        description: "O webhook foi excluído com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error deleting webhook:', error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o webhook.",
        variant: "destructive",
      });
    },
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('webhooks')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({
        title: data.is_active ? "Webhook ativado" : "Webhook desativado",
      });
    },
  });

  return {
    webhooks,
    isLoading,
    error,
    createWebhook: createWebhook.mutate,
    updateWebhook: updateWebhook.mutate,
    deleteWebhook: deleteWebhook.mutate,
    toggleWebhook: toggleWebhook.mutate,
    isCreating: createWebhook.isPending,
    isUpdating: updateWebhook.isPending,
    isDeleting: deleteWebhook.isPending,
  };
};

export const useWebhookLogs = (webhookId: string) => {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['webhook-logs', webhookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as WebhookLog[];
    },
    enabled: !!webhookId,
  });

  return { logs, isLoading };
};
