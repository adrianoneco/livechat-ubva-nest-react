import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/api/types';

type Instance = Tables<'whatsapp_instances'> & { provider_type?: string };
type InstanceInsert = TablesInsert<'whatsapp_instances'>;
type InstanceUpdate = TablesUpdate<'whatsapp_instances'>;

// Extended types that include secrets and provider_type
type InstanceInsertWithSecrets = InstanceInsert & {
  api_url: string;
  api_key: string;
  provider_type?: string;
  instance_id_external?: string;
  webhook_endpoint?: string;
  webhook_base64?: boolean;
};

type InstanceUpdateWithSecrets = InstanceUpdate & {
  api_url?: string;
  api_key?: string;
  provider_type?: string;
  instance_id_external?: string;
};

export const useWhatsAppInstances = () => {
  const queryClient = useQueryClient();

  const { data: instances = [], isLoading, error } = useQuery({
    queryKey: ['whatsapp', 'instances'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('whatsapp_instances')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data as Instance[]) || [];
      } catch (error) {
        console.error('[useWhatsAppInstances] Error fetching instances:', error);
        return [];
      }
    },
    initialData: [],
  });

  const createInstance = useMutation({
    mutationFn: async (instance: InstanceInsertWithSecrets) => {
      const { api_url, api_key, provider_type, instance_id_external, webhook_endpoint, webhook_base64, ...instanceData } = instance as any;

      // 1. Create instance in main table with provider_type and instance_id_external
      const { data: instanceResult, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .insert({
          ...instanceData,
          provider_type: provider_type || 'self_hosted',
          instance_id_external: instance_id_external || null,
        } as any)
        .select()
        .single();

      if (instanceError) {
        const msg = (instanceError && (instanceError.message || instanceError.error)) || JSON.stringify(instanceError);
        throw new Error(`createInstance: failed to create instance: ${msg}`);
      }

      // 2. Create secrets in separate table
      const { data: secretsResult, error: secretsError } = await supabase
        .from('whatsapp_instance_secrets')
        .insert({
          instance_id: instanceResult.id,
          api_url,
          api_key,
          ...(typeof webhook_base64 !== 'undefined' ? { webhook_base64 } : {}),
          ...(webhook_endpoint ? { webhook_endpoint } : {}),
        })
        .select()
        .maybeSingle();

      if (secretsError || !secretsResult) {
        console.error('createInstance: failed to insert secrets', { secretsError, secretsResult });
        // Rollback: delete instance if secrets insertion fails
        await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('id', instanceResult.id);
        const msg = (secretsError && (secretsError.message || secretsError.error)) || JSON.stringify(secretsError || secretsResult);
        throw new Error(`createInstance: failed to insert secrets: ${msg}`);
      }

      console.log('createInstance: created instance and secrets', { instanceResult, secretsResult });
      return { instance: instanceResult, secrets: secretsResult } as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const updateInstance = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: InstanceUpdateWithSecrets }) => {
      const { api_url, api_key, provider_type, instance_id_external, webhook_base64, ...instanceUpdates } = updates;

      // Build instance updates including provider_type and instance_id_external if provided
      const finalInstanceUpdates = {
        ...instanceUpdates,
        ...(provider_type && { provider_type }),
        ...(instance_id_external !== undefined && { instance_id_external }),
      };

      // 1. Update instance in main table
      const { data, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .update(finalInstanceUpdates as any)
        .eq('id', id)
        .select()
        .single();

      if (instanceError) throw instanceError;

      // 2. Update secrets if provided
      // Only update if at least one value is provided and non-empty
      const hasApiUrl = api_url && api_url.trim().length > 0;
      const hasApiKey = api_key && api_key.trim().length > 0;
      const hasWebhookEndpoint = (updates as any).webhook_endpoint && (updates as any).webhook_endpoint.trim().length > 0;
      const hasWebhookBase64 = typeof (updates as any).webhook_base64 !== 'undefined';

      console.log('updateInstance: updating secrets', { hasApiUrl, hasApiKey, hasWebhookEndpoint, api_url: hasApiUrl ? 'present' : 'missing', api_key: hasApiKey ? 'present' : 'missing' });

      if (hasApiUrl || hasApiKey || hasWebhookEndpoint) {
        // First check if secrets exist
        const { data: existingSecrets } = await supabase
          .from('whatsapp_instance_secrets')
          .select('id')
          .eq('instance_id', id)
          .maybeSingle();

        console.log('updateInstance: existing secrets found:', !!existingSecrets);

        if (existingSecrets) {
          // Update existing secrets
          const secretUpdates: { api_url?: string; api_key?: string; webhook_endpoint?: string | null; webhook_base64?: boolean } = {};
          if (hasApiUrl) secretUpdates.api_url = api_url;
          if (hasApiKey) secretUpdates.api_key = api_key;
          if (hasWebhookEndpoint) secretUpdates.webhook_endpoint = (updates as any).webhook_endpoint;
          if (hasWebhookBase64) secretUpdates.webhook_base64 = (updates as any).webhook_base64;
          
          const { error: updateSecretsError } = await supabase
            .from('whatsapp_instance_secrets')
            .update(secretUpdates)
            .eq('instance_id', id);
          
          if (updateSecretsError) {
            console.error('updateInstance: failed to update secrets', updateSecretsError);
            throw updateSecretsError;
          }
          console.log('updateInstance: successfully updated secrets');
        } else {
          // Insert new secrets (require at least api_url and api_key if not present before)
          const insertPayload: any = { instance_id: id };
          if (hasApiUrl) insertPayload.api_url = api_url!;
          if (hasApiKey) insertPayload.api_key = api_key!;
          if (hasWebhookEndpoint) insertPayload.webhook_endpoint = (updates as any).webhook_endpoint;
          if (hasWebhookBase64) insertPayload.webhook_base64 = (updates as any).webhook_base64;

          const { error: insertSecretsError } = await supabase
            .from('whatsapp_instance_secrets')
            .insert(insertPayload);

          if (insertSecretsError) {
            console.error('updateInstance: failed to insert secrets', insertSecretsError);
            throw insertSecretsError;
          }
          console.log('updateInstance: successfully inserted new secrets');
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const deleteInstance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const testConnection = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(
        'test-instance-connection',
        { body: { instanceId: id } }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate to fetch updated status
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const syncStatuses = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        'sync-instance-statuses',
        { body: {} }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate to fetch updated statuses
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(
        'update-instance-status',
        { body: { instanceId: id } }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  return {
    instances,
    isLoading,
    error,
    createInstance,
    updateInstance,
    deleteInstance,
    testConnection,
    syncStatuses,
    updateStatus,
  };
};