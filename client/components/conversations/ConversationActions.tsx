import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Mail, Archive, UserPlus, CheckCircle, RotateCcw, Download, ArrowRightLeft, Bot } from 'lucide-react';
import { useWhatsAppActions } from '@/hooks/whatsapp/useWhatsAppActions';
import { useAuth } from '@/contexts/AuthContext';
import { useAIAgentSession } from '@/hooks/ai-agent';
import { exportConversation } from '@/utils/exportConversation';
import { AssignAgentDialog } from '@/components/conversations/AssignAgentDialog';
import { toast } from 'sonner';

interface ConversationActionsProps {
  conversation: any;
  children: React.ReactNode;
}

export function ConversationActions({ conversation, children }: ConversationActionsProps) {
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [generateSummary, setGenerateSummary] = useState(true);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);

  const { 
    markAsUnread, 
    archiveConversation, 
    closeConversation,
    reopenConversation,
    isMarkingUnread, 
    isArchiving,
    isClosing,
    isReopening
  } = useWhatsAppActions();

  const { user } = useAuth();
  const { assumeConversation, returnToAI } = useAIAgentSession(conversation?.id);

  const isRead = (conversation.unread_count || 0) === 0;
  const isInQueue = !conversation?.assigned_to;
  const isClosed = conversation?.status === 'closed';

  const handleMarkUnread = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAsUnread(conversation.id);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    archiveConversation(conversation.id);
  };

  const handleClose = () => {
    closeConversation(
      { conversationId: conversation.id, generateSummary },
      { onSuccess: () => setShowCloseDialog(false) }
    );
  };

  const handleReopen = (e: React.MouseEvent) => {
    e.stopPropagation();
    reopenConversation(conversation.id);
  };

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await exportConversation(conversation.id);
      toast.success('Conversa exportada com sucesso');
    } catch (error) {
      toast.error('Erro ao exportar conversa');
    }
  };

  const handleAssume = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (conversation?.id && user?.id) assumeConversation.mutate(user.id);
  };

  const handleReturnToAI = (e: React.MouseEvent) => {
    e.stopPropagation();
    returnToAI.mutate();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          {children}
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-48 bg-background z-50" onClick={(e) => e.stopPropagation()}>
          {isInQueue && (
            <DropdownMenuItem onClick={handleAssume}>
              <UserPlus className="mr-2 h-4 w-4" />
              Assumir Conversa
            </DropdownMenuItem>
          )}

          {!isInQueue && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsTransferDialogOpen(true); }}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transferir
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={handleReturnToAI}>
            <Bot className="mr-2 h-4 w-4" />
            Devolver para I.A
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {isRead && (
            <DropdownMenuItem onClick={handleMarkUnread} disabled={isMarkingUnread}>
              <Mail className="mr-2 h-4 w-4" />
              Marcar como não lida
            </DropdownMenuItem>
          )}

          {isClosed ? (
            <DropdownMenuItem onClick={handleReopen} disabled={isReopening}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reabrir conversa
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowCloseDialog(true); }}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Encerrar conversa
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={handleArchive} disabled={isArchiving}>
            <Archive className="mr-2 h-4 w-4" />
            Arquivar
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Exportar conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Close Dialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa será marcada como concluída e você poderá visualizá-la 
              nos filtros de conversas encerradas.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-center space-x-2 py-4">
            <Checkbox 
              id="summary-sidebar" 
              checked={generateSummary}
              onCheckedChange={(checked) => setGenerateSummary(checked as boolean)}
            />
            <label 
              htmlFor="summary-sidebar" 
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Gerar resumo automático com IA (recomendado)
            </label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClose} disabled={isClosing}>
              {isClosing ? 'Encerrando...' : 'Encerrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Dialog */}
      <AssignAgentDialog
        open={isTransferDialogOpen}
        onOpenChange={setIsTransferDialogOpen}
        conversationId={conversation?.id}
        currentAssignee={conversation?.assigned_to}
        isTransfer={true}
      />
    </>
  );
}
