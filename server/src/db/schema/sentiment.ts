import { pgTable, uuid, text, timestamp, integer, jsonb, varchar, pgEnum, numeric, boolean, unique } from 'drizzle-orm/pg-core';
import { whatsappConversations, whatsappContacts } from './whatsapp';

export const sentimentTypeEnum = pgEnum('sentiment_type', ['positive', 'neutral', 'negative']);

export const whatsappSentimentAnalysis = pgTable('whatsapp_sentiment_analysis', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }).unique(),
  contactId: uuid('contact_id').notNull().references(() => whatsappContacts.id, { onDelete: 'cascade' }),
  sentiment: sentimentTypeEnum('sentiment').default('neutral').notNull(),
  confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
  summary: text('summary'),
  reasoning: text('reasoning'),
  messagesAnalyzed: integer('messages_analyzed').default(0),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappSentimentHistory = pgTable('whatsapp_sentiment_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => whatsappContacts.id, { onDelete: 'cascade' }),
  sentiment: sentimentTypeEnum('sentiment').notNull(),
  confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
  summary: text('summary'),
  messagesAnalyzed: integer('messages_analyzed'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappConversationSummaries = pgTable('whatsapp_conversation_summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  keyPoints: jsonb('key_points').default([]),
  actionItems: jsonb('action_items').default([]),
  sentimentAtTime: varchar('sentiment_at_time', { length: 20 }),
  messagesCount: integer('messages_count').default(0),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const whatsappConversationNotes = pgTable('whatsapp_conversation_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  isPinned: boolean('is_pinned').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const whatsappReactions = pgTable('whatsapp_reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: text('message_id').notNull(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
  reactorJid: text('reactor_jid').notNull(),
  isFromMe: boolean('is_from_me').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  messageReactorUnique: unique('whatsapp_reactions_message_reactor_unique').on(table.messageId, table.reactorJid),
}));

export const whatsappMessageEditHistory = pgTable('whatsapp_message_edit_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: text('message_id').notNull(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  previousContent: text('previous_content').notNull(),
  editedAt: timestamp('edited_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappTopicsHistory = pgTable('whatsapp_topics_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => whatsappContacts.id, { onDelete: 'cascade' }),
  topics: text('topics').array().notNull(),
  primaryTopic: text('primary_topic'),
  aiConfidence: numeric('ai_confidence'),
  aiReasoning: text('ai_reasoning'),
  categorizationModel: text('categorization_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
