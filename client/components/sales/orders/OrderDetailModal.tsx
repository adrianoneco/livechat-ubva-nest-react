import { useOrders } from "@/hooks/sales/useOrders";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Package,
  User,
  CreditCard,
  Calendar,
  FileText,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Truck,
  Clock,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface OrderDetailModalProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: <Clock className="w-4 h-4" /> },
  confirmed: { label: "Confirmado", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <CheckCircle2 className="w-4 h-4" /> },
  paid: { label: "Pago", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: <CreditCard className="w-4 h-4" /> },
  shipped: { label: "Enviado", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: <Truck className="w-4 h-4" /> },
  delivered: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: <CheckCircle2 className="w-4 h-4" /> },
  cancelled: { label: "Cancelado", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: <XCircle className="w-4 h-4" /> },
  refunded: { label: "Reembolsado", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: <RefreshCw className="w-4 h-4" /> },
};

const paymentMethodLabels: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  transfer: "Transferência",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  cash: "Dinheiro",
};

export const OrderDetailModal = ({ orderId, open, onOpenChange }: OrderDetailModalProps) => {
  const navigate = useNavigate();
  const { orders, updateOrder } = useOrders();
  const order = orders?.find((o) => o.id === orderId);

  if (!order) return null;

  const status = statusConfig[order.status] || statusConfig.pending;
  const items = order.items || [];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleStatusChange = async (newStatus: string) => {
    await updateOrder.mutateAsync({ id: orderId, status: newStatus as any });
  };

  const handleGoToConversation = () => {
    if (order.conversation_id) {
      navigate(`/whatsapp?conversation=${order.conversation_id}`);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Pedido {order.order_number}
            </DialogTitle>
            <Badge variant="outline" className={status.color}>
              {status.icon}
              <span className="ml-1">{status.label}</span>
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="space-y-6 pr-4">
            {/* Cliente */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Cliente
              </h3>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium">
                  {order.lead?.name || order.conversation?.contact?.name || "Cliente não identificado"}
                </p>
                {order.lead?.email && (
                  <p className="text-sm text-muted-foreground">{order.lead.email}</p>
                )}
                {order.lead?.phone && (
                  <p className="text-sm text-muted-foreground">{order.lead.phone}</p>
                )}
                {order.conversation_id && (
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto mt-1"
                    onClick={handleGoToConversation}
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Ver conversa
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Itens */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Itens do Pedido
              </h3>
              <div className="border rounded-lg">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium">Produto</th>
                      <th className="text-center p-2 text-xs font-medium">Qtd</th>
                      <th className="text-right p-2 text-xs font-medium">Preço</th>
                      <th className="text-right p-2 text-xs font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2 text-sm">{item.product_name}</td>
                        <td className="p-2 text-sm text-center">{item.quantity}</td>
                        <td className="p-2 text-sm text-right">
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td className="p-2 text-sm text-right font-medium">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totais */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Desconto</span>
                  <span>-{formatCurrency(order.discount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-medium text-lg">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>

            <Separator />

            {/* Pagamento */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Pagamento
              </h3>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Método</span>
                  <span>
                    {order.payment_method
                      ? paymentMethodLabels[order.payment_method] || order.payment_method
                      : "Não definido"}
                  </span>
                </div>
                {order.paid_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pago em</span>
                    <span>
                      {format(new Date(order.paid_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {order.payment_proof_url && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Comprovante</span>
                    <a 
                      href={order.payment_proof_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      Ver comprovante
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Datas */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Datas
              </h3>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criado em</span>
                  <span>
                    {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                {order.paid_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pago em</span>
                    <span>
                      {format(new Date(order.paid_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Notas */}
            {(order.payment_notes || order.delivery_notes) && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Observações</h3>
                {order.payment_notes && (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                    <strong>Pagamento:</strong> {order.payment_notes}
                  </p>
                )}
                {order.delivery_notes && (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                    <strong>Entrega:</strong> {order.delivery_notes}
                  </p>
                )}
              </div>
            )}

            {/* Ações */}
            <div className="flex flex-wrap gap-2 pt-4">
              {order.status === "pending" && (
                <>
                  <Button
                    variant="default"
                    onClick={() => handleStatusChange("confirmed")}
                    disabled={updateOrder.isPending}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirmar Pedido
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleStatusChange("cancelled")}
                    disabled={updateOrder.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                </>
              )}
              {order.status === "paid" && (
                <Button
                  variant="default"
                  onClick={() => handleStatusChange("shipped")}
                  disabled={updateOrder.isPending}
                >
                  <Truck className="w-4 h-4 mr-2" />
                  Marcar como Enviado
                </Button>
              )}
              {order.status === "shipped" && (
                <Button
                  variant="default"
                  onClick={() => handleStatusChange("delivered")}
                  disabled={updateOrder.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Marcar como Entregue
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
