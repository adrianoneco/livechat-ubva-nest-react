import { pgTable, uuid, text, timestamp, integer, boolean, index, serial } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappConversations } from './whatsapp';
import { sectors } from './sectors';

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: serial('numero'),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('aberto'),
  canal: text('canal').default('whatsapp'),
  categoria: text('categoria').default('outro'),
  prioridade: text('prioridade').default('media'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => profiles.id),
}, (table) => [
  index('idx_tickets_conversation_id').on(table.conversationId),
  index('idx_tickets_sector_id').on(table.sectorId),
  index('idx_tickets_status').on(table.status),
]);

export const feedbacks = pgTable('feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  nota: integer('nota').notNull(),
  comentario: text('comentario'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_feedbacks_ticket_id').on(table.ticketId),
]);

export const slaConfig = pgTable('sla_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }).unique(),
  
  // Response time SLAs (in minutes)
  firstResponseTimeMinutes: integer('first_response_time_minutes').default(15),
  resolutionTimeMinutes: integer('resolution_time_minutes').default(240),
  
  // Priority escalation
  priorityEscalationEnabled: boolean('priority_escalation_enabled').default(true),
  escalationThresholdMinutes: integer('escalation_threshold_minutes').default(30),
  
  // Working hours
  workingHoursStart: text('working_hours_start').default('09:00'),
  workingHoursEnd: text('working_hours_end').default('18:00'),
  workingDays: text('working_days').array(),
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const slaViolations = pgTable('sla_violations', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
  slaConfigId: uuid('sla_config_id').references(() => slaConfig.id, { onDelete: 'set null' }),
  
  violationType: text('violation_type').notNull(), // 'first_response', 'resolution'
  expectedTimeMinutes: integer('expected_time_minutes'),
  actualTimeMinutes: integer('actual_time_minutes'),
  
  acknowledged: boolean('acknowledged').default(false),
  acknowledgedBy: uuid('acknowledged_by').references(() => profiles.id),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_sla_violations_conversation').on(table.conversationId),
  index('idx_sla_violations_ticket').on(table.ticketId),
  index('idx_sla_violations_type').on(table.violationType),
]);
