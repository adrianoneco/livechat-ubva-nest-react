import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Product } from '@/hooks/sales/useProducts';
import { useSectors } from '@/hooks/useSectors';
import { Loader2 } from 'lucide-react';

const productSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  sku: z.string().optional(),
  category: z.string().min(1, 'Categoria é obrigatória'),
  base_price: z.coerce.number().min(0, 'Preço deve ser positivo'),
  currency: z.string().default('BRL'),
  is_active: z.boolean().default(true),
  min_quantity: z.coerce.number().int().min(1).default(1),
  max_discount_percent: z.coerce.number().int().min(0).max(100).default(0),
  sector_id: z.string().optional(),
  features: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSubmit: (values: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'sector'>) => void;
  isLoading?: boolean;
}

export const ProductDialog = ({
  open,
  onOpenChange,
  product,
  onSubmit,
  isLoading,
}: ProductDialogProps) => {
  const { sectors } = useSectors();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      sku: '',
      category: 'produto',
      base_price: 0,
      currency: 'BRL',
      is_active: true,
      min_quantity: 1,
      max_discount_percent: 0,
      sector_id: '__none__',
      features: '',
    },
  });

  useEffect(() => {
    if (open) {
      if (product) {
        form.reset({
          name: product.name,
          description: product.description || '',
          sku: product.sku || '',
          category: product.category,
          base_price: product.base_price,
          currency: product.currency,
          is_active: product.is_active,
          min_quantity: product.min_quantity,
          max_discount_percent: product.max_discount_percent,
          sector_id: product.sector_id || '__none__',
          features: product.features?.join(', ') || '',
        });
      } else {
        form.reset({
          name: '',
          description: '',
          sku: '',
          category: 'produto',
          base_price: 0,
          currency: 'BRL',
          is_active: true,
          min_quantity: 1,
          max_discount_percent: 0,
          sector_id: '__none__',
          features: '',
        });
      }
    }
  }, [open, product, form]);

  const handleSubmit = (values: ProductFormValues) => {
    const featuresArray = values.features
      ? values.features.split(',').map(f => f.trim()).filter(Boolean)
      : [];

    onSubmit({
      name: values.name,
      description: values.description || null,
      sku: values.sku || null,
      category: values.category,
      base_price: values.base_price,
      currency: values.currency,
      is_active: values.is_active,
      min_quantity: values.min_quantity,
      max_discount_percent: values.max_discount_percent,
      sector_id: values.sector_id === '__none__' ? null : values.sector_id,
      features: featuresArray,
      images: product?.images || [],
      stripe_price_id: product?.stripe_price_id || null,
      stripe_product_id: product?.stripe_product_id || null,
      metadata: product?.metadata || {},
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {product ? 'Editar Produto' : 'Novo Produto'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do produto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input placeholder="Código" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="produto">Produto</SelectItem>
                        <SelectItem value="serviço">Serviço</SelectItem>
                        <SelectItem value="pacote">Pacote</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descrição do produto/serviço"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="base_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço Base *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_discount_percent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desconto Máximo (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="0"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="min_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade Mínima</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sector_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Setor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Todos os setores</SelectItem>
                        {sectors.map((sector) => (
                          <SelectItem key={sector.id} value={sector.id}>
                            {sector.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="features"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Funcionalidades/Características</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Garantia, Suporte 24h, Entrega grátis"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Separe por vírgula
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Produto Ativo</FormLabel>
                    <FormDescription>
                      Produtos inativos não aparecem para venda
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {product ? 'Salvar' : 'Criar Produto'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
