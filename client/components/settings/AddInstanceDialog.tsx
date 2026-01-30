import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { Loader2, Check, Copy, Link as LinkIcon, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/api/client";

const formSchema = z.object({
  name: z.string().optional(), // Will default to instance_name if not provided
  instance_name: z
    .string()
    .min(1, "Nome da instância obrigatório")
    .regex(/^[a-zA-Z0-9_-]+$/, "Apenas letras, números, _ e -"),
  instance_id_external: z.string().optional(),
  api_url: z.string().min(1, "URL da API obrigatória").url("URL inválida"),
  api_key: z.string().min(1, "Token/API Key obrigatório"),
  provider_type: z.enum(["self_hosted", "cloud", "evolution_bot"]),
});

type FormValues = z.infer<typeof formSchema>;

interface AddInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddInstanceDialog = ({ open, onOpenChange }: AddInstanceDialogProps) => {
  const { createInstance, testConnection, instances } = useWhatsAppInstances();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [showWebhookInstructions, setShowWebhookInstructions] = useState(false);
  const [createdInstanceId, setCreatedInstanceId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      instance_name: "",
      instance_id_external: "",
      api_url: "",
      api_key: "",
      provider_type: "self_hosted",
    },
  });

  const providerType = form.watch("provider_type");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'MESSAGES_DELETE']);
  const [webhookBase64, setWebhookBase64] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const handleTestConnection = async () => {
    const values = form.getValues();

    // Validate required fields for testing
    const fieldsToValidate = values.provider_type === 'cloud'
      ? ["api_url", "api_key", "instance_name", "instance_id_external"] as const
      : ["api_url", "api_key", "instance_name"] as const;
    const isValid = await form.trigger(fieldsToValidate);

    if (!isValid) {
      toast.error("Preencha os campos obrigatórios para testar a conexão");
      return;
    }

    // For Cloud, instance_id_external is required
    if (values.provider_type === 'cloud' && !values.instance_id_external) {
      toast.error("ID da Instância é obrigatório para Evolution Cloud");
      return;
    }

    setIsTestingConnection(true);
    try {
      // Call edge function to test connection (avoids CORS issues)
      const { data, error } = await supabase.functions.invoke('test-evolution-connection', {
        body: {
          api_url: values.api_url,
          api_key: values.api_key,
          instance_name: values.instance_name,
          instance_id_external: values.instance_id_external,
          provider_type: values.provider_type
        }
      });

      if (error) {
        throw new Error(error.message || 'Falha ao testar conexão');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setConnectionTested(true);
      toast.success("Conexão testada com sucesso!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Falha ao testar conexão";
      toast.error(`Falha ao testar conexão: ${errorMessage}`);
      setConnectionTested(false);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      // Prevent creating duplicate instance_name
      const exists = instances?.some((i: any) => (i.instance_name || '').toLowerCase() === values.instance_name.toLowerCase());
      if (exists) {
        toast.error('Já existe uma instância com esse nome. Use editar para atualizar a instância existente.');
        return;
      }
      // Create instance with secrets and provider_type
      // Use instance_name as name if not provided
      const result = await createInstance.mutateAsync({
        name: values.name || values.instance_name,
        instance_name: values.instance_name,
        instance_id_external: values.provider_type === 'cloud' ? values.instance_id_external : undefined,
        api_url: values.api_url,
        api_key: values.api_key,
        provider_type: values.provider_type,
        webhook_base64: webhookBase64,
      });

      // result may contain instance and secrets (from mutation)
      console.log('AddInstanceDialog.onSubmit: createInstance result:', result);
      const instanceId = result?.instance?.id || result?.id;
      setCreatedInstanceId(instanceId || null);
      // verify secrets persisted
      if (instanceId) {
        const { data: secrets } = await supabase
          .from('whatsapp_instance_secrets')
          .select('api_url,api_key')
          .eq('instance_id', instanceId)
          .maybeSingle();
        console.log('AddInstanceDialog.onSubmit: secrets fetched after create:', secrets);
        if (!secrets || !secrets.api_url || !secrets.api_key) {
          toast.error('A instância foi criada, mas a URL/token não foram salvos. Veja o console para mais detalhes.');
        }
      }
      // if createdInstanceId is available, also try to auto-apply webhooks
      if (instanceId) {
        // try apply with instanceId so function can read secrets server-side
        try {
          await handleApplyToEvolution(false, instanceId);
        } catch (_) {
          // swallow; user can click apply manually
        }
      }
      setShowWebhookInstructions(true);
      form.reset();
      setConnectionTested(false);
    } catch (error: unknown) {
      console.error('AddInstanceDialog.onSubmit error:', error);
      let msg = '';
      if (error instanceof Error) msg = error.message;
      else if (typeof error === 'string') msg = error;
      else {
        try {
          msg = JSON.stringify(error);
        } catch {
          msg = String(error);
        }
      }
      toast.error(`Erro ao criar instância: ${msg}`);
    }
  };

  const handleClose = () => {
    if (!showWebhookInstructions) {
      form.reset();
      setConnectionTested(false);
    }
    setShowWebhookInstructions(false);
    setCreatedInstanceId(null);
    onOpenChange(false);
  };

  // Prefer the current page origin (IP/domain) so webhooks are reachable from Evolution
  const envApiUrl = import.meta.env.VITE_API_URL || '';
  const frontendOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  // Determine base for backend (use frontend origin when available so webhook uses same host)
  let webhookBase = frontendOrigin || (envApiUrl ? envApiUrl.replace(/\/api$/, '') : 'http://localhost:3000');

  // If frontend origin is present but not pointing to backend port, switch to backend port 3000
  try {
    const parsed = new URL(webhookBase);
    // prefer explicit backend port if frontendOrigin is used (replace frontend port with 3000)
    if (frontendOrigin) {
      parsed.port = String(import.meta.env.VITE_BACKEND_PORT || 3000);
      webhookBase = parsed.toString().replace(/\/$/, '');
    }
  } catch (e) {
    // ignore and keep webhookBase
  }

  const webhookUrl = `${webhookBase}/api/whatsapp/webhooks/evolution`;

  console.log('AddInstanceDialog: webhook URL will be:', webhookUrl);

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada!");
  };

  const handleApplyToEvolution = async (force = false, instanceId?: string) => {
    const vals = form.getValues();

    // If invoked with an instanceId (after creating instance), let the Edge function
    // read secrets server-side. Otherwise validate required fields from the form.
    if (instanceId) {
      setIsApplying(true);
      try {
        const payload: any = {
          instanceId,
          base64: webhookBase64,
          events: selectedEvents,
          force,
        };

        console.log('AddInstanceDialog: sending payload with instanceId for server-side secrets (backend will use APP_ORIGIN if configured):', payload);

        const res = await supabase.functions.invoke('configure-evolution-instance', {
          body: payload,
        });

        console.log('configure-evolution-instance invoke result:', res);

        if (res.error) {
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
      return;
    }

    // No instanceId: validate client-provided fields before invoking
    const instanceIdentifier = vals.provider_type === 'cloud' ? vals.instance_id_external || vals.instance_name : vals.instance_name;

    if (!vals.api_url || !vals.api_key || !instanceIdentifier) {
      console.warn('Missing required parameters for configure-evolution-instance', {
        api_url: vals.api_url,
        api_key: !!vals.api_key,
        instanceIdentifier,
      });
      toast.error('Preencha `api_url`, `api_key` e `instance name` antes de aplicar.');
      return;
    }

    setIsApplying(true);
    try {
      const payload = {
        api_url: vals.api_url,
        api_key: vals.api_key,
        instanceIdentifier,
        webhookUrl: webhookUrl,
        base64: webhookBase64,
        events: selectedEvents,
        force,
      };

      console.log('AddInstanceDialog: sending payload with webhook URL:', payload.webhookUrl);

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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        {!showWebhookInstructions ? (
          <>
            <DialogHeader>
              <DialogTitle>Nova Instância</DialogTitle>
              <DialogDescription>
                Adicione uma nova instância da Evolution API
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
                            <div className="flex items-center gap-1.5">
                              <FormLabel>Tipo de Provedor</FormLabel>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[250px]">
                                  <p>Selecione <strong>Self-Hosted</strong> se você instalou o Evolution API em seu próprio servidor. Selecione <strong>Cloud</strong> se usa Evolution Cloud (evoapicloud.com ou similar).</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        name="instance_name"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center gap-1.5">
                              <FormLabel>Nome da Instância</FormLabel>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[250px]">
                                  <p>Nome exato da instância configurada no Evolution API. Encontre no painel do Evolution em 'Instances'.</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
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
                              <div className="flex items-center gap-1.5">
                                <FormLabel>ID da Instância (UUID)</FormLabel>
                              </div>
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
                            <div className="flex items-center gap-1.5">
                              <FormLabel>URL da API</FormLabel>
                            </div>
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
                            <div className="flex items-center gap-1.5">
                              <FormLabel>{providerType === 'cloud' ? 'Token da Instância' : 'API Key'}</FormLabel>
                            </div>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleTestConnection}
                          disabled={isTestingConnection}
                        >
                          {isTestingConnection ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : connectionTested ? (
                            <Check className="mr-2 h-4 w-4" />
                          ) : null}
                          Testar Conexão
                        </Button>

                        <Button
                          type="submit"
                          disabled={!connectionTested || createInstance.isPending}
                          className="ml-auto"
                        >
                          {createInstance.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Salvar
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="webhooks">
                    <div className="space-y-4">
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <input id="webhookBase64" type="checkbox" checked={webhookBase64} onChange={(e) => setWebhookBase64(e.target.checked)} />
                          <label htmlFor="webhookBase64">Webhook Base64</label>
                        </div>
                      </FormItem>
                      <FormItem>
                        <FormLabel>Eventos (Evolution)</FormLabel>
                        <div className="flex gap-2 flex-wrap">
                          {['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'].map(ev => (
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

                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => handleApplyToEvolution(false)} disabled={isApplying}>
                          {isApplying ? 'Aplicando...' : 'Configurar no Evolution'}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </form>
            </Form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Instância criada com sucesso!
              </DialogTitle>
              <DialogDescription>
                Configure o webhook na Evolution API
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Alert>
                <LinkIcon className="h-4 w-4" />
                <AlertDescription className="space-y-2 mt-2">
                  <div>
                    <strong>URL do Webhook:</strong>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-muted p-2 rounded text-xs break-all">
                        {webhookUrl}
                      </code>
                      <Button size="sm" variant="outline" onClick={copyWebhookUrl}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <strong>Events:</strong>
                    <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                      <li>MESSAGES_UPSERT</li>
                      <li>MESSAGES_UPDATE</li>
                      <li>CONNECTION_UPDATE</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>

              <Button onClick={handleClose} className="w-full">
                Fechar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};