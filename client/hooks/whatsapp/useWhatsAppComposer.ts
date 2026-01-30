import { useMutation } from '@tanstack/react-query';
import { invokeFunction } from '@/lib/api';
import { toast } from 'sonner';

export type ComposerAction =
  | 'expand'
  | 'rephrase'
  | 'my_tone'
  | 'friendly'
  | 'formal'
  | 'fix_grammar'
  | 'translate';

interface ComposeParams {
  message: string;
  action: ComposerAction;
  targetLanguage?: string;
}

interface ComposeResponse {
  original?: string;
  composed?: string;
  composedText?: string;
  action?: string;
}

export function useWhatsAppComposer() {
  const composeMutation = useMutation({
    mutationFn: async ({ message, action, targetLanguage }: ComposeParams) => {
      const { data, error } = await invokeFunction<ComposeResponse>(
        'compose-whatsapp-message',
        { message, action, targetLanguage }
      );

      if (error) {
        console.error('Compose error:', error);
        throw new Error(error.message || 'Failed to compose message');
      }

      // Server may return `composedText` or `composed` depending on implementation.
      const composed = (data as any)?.composed || (data as any)?.composedText;
      if (!composed) {
        // If server returned an error shape, surface it
        const serverMsg = (data as any)?.error || (data as any)?.message;
        throw new Error(serverMsg || 'No composed message received');
      }

      return { ...(data as any), composed } as ComposeResponse;
    },
    onError: (error: Error) => {
      console.error('Composition error:', error);

      if (error.message.includes('Rate limit')) {
        toast.error('Limite de uso atingido. Tente novamente em alguns minutos.');
      } else if (error.message.includes('Payment required')) {
        toast.error('Créditos insuficientes. Adicione créditos para usar IA.');
      } else if (error.message) {
        // Surface server-provided error when available to aid debugging
        toast.error(error.message);
      } else {
        toast.error('Erro ao processar com IA. Tente novamente.');
      }
    },
  });

  return {
    compose: composeMutation.mutateAsync,
    isComposing: composeMutation.isPending,
  };
}
