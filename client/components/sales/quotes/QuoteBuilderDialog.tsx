import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useProducts, Product } from "@/hooks/sales/useProducts";
import { useQuotes, QuoteItem, CreateQuoteInput } from "@/hooks/sales/useQuotes";
import { useSectors } from "@/hooks/useSectors";
import { 
  Plus, 
  Minus, 
  Trash2, 
  Search, 
  ShoppingCart,
  Percent,
  Calendar,
  FileText,
  Loader2,
  Package
} from "lucide-react";
import { format, addDays } from "date-fns";

interface QuoteBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  conversationId?: string;
  sectorId?: string;
  onSuccess?: (quoteId: string) => void;
}

export const QuoteBuilderDialog = ({
  open,
  onOpenChange,
  leadId,
  conversationId,
  sectorId,
  onSuccess,
}: QuoteBuilderDialogProps) => {
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSectorId, setSelectedSectorId] = useState(sectorId || "");
  const [validDays, setValidDays] = useState("7");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");

  const { products, isLoading: productsLoading } = useProducts({ 
    search: searchTerm,
    sectorId: selectedSectorId || undefined,
    isActive: true,
  });
  const { sectors } = useSectors();
  const { createQuote } = useQuotes();

  useEffect(() => {
    if (sectorId) {
      setSelectedSectorId(sectorId);
    }
  }, [sectorId]);

  const handleAddProduct = (product: Product) => {
    const existingIndex = items.findIndex(item => item.product_id === product.id);
    
    if (existingIndex >= 0) {
      // Increase quantity
      const newItems = [...items];
      newItems[existingIndex].quantity += 1;
      newItems[existingIndex].subtotal = newItems[existingIndex].quantity * newItems[existingIndex].unit_price;
      setItems(newItems);
    } else {
      // Add new item
      const newItem: QuoteItem = {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku || undefined,
        quantity: 1,
        unit_price: product.base_price,
        discount_percent: 0,
        discount_amount: 0,
        subtotal: product.base_price,
      };
      setItems([...items, newItem]);
    }
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    const newItems = [...items];
    const newQty = Math.max(1, newItems[index].quantity + delta);
    newItems[index].quantity = newQty;
    recalculateItem(newItems, index);
    setItems(newItems);
  };

  const handleUpdateDiscount = (index: number, discountPercent: number) => {
    const newItems = [...items];
    const product = products.find(p => p.id === newItems[index].product_id);
    const maxDiscount = product?.max_discount_percent || 100;
    
    newItems[index].discount_percent = Math.min(discountPercent, maxDiscount);
    recalculateItem(newItems, index);
    setItems(newItems);
  };

  const recalculateItem = (items: QuoteItem[], index: number) => {
    const item = items[index];
    const baseTotal = item.quantity * item.unit_price;
    item.discount_amount = (baseTotal * item.discount_percent) / 100;
    item.subtotal = baseTotal - item.discount_amount;
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);
    const discountTotal = items.reduce((acc, item) => acc + item.discount_amount, 0);
    const total = subtotal - discountTotal;
    return { subtotal, discountTotal, total };
  };

  const handleSubmit = async () => {
    if (items.length === 0) return;

    const input: CreateQuoteInput = {
      lead_id: leadId,
      conversation_id: conversationId,
      sector_id: selectedSectorId || undefined,
      items,
      valid_until: addDays(new Date(), parseInt(validDays)).toISOString(),
      payment_terms: paymentTerms || undefined,
      notes: notes || undefined,
    };

    try {
      const result = await createQuote.mutateAsync(input);
      onSuccess?.(result.id);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const resetForm = () => {
    setItems([]);
    setSearchTerm("");
    setValidDays("7");
    setPaymentTerms("");
    setNotes("");
  };

  const { subtotal, discountTotal, total } = calculateTotals();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Criar Cotação
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          {/* Left: Product Search */}
          <div className="flex flex-col min-h-0">
            <div className="space-y-3 mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produtos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos os setores</SelectItem>
                  {sectors.map((sector) => (
                    <SelectItem key={sector.id} value={sector.id}>
                      {sector.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="flex-1 border rounded-md">
              <div className="p-2 space-y-2">
                {productsLoading ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Package className="w-8 h-8 mb-2" />
                    <p className="text-sm">Nenhum produto encontrado</p>
                  </div>
                ) : (
                  products.map((product) => (
                    <Card 
                      key={product.id} 
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleAddProduct(product)}
                    >
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{product.name}</p>
                            {product.sku && (
                              <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-primary">
                              {formatCurrency(product.base_price)}
                            </p>
                            {product.max_discount_percent > 0 && (
                              <Badge variant="outline" className="text-xs">
                                Até {product.max_discount_percent}% desc.
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Cart */}
          <div className="flex flex-col min-h-0">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Itens da Cotação ({items.length})
            </h3>

            <ScrollArea className="flex-1 border rounded-md mb-3">
              <div className="p-2 space-y-2">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <ShoppingCart className="w-8 h-8 mb-2" />
                    <p className="text-sm">Adicione produtos à cotação</p>
                  </div>
                ) : (
                  items.map((item, index) => (
                    <Card key={item.product_id}>
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(item.unit_price)} / unidade
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {/* Quantity */}
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleUpdateQuantity(index, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleUpdateQuantity(index, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>

                          {/* Discount */}
                          <div className="flex items-center gap-1">
                            <Percent className="w-3 h-3 text-muted-foreground" />
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discount_percent}
                              onChange={(e) => handleUpdateDiscount(index, parseFloat(e.target.value) || 0)}
                              className="w-16 h-7 text-sm"
                            />
                          </div>

                          {/* Subtotal */}
                          <div className="flex-1 text-right">
                            <p className="font-semibold">{formatCurrency(item.subtotal)}</p>
                            {item.discount_amount > 0 && (
                              <p className="text-xs text-green-600">
                                -{formatCurrency(item.discount_amount)}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Totals */}
            <Card className="mb-3">
              <CardContent className="p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Descontos</span>
                    <span>-{formatCurrency(discountTotal)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Options */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Validade (dias)
                  </Label>
                  <Select value={validDays} onValueChange={setValidDays}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 dias</SelectItem>
                      <SelectItem value="7">7 dias</SelectItem>
                      <SelectItem value="15">15 dias</SelectItem>
                      <SelectItem value="30">30 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Condições de Pagamento</Label>
                  <Input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Ex: À vista, PIX"
                    className="h-8"
                  />
                </div>
              </div>
              
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações adicionais..."
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={items.length === 0 || createQuote.isPending}
          >
            {createQuote.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar Cotação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
