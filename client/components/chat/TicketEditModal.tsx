import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';

interface TicketEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: {
    id: string;
    prioridade: string | null;
    categoria: string | null;
  };
}

const PRIORITIES = [
  { value: 'baixa', label: 'Baixa', color: 'text-green-600' },
  { value: 'media', label: 'Média', color: 'text-yellow-600' },
  { value: 'alta', label: 'Alta', color: 'text-red-600' },
];

const CATEGORIES = [
  { value: 'suporte_tecnico', label: 'Suporte Técnico' },
  { value: 'duvidas', label: 'Dúvidas' },
  { value: 'reclamacao', label: 'Reclamação' },
  { value: 'solicitacao', label: 'Solicitação' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'outro', label: 'Outro' },
];

export function TicketEditModal({ open, onOpenChange, ticket }: TicketEditModalProps) {
  const queryClient = useQueryClient();
  const [prioridade, setPrioridade] = useState(ticket.prioridade || 'media');
  const [categoria, setCategoria] = useState(ticket.categoria || 'outro');

  const updateTicket = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('tickets')
        .update({
          prioridade,
          categoria,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticket.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ticket atualizado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      onOpenChange(false);
    },
    onError: () => {
      toast.error('Erro ao atualizar ticket');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Editar Ticket</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={setPrioridade}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className={p.color}>{p.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={() => updateTicket.mutate()}
            disabled={updateTicket.isPending}
          >
            {updateTicket.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
