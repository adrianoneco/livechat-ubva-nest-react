import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/client";
import { cn } from "@/lib/utils";

interface QuotedMessagePreviewProps {
  messageId: string;
}

export const QuotedMessagePreview = ({ messageId }: QuotedMessagePreviewProps) => {
  const { data: quotedMessage } = useQuery({
    queryKey: ['message', messageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('message_id', messageId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  if (!quotedMessage) return null;

  const sender = (quotedMessage as any).sender_name || (quotedMessage.is_from_me ? 'Você' : 'Contato');

  const handleJump = () => {
    const el = document.getElementById(`msg-${quotedMessage.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // briefly highlight
      el.classList.add('ring-2', 'ring-offset-2', 'ring-primary/40');
      setTimeout(() => el.classList.remove('ring-2', 'ring-offset-2', 'ring-primary/40'), 1200);
    }
  };

  return (
    <button
      onClick={handleJump}
      className={cn(
        'w-full text-left mb-2 rounded-md px-2 py-1 flex flex-col gap-0.5',
        'bg-muted/40 hover:bg-muted/60',
        quotedMessage.is_from_me ? 'border border-primary-foreground/10' : 'border border-border'
      )}
      title="Ir para mensagem citada"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground truncate">
          {sender}
        </span>
        <span className="text-[10px] text-muted-foreground">{new Date(quotedMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="text-xs text-foreground line-clamp-2">
        {quotedMessage.content || (quotedMessage.message_type ? `[${quotedMessage.message_type}]` : '')}
      </div>
    </button>
  );
};
