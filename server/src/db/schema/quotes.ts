import { pgTable, uuid, text, boolean, timestamp, numeric, index } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappConversations } from './whatsapp';
import { sectors } from './sectors';
import { leads } from './sales';

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  quoteNumber: text('quote_number').notNull().unique(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'set null' }),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  
  // Status
  status: text('status').notNull().default('draft'),
  
  // Items and values
  items: text('items'), // JSON
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  discountTotal: numeric('discount_total', { precision: 12, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
  
  // Validity and conditions
  validUntil: timestamp('valid_until', { withTimezone: true }),
  paymentTerms: text('payment_terms'),
  notes: text('notes'),
  
  // Who created
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  isAiGenerated: boolean('is_ai_generated').notNull().default(false),
  
  // Interaction timestamps
  sentAt: timestamp('sent_at', { withTimezone: true }),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_quotes_lead_id').on(table.leadId),
  index('idx_quotes_conversation_id').on(table.conversationId),
  index('idx_quotes_status').on(table.status),
  index('idx_quotes_sector_id').on(table.sectorId),
  index('idx_quotes_created_at').on(table.createdAt),
]);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: text('order_number').notNull().unique(),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'set null' }),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  
  // Status
  status: text('status').notNull().default('pending'),
  
  // Items and values
  items: text('items'), // JSON
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
  
  // Payment
  paymentMethod: text('payment_method'),
  paymentStatus: text('payment_status').notNull().default('pending'),
  paymentLink: text('payment_link'),
  paymentNotes: text('payment_notes'),
  paymentProofUrl: text('payment_proof_url'),
  
  // Confirmation
  paidAt: timestamp('paid_at', { withTimezone: true }),
  confirmedBy: uuid('confirmed_by').references(() => profiles.id, { onDelete: 'set null' }),
  
  // Delivery/Notes
  shippingAddress: text('shipping_address'),
  deliveryNotes: text('delivery_notes'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_orders_quote_id').on(table.quoteId),
  index('idx_orders_lead_id').on(table.leadId),
  index('idx_orders_conversation_id').on(table.conversationId),
  index('idx_orders_status').on(table.status),
  index('idx_orders_payment_status').on(table.paymentStatus),
  index('idx_orders_sector_id').on(table.sectorId),
  index('idx_orders_created_at').on(table.createdAt),
]);

export const negotiationLogs = pgTable('negotiation_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  
  // Action
  action: text('action').notNull(),
  
  // Values
  originalValue: numeric('original_value', { precision: 12, scale: 2 }),
  newValue: numeric('new_value', { precision: 12, scale: 2 }),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
  
  // Context
  agentType: text('agent_type').notNull().default('human'),
  reason: text('reason'),
  customerMessage: text('customer_message'),
  
  // Approval
  requiresApproval: boolean('requires_approval').notNull().default(false),
  approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_negotiation_logs_quote_id').on(table.quoteId),
  index('idx_negotiation_logs_order_id').on(table.orderId),
  index('idx_negotiation_logs_action').on(table.action),
]);

export const paymentLinks = pgTable('payment_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  
  // Type and data
  type: text('type').notNull(),
  url: text('url'),
  description: text('description'),
  instructions: text('instructions'),
  
  // Values
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  
  // Status
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_payment_links_order_id').on(table.orderId),
  index('idx_payment_links_type').on(table.type),
  index('idx_payment_links_is_active').on(table.isActive),
]);
