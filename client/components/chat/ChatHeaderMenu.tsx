import { useState } from 'react';
import { MoreVertical, Edit, Archive, Download, CheckCircle, RotateCcw, RefreshCw, UserPlus, Building2, Bot, ArrowRightLeft, User, Shuffle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAIAgentSession, ConversationMode } from '@/hooks/ai-agent';
import { useConversationAssignment } from '@/hooks/whatsapp/useConversationAssignment';
import { useTickets } from '@/hooks/useTickets';
import { Checkbox } from '@/components/ui/checkbox';
import { AssignAgentDialog } from '@/components/conversations/AssignAgentDialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { EditContactModal } from './EditContactModal';
import { useWhatsAppActions } from '@/hooks/whatsapp/useWhatsAppActions';
import { exportConversation } from '@/utils/exportConversation';
import { toast } from 'sonner';

interface ChatHeaderMenuProps {
  conversation: any;
  onRefresh?: () => void;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
}

export function ChatHeaderMenu({ conversation, onRefresh, onAnalyze, isAnalyzing }: ChatHeaderMenuProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [generateSummary, setGenerateSummary] = useState(true);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);

  const { 
    archiveConversation, 
    closeConversation, 
    reopenConversation, 
    isArchiving, 
    isClosing, 
    isReopening 
  } = useWhatsAppActions();

  const { user } = useAuth();
  const { assignConversation } = useConversationAssignment();
  const { ticket, updateTicketStatus } = useTickets(conversation?.id);

  const isInQueue = !conversation?.assigned_to;
  const conversationMode: ConversationMode = conversation?.conversation_mode || 'ai';

  const { assumeConversation, setHybridMode, returnToAI, changeMode } = useAIAgentSession(conversation?.id);

  const handleArchive = () => {
    archiveConversation(conversation.id, {
      onSuccess: () => onRefresh?.(),
    });
  };

  const handleClose = () => {
    closeConversation(
      { conversationId: conversation.id, generateSummary },
      {
        onSuccess: () => {
          setShowCloseDialog(false);
          onRefresh?.();
        },
      }
    );
  };

  const handleReopen = () => {
    reopenConversation(conversation.id, {
      onSuccess: () => onRefresh?.(),
    });
  };

  const handleExport = async () => {
    try {
      await exportConversation(conversation.id);
      toast.success('Conversa exportada com sucesso');
    } catch (error) {
      toast.error('Erro ao exportar conversa');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-background z-50">
          <DropdownMenuSeparator />
          {isInQueue && (
            <DropdownMenuItem onClick={() => {
              if (conversation?.id && user?.id) assumeConversation.mutate(user.id);
            }}>
              <UserPlus className="mr-2 h-4 w-4" />
              Assumir Conversa
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={() => onAnalyze?.()} disabled={isAnalyzing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            Analisar
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Opções de modo baseadas no modo atual */}
          {conversationMode === 'ai' && (
            <>
              <DropdownMenuItem onClick={() => {
                if (conversation?.id && user?.id) changeMode.mutate({ mode: 'human', userId: user.id });
              }}>
                <User className="mr-2 h-4 w-4" />
                Modo Humano
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                if (conversation?.id && user?.id) setHybridMode.mutate(user.id);
              }}>
                <Shuffle className="mr-2 h-4 w-4" />
                Modo Híbrido
              </DropdownMenuItem>
            </>
          )}

          {conversationMode === 'human' && (
            <>
              <DropdownMenuItem onClick={() => returnToAI.mutate()}>
                <Bot className="mr-2 h-4 w-4" />
                Devolver para I.A
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                if (conversation?.id && user?.id) setHybridMode.mutate(user.id);
              }}>
                <Shuffle className="mr-2 h-4 w-4" />
                Modo Híbrido
              </DropdownMenuItem>
            </>
          )}

          {conversationMode === 'hybrid' && (
            <>
              <DropdownMenuItem onClick={() => {
                if (conversation?.id && user?.id) changeMode.mutate({ mode: 'human', userId: user.id });
              }}>
                <User className="mr-2 h-4 w-4" />
                Modo Humano
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => returnToAI.mutate()}>
                <Bot className="mr-2 h-4 w-4" />
                Devolver para I.A
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          {ticket && (
            <DropdownMenuItem
              onClick={() => {
                if (!ticket || ticket.status !== 'aberto') return;
                updateTicketStatus.mutate({ ticketId: ticket.id, status: 'em_atendimento' });
              }}
              disabled={!ticket || ticket.status !== 'aberto'}
            >
              <Building2 className="mr-2 h-4 w-4" />
              Iniciar Atendimento
            </DropdownMenuItem>
          )}

          {/* Transferir conversa - só mostra se tem alguém atribuído */}
          {!isInQueue && (
            <DropdownMenuItem onClick={() => setIsTransferDialogOpen(true)}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transferir
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setIsEditModalOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Editar contato
          </DropdownMenuItem>

          {conversation.status === 'closed' ? (
            <DropdownMenuItem onClick={handleReopen} disabled={isReopening}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reabrir conversa
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setShowCloseDialog(true)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Encerrar conversa
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={handleArchive} disabled={isArchiving}>
            <Archive className="mr-2 h-4 w-4" />
            Arquivar conversa
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Exportar conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditContactModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        contactId={conversation.contact.id}
        contactName={conversation.contact.name || ''}
        contactPhone={conversation.contact.phone_number}
        contactNotes={conversation.contact.notes}
        onSuccess={onRefresh}
      />

      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa será marcada como concluída e você poderá visualizá-la 
              nos filtros de conversas encerradas.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-center space-x-2 py-4">
            <Checkbox 
              id="summary" 
              checked={generateSummary}
              onCheckedChange={(checked) => setGenerateSummary(checked as boolean)}
            />
            <label 
              htmlFor="summary" 
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
        onSuccess={onRefresh}
      />
    </>
  );
}
