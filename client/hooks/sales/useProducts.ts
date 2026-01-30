import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/api/types';

export interface Product {
  id: string;
  sector_id: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  category: string;
  base_price: number;
  currency: string;
  is_active: boolean;
  min_quantity: number;
  max_discount_percent: number;
  features: string[];
  images: string[];
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  sector?: { name: string } | null;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price_modifier: number;
  is_active: boolean;
  attributes: Json;
  stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductFilters {
  sectorId?: string;
  category?: string;
  isActive?: boolean;
  search?: string;
}

export type ProductInsert = Omit<Product, 'id' | 'created_at' | 'updated_at' | 'sector'>;
export type ProductUpdate = Partial<ProductInsert> & { id: string };

export const useProducts = (filters?: ProductFilters) => {
  const queryClient = useQueryClient();

  const { data: products, isLoading, error } = useQuery({
    queryKey: ['products', filters],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*, sector:sectors(name)')
        .order('created_at', { ascending: false });

      if (filters?.sectorId) {
        query = query.eq('sector_id', filters.sectorId);
      }
      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Product[];
    },
  });

  const createProduct = useMutation({
    mutationFn: async (product: {
      name: string;
      sector_id?: string | null;
      description?: string | null;
      sku?: string | null;
      category?: string;
      base_price?: number;
      currency?: string;
      is_active?: boolean;
      min_quantity?: number;
      max_discount_percent?: number;
      features?: string[];
      images?: string[];
      stripe_price_id?: string | null;
      stripe_product_id?: string | null;
      metadata?: Json;
    }) => {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto criado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar produto');
    },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<{
      name: string;
      sector_id: string | null;
      description: string | null;
      sku: string | null;
      category: string;
      base_price: number;
      currency: string;
      is_active: boolean;
      min_quantity: number;
      max_discount_percent: number;
      features: string[];
      images: string[];
      stripe_price_id: string | null;
      stripe_product_id: string | null;
      metadata: Json;
    }>) => {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto atualizado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar produto');
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto excluído');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao excluir produto');
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('products')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(variables.isActive ? 'Produto ativado' : 'Produto desativado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao alterar status');
    },
  });

  return {
    products: products || [],
    isLoading,
    error,
    createProduct,
    updateProduct,
    deleteProduct,
    toggleActive,
  };
};

// Hook para variantes de produto
export const useProductVariants = (productId?: string) => {
  const queryClient = useQueryClient();

  const { data: variants, isLoading } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: async () => {
      if (!productId) return [];

      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ProductVariant[];
    },
    enabled: !!productId,
  });

  const createVariant = useMutation({
    mutationFn: async (variant: {
      product_id: string;
      name: string;
      sku?: string | null;
      price_modifier?: number;
      is_active?: boolean;
      attributes?: Json;
      stripe_price_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('product_variants')
        .insert(variant)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast.success('Variante criada');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar variante');
    },
  });

  const updateVariant = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<{
      name: string;
      sku: string | null;
      price_modifier: number;
      is_active: boolean;
      attributes: Json;
      stripe_price_id: string | null;
    }>) => {
      const { data, error } = await supabase
        .from('product_variants')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast.success('Variante atualizada');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar variante');
    },
  });

  const deleteVariant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast.success('Variante excluída');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao excluir variante');
    },
  });

  return {
    variants: variants || [],
    isLoading,
    createVariant,
    updateVariant,
    deleteVariant,
  };
};
