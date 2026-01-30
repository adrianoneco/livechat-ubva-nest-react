import { pgTable, uuid, text, boolean, timestamp, integer, numeric, index } from 'drizzle-orm/pg-core';
import { sectors } from './sectors';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  sku: text('sku'),
  category: text('category').notNull().default('produto'),
  basePrice: numeric('base_price', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('BRL'),
  isActive: boolean('is_active').notNull().default(true),
  minQuantity: integer('min_quantity').notNull().default(1),
  maxDiscountPercent: integer('max_discount_percent').notNull().default(0),
  features: text('features'), // JSON
  images: text('images').array(),
  stripePriceId: text('stripe_price_id'),
  stripeProductId: text('stripe_product_id'),
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_products_sector').on(table.sectorId),
  index('idx_products_category').on(table.category),
]);

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sku: text('sku'),
  priceModifier: numeric('price_modifier', { precision: 12, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  attributes: text('attributes'), // JSON
  stripePriceId: text('stripe_price_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_product_variants_product').on(table.productId),
]);
