import { useState } from 'react';
import { Ticket, CheckCircle2, Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useTickets } from '@/hooks/useTickets';
import { useSLAConfig } from '@/hooks/admin/useSLAConfig';
import { SLAIndicator } from '@/components/admin/SLAIndicator';
import { TicketEditModal } from './TicketEditModal';
import { cn } from '@/lib/utils';

interface TicketIndicatorProps {
  conversationId: string;
  sectorGeraTicket?: boolean;
}

const statusColors: Record<string, string> = {
  aberto: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  em_atendimento: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  finalizado: 'bg-green-500/10 text-green-600 border-green-500/20',
  reaberto: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

const statusLabels: Record<string, string> = {
  aberto: 'Ticket Aberto',
  em_atendimento: 'Em Atendimento',
  finalizado: 'Finalizado',
  reaberto: 'Reaberto',
};

export function TicketIndicator({ conversationId, sectorGeraTicket }: TicketIndicatorProps) {
  const { ticket, closeTicket, updateTicketStatus } = useTickets(conversationId);
  const { data: slaConfigMap } = useSLAConfig();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Don't show if sector doesn't generate tickets
  if (!sectorGeraTicket || !ticket) {
    return null;
  }
  
  // Use default 'media' priority SLA config since prioridade field doesn't exist
  const slaConfig = slaConfigMap?.['media'];
  const isFinalized = ticket.status === 'finalizado';

  const handleStartAttending = async () => {
    if (ticket.status === 'aberto') {
      await updateTicketStatus.mutateAsync({ 
        ticketId: ticket.id, 
        status: 'em_atendimento' 
      });
    }
  };

  const handleCloseTicket = async () => {
    await closeTicket.mutateAsync(ticket.id);
    setShowCloseDialog(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge 
          variant="outline" 
          className={cn(
            'flex items-center gap-1.5 px-2 py-1',
            statusColors[ticket.status]
          )}
        >
          <Ticket className="h-3 w-3" />
          <span className="text-xs font-medium">
            {statusLabels[ticket.status]}
          </span>
        </Badge>

        {/* SLA Indicator removed */}

        {/* Iniciar Atendimento moved to ChatHeader consolidated actions dropdown */}

        {(ticket.status === 'em_atendimento' || ticket.status === 'reaberto') && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => setShowEditModal(true)}
            >
              <Edit2 className="h-3 w-3" />
              Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 text-green-600 border-green-600/30 hover:bg-green-500/10"
              onClick={() => setShowCloseDialog(true)}
            >
              <CheckCircle2 className="h-3 w-3" />
              Finalizar
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Ao finalizar o ticket, uma mensagem de encerramento será enviada ao cliente
              solicitando feedback sobre o atendimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseTicket}
              disabled={closeTicket.isPending}
            >
              {closeTicket.isPending ? 'Finalizando...' : 'Confirmar Finalização'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showEditModal && (
        <TicketEditModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          ticket={{
            id: ticket.id,
            categoria: ticket.categoria,
          }}
        />
      )}
    </>
  );
}
