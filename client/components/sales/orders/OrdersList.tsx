import { useState } from "react";
import { useOrders } from "@/hooks/sales/useOrders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Package, 
  Search, 
  Eye, 
  CreditCard,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrderDetailModal } from "./OrderDetailModal";
import { PaymentConfirmationModal } from "./PaymentConfirmationModal";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: <Clock className="w-3 h-3" /> },
  confirmed: { label: "Confirmado", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  paid: { label: "Pago", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: <CreditCard className="w-3 h-3" /> },
  shipped: { label: "Enviado", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: <Truck className="w-3 h-3" /> },
  delivered: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: "Cancelado", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  refunded: { label: "Reembolsado", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: <RefreshCw className="w-3 h-3" /> },
};

const paymentMethodLabels: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  transfer: "Transferência",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  cash: "Dinheiro",
};

export const OrdersList = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);

  const { orders, isLoading } = useOrders();

  const filteredOrders = orders?.filter((order) => {
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const matchesSearch = 
      order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.lead?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.conversation?.contact?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Pedidos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Pedidos ({filteredOrders?.length || 0})
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar pedido..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="shipped">Enviado</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrders?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum pedido encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders?.map((order) => {
                  const status = statusConfig[order.status] || statusConfig.pending;
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">
                        {order.order_number}
                      </TableCell>
                      <TableCell>
                        {order.lead?.name || order.conversation?.contact?.name || "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(order.total)}
                      </TableCell>
                      <TableCell>
                        {order.payment_method 
                          ? paymentMethodLabels[order.payment_method] || order.payment_method
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={status.color}>
                          {status.icon}
                          <span className="ml-1">{status.label}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(order.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedOrder(order.id)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {(order.status === "pending" || order.status === "confirmed") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPaymentOrderId(order.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CreditCard className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedOrder && (
        <OrderDetailModal
          orderId={selectedOrder}
          open={!!selectedOrder}
          onOpenChange={(open) => !open && setSelectedOrder(null)}
        />
      )}

      {paymentOrderId && (
        <PaymentConfirmationModal
          orderId={paymentOrderId}
          open={!!paymentOrderId}
          onOpenChange={(open) => !open && setPaymentOrderId(null)}
        />
      )}
    </>
  );
};
