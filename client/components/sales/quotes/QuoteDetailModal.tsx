import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Quote } from "@/hooks/sales/useQuotes";
import { useOrders } from "@/hooks/sales/useOrders";
import { useNegotiationLogs, getActionLabel } from "@/hooks/sales/useNegotiation";
import { 
  FileText, 
  User, 
  Calendar, 
  Clock, 
  Eye, 
  Send,
  ShoppingCart,
  Check,
  X,
  History
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface QuoteDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-gray-500' },
  sent: { label: 'Enviada', color: 'bg-blue-500' },
  viewed: { label: 'Visualizada', color: 'bg-purple-500' },
  accepted: { label: 'Aceita', color: 'bg-green-500' },
  rejected: { label: 'Rejeitada', color: 'bg-red-500' },
  expired: { label: 'Expirada', color: 'bg-amber-500' },
};

export const QuoteDetailModal = ({ open, onOpenChange, quote }: QuoteDetailModalProps) => {
  const { createOrderFromQuote } = useOrders();
  const { logs } = useNegotiationLogs(quote.id);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleConvertToOrder = async () => {
    await createOrderFromQuote.mutateAsync(quote.id);
    onOpenChange(false);
  };

  const statusConfig = STATUS_CONFIG[quote.status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Cotação {quote.quote_number}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 pr-4">
            {/* Status and Info */}
            <div className="flex items-center justify-between">
              <Badge className={`${statusConfig.color} text-white`}>
                {statusConfig.label}
              </Badge>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(quote.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </span>
                {quote.valid_until && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Válido até {format(new Date(quote.valid_until), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                )}
              </div>
            </div>

            {/* Lead Info */}
            {quote.lead && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{quote.lead.name}</span>
                    {quote.lead.email && (
                      <span className="text-muted-foreground">• {quote.lead.email}</span>
                    )}
                    {quote.lead.phone && (
                      <span className="text-muted-foreground">• {quote.lead.phone}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Items */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Itens</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-3">
                  {quote.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-start py-2 border-b last:border-0">
                      <div className="flex-1">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity}x {formatCurrency(item.unit_price)}
                          {item.discount_percent > 0 && (
                            <span className="text-green-600 ml-2">
                              ({item.discount_percent}% desc.)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(item.subtotal)}</p>
                        {item.discount_amount > 0 && (
                          <p className="text-xs text-green-600">
                            -{formatCurrency(item.discount_amount)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>{formatCurrency(quote.subtotal)}</span>
                  </div>
                  {quote.discount_total > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Descontos</span>
                      <span>-{formatCurrency(quote.discount_total)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(quote.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Terms and Notes */}
            {(quote.payment_terms || quote.notes) && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  {quote.payment_terms && (
                    <div>
                      <p className="text-sm font-medium">Condições de Pagamento</p>
                      <p className="text-sm text-muted-foreground">{quote.payment_terms}</p>
                    </div>
                  )}
                  {quote.notes && (
                    <div>
                      <p className="text-sm font-medium">Observações</p>
                      <p className="text-sm text-muted-foreground">{quote.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Timestamps */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Histórico
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-2 text-sm">
                  {quote.sent_at && (
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-blue-500" />
                      <span>Enviada em {format(new Date(quote.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                    </div>
                  )}
                  {quote.viewed_at && (
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-purple-500" />
                      <span>Visualizada em {format(new Date(quote.viewed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                    </div>
                  )}
                  {quote.responded_at && (
                    <div className="flex items-center gap-2">
                      {quote.status === 'accepted' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <X className="w-4 h-4 text-red-500" />
                      )}
                      <span>
                        {quote.status === 'accepted' ? 'Aceita' : 'Rejeitada'} em{' '}
                        {format(new Date(quote.responded_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Negotiation Logs */}
                {logs.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <p className="font-medium text-sm">Negociações</p>
                      {logs.map((log) => (
                        <div key={log.id} className="text-sm p-2 bg-muted rounded">
                          <div className="flex justify-between">
                            <span className="font-medium">{getActionLabel(log.action)}</span>
                            <span className="text-muted-foreground">
                              {format(new Date(log.created_at), "dd/MM HH:mm")}
                            </span>
                          </div>
                          {log.reason && (
                            <p className="text-muted-foreground mt-1">{log.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {(quote.status === 'sent' || quote.status === 'viewed') && (
            <Button onClick={handleConvertToOrder}>
              <ShoppingCart className="w-4 h-4 mr-2" />
              Converter em Pedido
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
