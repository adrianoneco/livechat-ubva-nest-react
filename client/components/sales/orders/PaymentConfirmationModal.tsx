import { useState } from "react";
import { useOrders } from "@/hooks/sales/useOrders";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PaymentConfirmationModalProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const paymentMethods = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto Bancário" },
  { value: "transfer", label: "Transferência Bancária" },
  { value: "credit_card", label: "Cartão de Crédito" },
  { value: "debit_card", label: "Cartão de Débito" },
  { value: "cash", label: "Dinheiro" },
];

export const PaymentConfirmationModal = ({
  orderId,
  open,
  onOpenChange,
}: PaymentConfirmationModalProps) => {
  const { orders, confirmPayment } = useOrders();
  const order = orders?.find((o) => o.id === orderId);

  const [paymentMethod, setPaymentMethod] = useState(order?.payment_method || "");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!order) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleConfirmPayment = async () => {
    if (!paymentMethod) {
      toast.error("Selecione o método de pagamento");
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPayment.mutateAsync({
        orderId,
        paymentProofUrl: paymentProofUrl || undefined,
      });

      toast.success("Pagamento confirmado com sucesso!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao confirmar pagamento");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-green-600" />
            Confirmar Pagamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pedido</span>
              <span className="font-mono">{order.order_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cliente</span>
              <span>{order.lead?.name || order.conversation?.contact?.name || "—"}</span>
            </div>
            <div className="flex justify-between font-medium text-lg pt-2 border-t">
              <span>Total</span>
              <span className="text-green-600">{formatCurrency(order.total)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="payment_method">Método de Pagamento *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o método" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Proof URL */}
          <div className="space-y-2">
            <Label htmlFor="payment_proof">URL do Comprovante</Label>
            <Input
              id="payment_proof"
              value={paymentProofUrl}
              onChange={(e) => setPaymentProofUrl(e.target.value)}
              placeholder="https://..."
            />
            <p className="text-xs text-muted-foreground">
              Link para o comprovante de pagamento (opcional)
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações sobre o pagamento (opcional)"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmPayment} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Confirmando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirmar Pagamento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
