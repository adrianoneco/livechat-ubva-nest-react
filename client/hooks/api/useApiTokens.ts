import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';

export interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  rate_limit_per_minute: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateApiTokenInput {
  name: string;
  permissions?: string[];
  expires_at?: string;
  rate_limit_per_minute?: number;
}

export const API_PERMISSIONS = [
  { value: 'read', label: 'Leitura', description: 'Consultar conversas, mensagens e leads' },
  { value: 'write', label: 'Escrita', description: 'Criar e atualizar leads, enviar mensagens' },
  { value: 'admin', label: 'Admin', description: 'Acesso total à API' },
] as const;

// Generate a secure random token
const generateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Simple hash function for the token (in production, use proper bcrypt on server)
const hashToken = async (token: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const useApiTokens = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tokens, isLoading, error } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_tokens')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ApiToken[];
    },
  });

  const createToken = useMutation({
    mutationFn: async (input: CreateApiTokenInput): Promise<{ token: ApiToken; plainToken: string }> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const plainToken = generateToken();
      const tokenHash = await hashToken(plainToken);
      const tokenPrefix = plainToken.substring(0, 8);

      const { data, error } = await supabase
        .from('api_tokens')
        .insert({
          name: input.name,
          token_hash: tokenHash,
          token_prefix: tokenPrefix,
          permissions: input.permissions || ['read'],
          expires_at: input.expires_at,
          rate_limit_per_minute: input.rate_limit_per_minute || 60,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return { token: data as ApiToken, plainToken };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
      toast({
        title: "Token criado",
        description: "Copie o token agora, ele não será exibido novamente.",
      });
    },
    onError: (error) => {
      console.error('Error creating token:', error);
      toast({
        title: "Erro ao criar token",
        description: "Não foi possível criar o token.",
        variant: "destructive",
      });
    },
  });

  const revokeToken = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('api_tokens')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
      toast({
        title: "Token revogado",
        description: "O token foi desativado com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error revoking token:', error);
      toast({
        title: "Erro ao revogar",
        description: "Não foi possível revogar o token.",
        variant: "destructive",
      });
    },
  });

  const deleteToken = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('api_tokens')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
      toast({
        title: "Token excluído",
        description: "O token foi excluído permanentemente.",
      });
    },
    onError: (error) => {
      console.error('Error deleting token:', error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o token.",
        variant: "destructive",
      });
    },
  });

  return {
    tokens,
    isLoading,
    error,
    createToken: createToken.mutateAsync,
    revokeToken: revokeToken.mutate,
    deleteToken: deleteToken.mutate,
    isCreating: createToken.isPending,
    isRevoking: revokeToken.isPending,
    isDeleting: deleteToken.isPending,
  };
};
