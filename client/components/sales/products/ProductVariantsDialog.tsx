import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Trash2, 
  Pencil, 
  Package, 
  Loader2,
  X,
  Check
} from 'lucide-react';
import { Product, useProductVariants, ProductVariant } from '@/hooks/sales/useProducts';

interface ProductVariantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}

interface VariantFormData {
  name: string;
  sku: string;
  price_modifier: number;
  is_active: boolean;
}

export const ProductVariantsDialog = ({
  open,
  onOpenChange,
  product,
}: ProductVariantsDialogProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    variants,
    isLoading,
    createVariant,
    updateVariant,
    deleteVariant,
  } = useProductVariants(product?.id);

  const form = useForm<VariantFormData>({
    defaultValues: {
      name: '',
      sku: '',
      price_modifier: 0,
      is_active: true,
    },
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    form.reset({
      name: '',
      sku: '',
      price_modifier: 0,
      is_active: true,
    });
  };

  const handleStartEdit = (variant: ProductVariant) => {
    setEditingId(variant.id);
    setIsAdding(false);
    form.reset({
      name: variant.name,
      sku: variant.sku || '',
      price_modifier: variant.price_modifier,
      is_active: variant.is_active,
    });
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    form.reset();
  };

  const handleSubmit = (values: VariantFormData) => {
    if (!product) return;

    if (editingId) {
      updateVariant.mutate({
        id: editingId,
        name: values.name,
        sku: values.sku || null,
        price_modifier: values.price_modifier,
        is_active: values.is_active,
      }, {
        onSuccess: () => {
          setEditingId(null);
          form.reset();
        },
      });
    } else {
      createVariant.mutate({
        product_id: product.id,
        name: values.name,
        sku: values.sku || null,
        price_modifier: values.price_modifier,
        is_active: values.is_active,
        attributes: {},
        stripe_price_id: null,
      }, {
        onSuccess: () => {
          setIsAdding(false);
          form.reset();
        },
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteVariant.mutate(id);
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Variantes: {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Preço base: <span className="font-medium">{formatPrice(product.base_price)}</span>
          </div>

          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className={`p-3 rounded-lg border ${!variant.is_active ? 'opacity-60' : ''}`}
                >
                  {editingId === variant.id ? (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="Nome da variante" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <FormField
                            control={form.control}
                            name="sku"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input placeholder="SKU" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="price_modifier"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="+/- preço"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <FormField
                            control={form.control}
                            name="is_active"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-2">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="!mt-0">Ativo</FormLabel>
                              </FormItem>
                            )}
                          />
                          <div className="flex gap-1">
                            <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
                              <X className="h-4 w-4" />
                            </Button>
                            <Button type="submit" size="sm" disabled={updateVariant.isPending}>
                              {updateVariant.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </form>
                    </Form>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{variant.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          {variant.sku && <span>SKU: {variant.sku}</span>}
                          <Badge variant={variant.price_modifier >= 0 ? 'default' : 'secondary'}>
                            {variant.price_modifier >= 0 ? '+' : ''}{formatPrice(variant.price_modifier)}
                          </Badge>
                          <span className="text-xs">
                            = {formatPrice(product.base_price + variant.price_modifier)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEdit(variant)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(variant.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {variants.length === 0 && !isAdding && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  Nenhuma variante cadastrada
                </div>
              )}

              {isAdding && (
                <div className="p-3 rounded-lg border border-primary/50 bg-primary/5">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
                      <FormField
                        control={form.control}
                        name="name"
                        rules={{ required: 'Nome é obrigatório' }}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="Nome da variante (ex: Plano Anual)" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={form.control}
                          name="sku"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="SKU (opcional)" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="price_modifier"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="+/- preço base"
                                  {...field}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <FormField
                          control={form.control}
                          name="is_active"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-2">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <FormLabel className="!mt-0">Ativo</FormLabel>
                            </FormItem>
                          )}
                        />
                        <div className="flex gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
                            <X className="h-4 w-4" />
                          </Button>
                          <Button type="submit" size="sm" disabled={createVariant.isPending}>
                            {createVariant.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </form>
                  </Form>
                </div>
              )}
            </div>
          </ScrollArea>

          <Separator />

          <Button
            onClick={handleStartAdd}
            disabled={isAdding || !!editingId}
            className="w-full"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Variante
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
