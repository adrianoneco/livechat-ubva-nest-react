import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquarePlus, Send, Loader2, Eye, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/api/client';
import { invokeFunction } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SupervisorMessageInputProps {
  conversationId: string;
}

type MessageMode = 'internal' | 'client';

export function SupervisorMessageInput({ conversationId }: SupervisorMessageInputProps) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<MessageMode>('internal');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleSend = async () => {
    if (!content.trim() || !user) return;

    setIsLoading(true);
    try {
      if (mode === 'internal') {
        // Send internal note (not to WhatsApp)
        const { data: conversation, error: convError } = await supabase
          .from('whatsapp_conversations')
          .select('contact_id, whatsapp_contacts(phone_number)')
          .eq('id', conversationId)
          .single();

        if (convError) throw convError;

        const remoteJid = (conversation?.whatsapp_contacts as any)?.phone_number || 'internal';

        const { error } = await supabase.from('whatsapp_messages').insert({
          conversation_id: conversationId,
          content: content.trim(),
          message_type: 'text',
          is_from_me: true,
          is_internal: true,
          sent_by: user.id,
          message_id: `internal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          remote_jid: remoteJid,
          timestamp: new Date().toISOString(),
          status: 'sent',
        });

        if (error) throw error;
        toast.success('Nota interna enviada');
      } else {
        // Send real message to client via API
        const { data, error } = await invokeFunction('send-whatsapp-message', {
          conversationId,
          content: content.trim(),
          messageType: 'text',
          isSupervisorMessage: true,
          supervisorId: user.id,
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Erro ao enviar mensagem');
        
        toast.success('Mensagem enviada ao cliente');
      }

      setContent('');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', conversationId] });
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(mode === 'internal' ? 'Erro ao enviar nota interna' : 'Erro ao enviar mensagem');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t bg-muted/30 p-4 space-y-3">
      <Tabs value={mode} onValueChange={(v) => setMode(v as MessageMode)}>
        <TabsList className="w-full">
          <TabsTrigger value="internal" className="flex-1 gap-2">
            <Eye className="h-4 w-4" />
            Nota Interna
          </TabsTrigger>
          <TabsTrigger value="client" className="flex-1 gap-2">
            <MessageCircle className="h-4 w-4" />
            Mensagem ao Cliente
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'internal' ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquarePlus className="h-4 w-4" />
          <span>Visível apenas para admins e supervisores</span>
        </div>
      ) : (
        <Alert className="border-purple-500/30 bg-purple-500/10">
          <MessageCircle className="h-4 w-4 text-purple-600" />
          <AlertDescription className="text-purple-700 dark:text-purple-400">
            Esta mensagem será enviada ao cliente via WhatsApp sem assumir a conversa.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'internal' ? 'Digite uma nota interna...' : 'Digite uma mensagem para o cliente...'}
          className="min-h-[60px] resize-none bg-background"
          disabled={isLoading}
        />
        <Button
          onClick={handleSend}
          disabled={!content.trim() || isLoading}
          className={mode === 'client' ? 'self-end bg-purple-600 hover:bg-purple-700' : 'self-end'}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
