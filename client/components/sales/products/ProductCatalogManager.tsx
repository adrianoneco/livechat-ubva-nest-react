import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Package, Filter } from 'lucide-react';
import { useProducts, Product } from '@/hooks/sales/useProducts';
import { useSectors } from '@/hooks/useSectors';
import { ProductCard } from './ProductCard';
import { ProductDialog } from './ProductDialog';
import { ProductVariantsDialog } from './ProductVariantsDialog';

interface ProductCatalogManagerProps {
  sectorId?: string;
}

export const ProductCatalogManager = ({ sectorId }: ProductCatalogManagerProps) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [variantsProduct, setVariantsProduct] = useState<Product | null>(null);

  const { sectors } = useSectors();

  const {
    products: productsRaw,
    isLoading,
    createProduct,
    updateProduct,
    deleteProduct,
    toggleActive,
  } = useProducts({
    sectorId,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
    search: search || undefined,
  });

  // Defensive: ensure products is an array
  const products = useMemo(() => {
    if (Array.isArray(productsRaw)) return productsRaw;
    if (productsRaw && typeof productsRaw === 'object' && Array.isArray((productsRaw as any).data)) return (productsRaw as any).data;
    return [] as typeof productsRaw;
  }, [productsRaw]);

  const handleCreate = () => {
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const handleSubmit = (values: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'sector'>) => {
    if (editingProduct) {
      updateProduct.mutate({ id: editingProduct.id, ...values }, {
        onSuccess: () => setDialogOpen(false),
      });
    } else {
      createProduct.mutate(values, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const handleDelete = () => {
    if (deletingProduct) {
      deleteProduct.mutate(deletingProduct.id, {
        onSuccess: () => setDeletingProduct(null),
      });
    }
  };

  const stats = {
    total: products.length,
    active: products.filter(p => p.is_active).length,
    products: products.filter(p => p.category === 'produto').length,
    services: products.filter(p => p.category === 'serviço').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="bg-green-500/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          <div className="text-xs text-muted-foreground">Ativos</div>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.products}</div>
          <div className="text-xs text-muted-foreground">Produtos</div>
        </div>
        <div className="bg-purple-500/10 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.services}</div>
          <div className="text-xs text-muted-foreground">Serviços</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="produto">Produtos</SelectItem>
            <SelectItem value="serviço">Serviços</SelectItem>
            <SelectItem value="pacote">Pacotes</SelectItem>
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Produto
        </Button>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium mb-1">Nenhum produto encontrado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {search || categoryFilter !== 'all'
              ? 'Tente ajustar os filtros'
              : 'Comece adicionando seu primeiro produto'}
          </p>
          {!search && categoryFilter === 'all' && (
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Produto
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={handleEdit}
              onDelete={setDeletingProduct}
              onToggleActive={(id, isActive) => toggleActive.mutate({ id, isActive })}
              onManageVariants={setVariantsProduct}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
        onSubmit={handleSubmit}
        isLoading={createProduct.isPending || updateProduct.isPending}
      />

      <ProductVariantsDialog
        open={!!variantsProduct}
        onOpenChange={(open) => !open && setVariantsProduct(null)}
        product={variantsProduct}
      />

      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deletingProduct?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
