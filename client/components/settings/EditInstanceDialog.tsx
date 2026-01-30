import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/api/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { Tables } from "@/integrations/api/types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const formSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  instance_name: z
    .string()
    .min(1, "Nome da instância obrigatório")
    .regex(/^[a-zA-Z0-9_-]+$/, "Apenas letras, números, _ e -"),
  instance_id_external: z.string().optional(),
  api_url: z.string().optional(),
  api_key: z.string().optional(),
  provider_type: z.enum(["self_hosted", "cloud", "evolution_bot"]),
});

type FormValues = z.infer<typeof formSchema>;
type Instance = Tables<"whatsapp_instances"> & { provider_type?: string; instance_id_external?: string | null };

interface EditInstanceDialogProps {
  instance: Instance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditInstanceDialog = ({
  instance,
  open,
  onOpenChange,
}: EditInstanceDialogProps) => {
  const { updateInstance } = useWhatsAppInstances();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: instance.name,
      instance_name: instance.instance_name,
      instance_id_external: instance.instance_id_external || '',
      api_url: '',
      api_key: '',
      provider_type: (instance.provider_type as "self_hosted" | "cloud" | "evolution_bot") || 'self_hosted',
    },
  });

  const providerType = form.watch("provider_type");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'MESSAGES_DELETE']);
  const [webhookBase64, setWebhookBase64] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [secretsLoaded, setSecretsLoaded] = useState(false);

  // Load existing secrets when dialog opens
  useEffect(() => {
    const loadSecrets = async () => {
      if (open && instance.id && !secretsLoaded) {
        try {
          // Use server-side function to fetch secrets with service role key (avoids RLS issues)
          const res = await supabase.functions.invoke('get-instance-details', {
            body: { instanceId: instance.id },
          });
          console.log('EditInstanceDialog: get-instance-details result', res);

          if (res.error) {
            console.warn('get-instance-details error object:', res.error);
          }

          const data = res.data;
          if (data && data.success) {
            const secrets = data.secrets;
            const instanceData = data.instance;
            if (secrets) {
              form.setValue('api_url', secrets.api_url || '');
              form.setValue('api_key', secrets.api_key || '');
              // load webhook_base64 if present
              setWebhookBase64(!!secrets.webhook_base64);
            }
            // Also update form fields from instance if needed
            if (instanceData) {
              form.setValue('name', instanceData.name || '');
              form.setValue('instance_name', instanceData.instance_name || '');
              form.setValue('instance_id_external', instanceData.instance_id_external || '');
              form.setValue('provider_type', (instanceData.provider_type as any) || 'self_hosted');
            }
          } else {
            console.warn('get-instance-details returned no data or failed', res.error, res.data);
            // fallback to client-side attempt if allowed by RLS (may return empty)
            try {
              const { data: secrets, error: secErr } = await supabase
                .from('whatsapp_instance_secrets')
                .select('api_url,api_key')
                .eq('instance_id', instance.id)
                .maybeSingle();

              if (secErr) {
                console.warn('Client-side secrets fetch error (probably RLS):', secErr);
              }

              if (secrets) {
                form.setValue('api_url', secrets.api_url || '');
                form.setValue('api_key', secrets.api_key || '');
              } else {
                console.log('No secrets returned from client-side fetch (RLS may block access)');
              }
            } catch (e) {
              console.error('fallback client-side secrets load failed', e);
            }
          }

          setSecretsLoaded(true);
        } catch (error) {
          console.error('Failed to load secrets via function:', error);
          setSecretsLoaded(true);
        }
      }
    };
    loadSecrets();
  }, [open, instance.id, secretsLoaded, form]);

  // Reset secrets loaded flag when dialog closes
  useEffect(() => {
    if (!open) {
      setSecretsLoaded(false);
    }
  }, [open]);

  // Update form when instance changes
  useEffect(() => {
    form.reset({
      name: instance.name,
      instance_name: instance.instance_name,
      instance_id_external: instance.instance_id_external || '',
      api_url: '',
      api_key: '',
      provider_type: (instance.provider_type as "self_hosted" | "cloud" | "evolution_bot") || 'self_hosted',
    });
  }, [instance, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      await updateInstance.mutateAsync({
        id: instance.id,
        updates: {
          ...values,
          instance_id_external: values.provider_type === 'cloud' ? values.instance_id_external : null,
          // persist webhook base64 preference
          webhook_base64: webhookBase64,
        },
      });
      toast.success("Instância atualizada com sucesso!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao atualizar instância");
    }
  };

  const handleApplyToEvolution = async (force = false) => {
    const values = form.getValues();

    const instanceIdentifier = values.provider_type === 'cloud' ? values.instance_id_external || values.instance_name : values.instance_name;

    // Validate required parameters before invoking the Edge Function
    if (!values.api_url || !values.api_key || !instanceIdentifier) {
      console.warn('Missing required parameters for configure-evolution-instance', {
        api_url: values.api_url,
        api_key: !!values.api_key,
        instanceIdentifier,
      });
      toast.error('Preencha `api_url`, `api_key` e `instance name` antes de aplicar.');
      return;
    }

    setIsApplying(true);

    try {
      const payload: any = {
        api_url: values.api_url,
        api_key: values.api_key,
        instanceIdentifier,
        events: selectedEvents,
        force,
        instanceId: instance.id,
      };

      console.log('EditInstanceDialog: sending payload for instance update (backend will use APP_ORIGIN if configured)', { instanceId: instance.id });

      const res = await supabase.functions.invoke('configure-evolution-instance', {
        body: payload,
      });

      console.log('configure-evolution-instance invoke result:', res);

      if (res.error) {
        console.error('configure-evolution-instance error object:', res.error);

        // Try to get response details
        if (res.response) {
          console.log('Response status:', res.response.status);
          try {
            const responseText = await res.response.text();
            console.log('Response body:', responseText);
            toast.error(`Edge Function error [${res.response.status}]: ${responseText}`);
          } catch (e) {
            console.log('Could not read response body:', e);
            toast.error(`Edge Function error [${res.response.status}]: ${res.error.message}`);
          }
        } else {
          const errMsg = res.error?.message || JSON.stringify(res.error);
          toast.error(`Edge Function error: ${errMsg}`);
        }
        return;
      }

      if (res.data?.success) {
        toast.success('Configuração aplicada na Evolution');
      } else {
        console.warn('configure-evolution-instance response:', res.data);
        const bodyMsg = res.data?.error || JSON.stringify(res.data);
        toast.error(`Falha ao configurar Evolution: ${bodyMsg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Erro: ' + msg);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Instância</DialogTitle>
          <DialogDescription>
            Atualize as informações da instância
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="general">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="connection">Conexão</TabsTrigger>
                <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="provider_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Provedor</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="self_hosted">Baileys</SelectItem>
                            <SelectItem value="cloud">WhatsApp Cloud API</SelectItem>
                            <SelectItem value="evolution_bot">Evolution</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome</FormLabel>
                        <FormControl>
                          <Input placeholder="Minha Instância" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="instance_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Instância</FormLabel>
                        <FormControl>
                          <Input placeholder="my-instance" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {providerType === 'cloud' && (
                    <FormField
                      control={form.control}
                      name="instance_id_external"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ID da Instância (UUID)</FormLabel>
                          <FormControl>
                            <Input placeholder="ead6f2f2-7633-4e41-a08d-7272300a6ba1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="connection">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="api_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL da API</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={providerType === 'cloud'
                              ? "https://api.evoapicloud.com"
                              : "https://api.evolution.com"
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="api_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{providerType === 'cloud' ? 'Token da Instância' : 'API Key'}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => handleApplyToEvolution(false)} disabled={isApplying}>
                      {isApplying ? 'Aplicando...' : 'Aplicar no Evolution'}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="webhooks">
                <div className="space-y-4">

                  <FormItem>
                    <div className="flex items-center gap-2">
                      <input id="editWebhookBase64" type="checkbox" checked={webhookBase64} onChange={(e) => setWebhookBase64(e.target.checked)} />
                      <label htmlFor="editWebhookBase64">Webhook Base64</label>
                    </div>
                  </FormItem>
                  <FormItem>
                    <FormLabel>Eventos (Evolution)</FormLabel>
                    <div className="flex gap-2 flex-wrap">
                      {['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'MESSAGES_DELETE'].map(ev => (
                        <Button
                          key={ev}
                          size="sm"
                          variant={selectedEvents.includes(ev) ? 'default' : 'outline'}
                          onClick={() => setSelectedEvents(prev => prev.includes(ev) ? prev.filter(p => p !== ev) : [...prev, ev])}
                        >
                          {ev}
                        </Button>
                      ))}
                    </div>
                  </FormItem>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateInstance.isPending}>
                {updateInstance.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};