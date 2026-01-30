import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessagesContainer } from '@/components/chat/MessagesContainer';
import { useWhatsAppMessages } from '@/hooks/whatsapp/useWhatsAppMessages';
import { Loader2 } from 'lucide-react';
import { SupervisorMessageInput } from './SupervisorMessageInput';
import { useAuth } from '@/contexts/AuthContext';

interface ConversationViewModalProps {
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConversationViewModal({
  conversationId,
  open,
  onOpenChange,
}: ConversationViewModalProps) {
  const { messages, isLoading } = useWhatsAppMessages(conversationId || '');
  const { isAdmin, isSupervisor } = useAuth();
  const canSendInternalNotes = isAdmin || isSupervisor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle>Visualizar Conversa</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : conversationId ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <MessagesContainer
                  conversationId={conversationId}
                  messages={messages}
                  isLoading={isLoading}
                />
              </div>
              {canSendInternalNotes && (
                <div className="shrink-0 border-t bg-background">
                  <SupervisorMessageInput conversationId={conversationId} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Nenhuma conversa selecionada
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
