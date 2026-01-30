import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuotes, Quote } from "@/hooks/sales/useQuotes";
import { useOrders } from "@/hooks/sales/useOrders";
import { QuoteBuilderDialog } from "./QuoteBuilderDialog";
import { QuoteDetailModal } from "./QuoteDetailModal";
import { 
  Plus, 
  Search, 
  FileText,
  Clock,
  Eye,
  Check,
  X,
  AlertTriangle,
  Send,
  ShoppingCart,
  MoreHorizontal
} from "lucide-react";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface QuotesListProps {
  sectorId?: string;
  conversationId?: string;
  leadId?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Rascunho', color: 'bg-gray-500', icon: <FileText className="w-3 h-3" /> },
  sent: { label: 'Enviada', color: 'bg-blue-500', icon: <Send className="w-3 h-3" /> },
  viewed: { label: 'Visualizada', color: 'bg-purple-500', icon: <Eye className="w-3 h-3" /> },
  accepted: { label: 'Aceita', color: 'bg-green-500', icon: <Check className="w-3 h-3" /> },
  rejected: { label: 'Rejeitada', color: 'bg-red-500', icon: <X className="w-3 h-3" /> },
  expired: { label: 'Expirada', color: 'bg-amber-500', icon: <AlertTriangle className="w-3 h-3" /> },
};

export const QuotesList = ({ sectorId, conversationId, leadId }: QuotesListProps) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("__all");
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  const { quotes: quotesRaw, isLoading, sendQuote } = useQuotes({
    sectorId,
    conversationId,
    leadId,
    search: search || undefined,
    status: statusFilter !== "__all" ? statusFilter as any : undefined,
  });

  const { createOrderFromQuote } = useOrders();

  // Defensive: ensure quotes is an array
  const quotes = useMemo(() => {
    if (Array.isArray(quotesRaw)) return quotesRaw;
    if (quotesRaw && typeof quotesRaw === 'object' && Array.isArray((quotesRaw as any).data)) return (quotesRaw as any).data;
    return [] as typeof quotesRaw;
  }, [quotesRaw]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleSendQuote = async (quoteId: string) => {
    await sendQuote.mutateAsync(quoteId);
  };

  const handleConvertToOrder = async (quoteId: string) => {
    await createOrderFromQuote.mutateAsync(quoteId);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Cotações
        </h2>
        <Button onClick={() => setShowBuilder(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Cotação
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número ou notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos os status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  {config.icon}
                  {config.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <ScrollArea className="h-[calc(100vh-300px)]">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : quotes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mb-4" />
              <p className="font-medium">Nenhuma cotação encontrada</p>
              <p className="text-sm">Crie sua primeira cotação clicando no botão acima</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => {
              const statusConfig = STATUS_CONFIG[quote.status];
              const isExpired = quote.valid_until && isPast(new Date(quote.valid_until)) && quote.status === 'sent';
              
              return (
                <Card 
                  key={quote.id} 
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setSelectedQuote(quote)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold">{quote.quote_number}</span>
                          <Badge className={`${statusConfig.color} text-white gap-1`}>
                            {statusConfig.icon}
                            {isExpired ? 'Expirada' : statusConfig.label}
                          </Badge>
                        </div>
                        
                        {quote.lead && (
                          <p className="text-sm text-muted-foreground truncate">
                            {quote.lead.name}
                            {quote.lead.email && ` • ${quote.lead.email}`}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(quote.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                          <span>{quote.items.length} item(s)</span>
                          {quote.valid_until && (
                            <span className={isExpired ? 'text-destructive' : ''}>
                              Válido até: {format(new Date(quote.valid_until), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold text-lg">{formatCurrency(quote.total)}</p>
                          {quote.discount_total > 0 && (
                            <p className="text-xs text-green-600">
                              -{formatCurrency(quote.discount_total)} desc.
                            </p>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {quote.status === 'draft' && (
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleSendQuote(quote.id);
                              }}>
                                <Send className="w-4 h-4 mr-2" />
                                Marcar como Enviada
                              </DropdownMenuItem>
                            )}
                            {(quote.status === 'sent' || quote.status === 'viewed') && (
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleConvertToOrder(quote.id);
                              }}>
                                <ShoppingCart className="w-4 h-4 mr-2" />
                                Converter em Pedido
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQuote(quote);
                            }}>
                              <Eye className="w-4 h-4 mr-2" />
                              Ver Detalhes
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Dialogs */}
      <QuoteBuilderDialog
        open={showBuilder}
        onOpenChange={setShowBuilder}
        sectorId={sectorId}
        conversationId={conversationId}
        leadId={leadId}
      />

      {selectedQuote && (
        <QuoteDetailModal
          open={!!selectedQuote}
          onOpenChange={(open) => !open && setSelectedQuote(null)}
          quote={selectedQuote}
        />
      )}
    </div>
  );
};
