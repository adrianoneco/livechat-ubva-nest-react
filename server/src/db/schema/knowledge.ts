import { pgTable, uuid, text, boolean, timestamp, integer, real, index } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappConversations, whatsappMessages } from './whatsapp';
import { sectors } from './sectors';

export const businessKnowledgeBase = pgTable('business_knowledge_base', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  
  // Categorization
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  
  // Content
  title: text('title').notNull(),
  content: text('content').notNull(),
  keywords: text('keywords').array(),
  
  // Metadata
  source: text('source').default('manual'),
  confidenceScore: real('confidence_score').default(1.0),
  usageCount: integer('usage_count').default(0),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  
  // Control
  isActive: boolean('is_active').default(true),
  isVerified: boolean('is_verified').default(false),
  createdBy: uuid('created_by').references(() => profiles.id),
  verifiedBy: uuid('verified_by').references(() => profiles.id),
  
  // Versioning
  version: integer('version').default(1),
  parentId: uuid('parent_id'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_knowledge_base_sector').on(table.sectorId),
  index('idx_knowledge_base_category').on(table.category),
]);

export const responseTemplates = pgTable('response_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  
  // Identification
  name: text('name').notNull(),
  description: text('description'),
  
  // Content
  triggerPatterns: text('trigger_patterns').array(),
  templateContent: text('template_content').notNull(),
  variables: text('variables'), // JSON
  
  // Categorization
  category: text('category'),
  intentMatch: text('intent_match').array(),
  
  // Performance metrics
  usageCount: integer('usage_count').default(0),
  successRate: real('success_rate'),
  avgSentimentAfter: real('avg_sentiment_after'),
  
  // Control
  isActive: boolean('is_active').default(true),
  priority: integer('priority').default(0),
  
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_response_templates_sector').on(table.sectorId),
  index('idx_response_templates_category').on(table.category),
]);

export const learningExamples = pgTable('learning_examples', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  
  // Source
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'set null' }),
  messageId: uuid('message_id').references(() => whatsappMessages.id, { onDelete: 'set null' }),
  
  // Content
  inputContext: text('input_context').notNull(),
  idealResponse: text('ideal_response').notNull(),
  
  // Classification
  scenarioType: text('scenario_type'),
  tags: text('tags').array(),
  
  // Quality metrics
  qualityScore: real('quality_score'),
  leadConverted: boolean('lead_converted').default(false),
  customerSatisfied: boolean('customer_satisfied').default(false),
  
  // Feedback
  markedAsGoodBy: uuid('marked_as_good_by').references(() => profiles.id),
  markedAt: timestamp('marked_at', { withTimezone: true }),
  notes: text('notes'),
  
  // Usage tracking
  timesReferenced: integer('times_referenced').default(0),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_learning_examples_sector').on(table.sectorId),
  index('idx_learning_examples_scenario').on(table.scenarioType),
]);
