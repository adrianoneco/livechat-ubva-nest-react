import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { 
  Package, 
  Pencil, 
  Trash2, 
  Tag, 
  Percent,
  Layers
} from 'lucide-react';
import { Product } from '@/hooks/sales/useProducts';
import { useMemo } from 'react';

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onManageVariants?: (product: Product) => void;
}

export const ProductCard = ({
  product,
  onEdit,
  onDelete,
  onToggleActive,
  onManageVariants,
}: ProductCardProps) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: product.currency || 'BRL',
    }).format(price);
  };

  // Defensive: ensure features is an array before using slice/map
  const features = useMemo(() => {
    const f = (product as any).features;
    if (Array.isArray(f)) return f as string[];
    if (f && typeof f === 'object' && Array.isArray(f.data)) return f.data as string[];
    if (typeof f === 'string') return [f];
    return [] as string[];
  }, [product.features]);

  const categoryLabels: Record<string, string> = {
    produto: 'Produto',
    serviço: 'Serviço',
    pacote: 'Pacote',
  };

  return (
    <Card className={`transition-all ${!product.is_active ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold line-clamp-1">{product.name}</h3>
              {product.sku && (
                <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
              )}
            </div>
          </div>
          <Switch
            checked={product.is_active}
            onCheckedChange={(checked) => onToggleActive(product.id, checked)}
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {product.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}
        
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            <Tag className="h-3 w-3 mr-1" />
            {categoryLabels[product.category] || product.category}
          </Badge>
          
          {product.max_discount_percent > 0 && (
            <Badge variant="outline">
              <Percent className="h-3 w-3 mr-1" />
              Até {product.max_discount_percent}% desc.
            </Badge>
          )}
          
          {product.sector?.name && (
            <Badge variant="outline" className="text-xs">
              {product.sector.name}
            </Badge>
          )}
        </div>
        
        <div className="pt-2 border-t">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-primary">
              {formatPrice(product.base_price)}
            </span>
            {product.min_quantity > 1 && (
              <span className="text-xs text-muted-foreground">
                Mín. {product.min_quantity} un.
              </span>
            )}
          </div>
        </div>
        
        {features.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {features.slice(0, 3).map((feature, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {feature}
              </Badge>
            ))}
            {features.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{features.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="pt-2 gap-2">
        {onManageVariants && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onManageVariants(product)}
            className="flex-1"
          >
            <Layers className="h-4 w-4 mr-1" />
            Variantes
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(product)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(product)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};
