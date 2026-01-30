import { pgTable, uuid, text, boolean, timestamp, integer, unique, index } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappInstances, whatsappConversations } from './whatsapp';
import { sectors } from './sectors';

export const escalationQueue = pgTable('escalation_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  instanceId: uuid('instance_id').references(() => whatsappInstances.id, { onDelete: 'set null' }),
  
  // Context for human
  aiSummary: text('ai_summary'),
  escalationReason: text('escalation_reason').notNull().default('manual'),
  detectedIntent: text('detected_intent'),
  leadScore: integer('lead_score'),
  customerSentiment: text('customer_sentiment'),
  
  // Priority
  priority: integer('priority').default(0),
  
  // State
  status: text('status').notNull().default('pending'),
  assignedTo: uuid('assigned_to').references(() => profiles.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNotes: text('resolution_notes'),
  
  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('idx_escalation_queue_status').on(table.status),
  index('idx_escalation_queue_sector').on(table.sectorId),
  index('idx_escalation_queue_priority').on(table.priority),
  index('idx_escalation_queue_conversation').on(table.conversationId),
]);

export const escalationNotifications = pgTable('escalation_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  escalationId: uuid('escalation_id').notNull().references(() => escalationQueue.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  
  notificationType: text('notification_type').notNull().default('new_escalation'),
  readAt: timestamp('read_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('escalation_notification_unique').on(table.escalationId, table.userId, table.notificationType),
  index('idx_escalation_notifications_user').on(table.userId),
]);

export const escalationDistributionConfig = pgTable('escalation_distribution_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').notNull().references(() => sectors.id, { onDelete: 'cascade' }).unique(),
  
  distributionMethod: text('distribution_method').notNull().default('round_robin'),
  autoAssignEnabled: boolean('auto_assign_enabled').default(false),
  maxQueueTimeMinutes: integer('max_queue_time_minutes').default(30),
  priorityBoostAfterMinutes: integer('priority_boost_after_minutes').default(10),
  maxConcurrentEscalationsPerAgent: integer('max_concurrent_escalations_per_agent').default(5),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
