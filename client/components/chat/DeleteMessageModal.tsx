import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface DeleteMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  isLoading?: boolean;
  messagePreview?: string;
}

export function DeleteMessageModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  messagePreview,
}: DeleteMessageModalProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined);
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir mensagem</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação irá ocultar a mensagem da conversa. Uma nota interna será criada para 
            registro e visibilidade dos administradores.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {messagePreview && (
          <div className="bg-muted/50 p-3 rounded-md text-sm my-2">
            <p className="text-muted-foreground text-xs mb-1">Mensagem:</p>
            <p className="line-clamp-3">{messagePreview}</p>
          </div>
        )}
        
        <div className="space-y-2 my-2">
          <Label htmlFor="delete-reason">Motivo (opcional)</Label>
          <Input
            id="delete-reason"
            placeholder="Ex: Mensagem enviada por engano"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isLoading}
          />
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose} disabled={isLoading}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Excluindo...
              </>
            ) : (
              'Excluir'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
