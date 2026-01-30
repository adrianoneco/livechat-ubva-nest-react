import { pgTable, uuid, text, timestamp, integer, jsonb, numeric, date, pgEnum, varchar, boolean } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappContacts, whatsappConversations } from './whatsapp';

export const leadSourceEnum = pgEnum('lead_source', ['whatsapp', 'website', 'referral', 'ads', 'organic', 'other']);
export const leadStatusEnum = pgEnum('lead_status', ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']);

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  contact_id: uuid('contact_id').references(() => whatsappContacts.id),
  conversation_id: uuid('conversation_id').references(() => whatsappConversations.id),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  company: text('company'),
  status: leadStatusEnum('status').default('new').notNull(),
  source: leadSourceEnum('source').default('whatsapp').notNull(),
  value: numeric('value', { precision: 12, scale: 2 }).default('0'),
  probability: integer('probability').default(0),
  expected_close_date: date('expected_close_date'),
  assigned_to: uuid('assigned_to').references(() => profiles.id),
  notes: text('notes'),
  tags: text('tags').array().default([]),
  metadata: jsonb('metadata').default({}),
  pipeline_insight: jsonb('pipeline_insight').default({}),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
});

export const leadActivities = pgTable('lead_activities', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => profiles.id),
  activityType: text('activity_type').notNull(),
  description: text('description'),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leadStatusHistory = pgTable('lead_status_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  lead_id: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  old_status: text('old_status'),
  new_status: text('new_status').notNull(),
  changed_by: uuid('changed_by').references(() => profiles.id),
  reason: text('reason'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const salesTargets = pgTable('sales_targets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => profiles.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  targetValue: numeric('target_value', { precision: 12, scale: 2 }).notNull(),
  targetLeads: integer('target_leads'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const kanbanColumnsConfig = pgTable('kanban_columns_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  columnId: text('column_id').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  position: integer('position').default(0),
  isVisible: boolean('is_visible').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
