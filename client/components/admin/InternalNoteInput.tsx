import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquarePlus, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface InternalNoteInputProps {
  conversationId: string;
}

export function InternalNoteInput({ conversationId }: InternalNoteInputProps) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleSend = async () => {
    if (!content.trim() || !user) return;

    setIsLoading(true);
    try {
      // Get conversation to get remote_jid
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

      setContent('');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', conversationId] });
      toast.success('Nota interna enviada');
    } catch (error) {
      console.error('Error sending internal note:', error);
      toast.error('Erro ao enviar nota interna');
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
    <div className="border-t bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
        <MessageSquarePlus className="h-4 w-4" />
        <span>Nota interna (visível apenas para admins e supervisores)</span>
      </div>
      <div className="flex gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma nota interna..."
          className="min-h-[60px] resize-none bg-background"
          disabled={isLoading}
        />
        <Button
          onClick={handleSend}
          disabled={!content.trim() || isLoading}
          className="self-end"
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
