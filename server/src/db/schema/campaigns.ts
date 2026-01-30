import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';

export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('draft'), // draft, scheduled, sending, completed, cancelled
  messageTemplate: text('message_template').notNull(),
  mediaUrl: text('media_url'),
  mediaType: varchar('media_type', { length: 50 }), // image, video, document, audio
  targetAudience: jsonb('target_audience'), // Filter criteria
  scheduledAt: timestamp('scheduled_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  totalRecipients: integer('total_recipients').default(0),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  readCount: integer('read_count').default(0),
  failedCount: integer('failed_count').default(0),
  instanceId: uuid('instance_id'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const campaignMessages = pgTable('campaign_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  contactId: uuid('contact_id').notNull(),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, sent, delivered, read, failed
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  error: text('error'),
  whatsappMessageId: varchar('whatsapp_message_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const escalations = pgTable('escalations', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull(),
  reason: varchar('reason', { length: 100 }).notNull(), // keyword_match, negative_sentiment, timeout, manual
  escalationKeyword: varchar('escalation_keyword', { length: 255 }),
  originalAgentId: uuid('original_agent_id'),
  escalatedTo: uuid('escalated_to'), // User or team
  escalationType: varchar('escalation_type', { length: 50 }).notNull().default('user'), // user, team, supervisor
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, assigned, resolved
  priority: varchar('priority', { length: 50 }).default('medium'), // low, medium, high, urgent
  notes: text('notes'),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: uuid('resolved_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const meetings = pgTable('meetings', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id'),
  contactId: uuid('contact_id'),
  conversationId: uuid('conversation_id'),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  scheduledAt: timestamp('scheduled_at').notNull(),
  duration: integer('duration').notNull().default(60), // minutes
  location: varchar('location', { length: 255 }),
  meetingUrl: text('meeting_url'),
  status: varchar('status', { length: 50 }).notNull().default('scheduled'), // scheduled, confirmed, completed, cancelled, no_show
  attendees: jsonb('attendees'), // Array of user IDs
  reminderSent: boolean('reminder_sent').default(false),
  reminderSentAt: timestamp('reminder_sent_at'),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const knowledgeBase = pgTable('knowledge_base', {
  id: uuid('id').defaultRandom().primaryKey(),
  sectorId: uuid('sector_id'),
  category: varchar('category', { length: 100 }).notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  keywords: jsonb('keywords'), // Array of keywords for matching
  useCount: integer('use_count').default(0),
  lastUsedAt: timestamp('last_used_at'),
  isActive: boolean('is_active').default(true),
  priority: integer('priority').default(0), // Higher priority = shown first
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const knowledgeOptimizationLog = pgTable('knowledge_optimization_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  optimizationType: varchar('optimization_type', { length: 100 }).notNull(), // consolidation, update, new_entry
  itemsAffected: integer('items_affected').default(0),
  changes: jsonb('changes'), // Details of what changed
  performedBy: varchar('performed_by', { length: 50 }).default('system'), // system or user_id
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const teamInvites = pgTable('team_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('agent'),
  sectorId: uuid('sector_id'),
  inviteToken: varchar('invite_token', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, accepted, expired
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  invitedBy: uuid('invited_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
