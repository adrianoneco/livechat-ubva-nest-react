import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, varchar } from 'drizzle-orm/pg-core';
import { profiles } from './users';

// Note: sectors table is defined in ./sectors.ts, but we can't import it here
// due to circular dependency. We use raw uuid reference instead.

export const whatsappInstances = pgTable('whatsapp_instances', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  instanceName: varchar('instance_name', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).default('disconnected'),
  qrCode: text('qr_code'),
  metadata: jsonb('metadata').default({}).notNull(),
  providerType: text('provider_type').default('self_hosted').notNull(),
  instanceIdExternal: text('instance_id_external'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappInstanceSecrets = pgTable('whatsapp_instance_secrets', {
  id: uuid('id').defaultRandom().primaryKey(),
  instanceId: uuid('instance_id').notNull().references(() => whatsappInstances.id, { onDelete: 'cascade' }).unique(),
  apiKey: text('api_key').notNull(),
  apiUrl: text('api_url').notNull(),
  webhookEndpoint: text('webhook_endpoint'),
  webhookBase64: boolean('webhook_base64'),
  providerType: text('provider_type').default('self_hosted'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const whatsappContacts = pgTable('whatsapp_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  instanceId: uuid('instance_id').notNull().references(() => whatsappInstances.id, { onDelete: 'cascade' }),
  phoneNumber: varchar('phone_number', { length: 50 }).notNull(),
  remoteJid: varchar('remote_jid', { length: 255 }), // Stores @lid identifier, unique per instance
  remoteLid: text('remote_lid'), // Stores @lid identifier for linked devices
  name: varchar('name', { length: 255 }).notNull(),
  profilePictureUrl: text('profile_picture_url'),
  isGroup: boolean('is_group').default(false),
  onWhatsapp: boolean('on_whatsapp').default(true),
  notes: text('notes'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappConversations = pgTable('whatsapp_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  instanceId: uuid('instance_id').notNull().references(() => whatsappInstances.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => whatsappContacts.id, { onDelete: 'cascade' }),
  sectorId: uuid('sector_id'), // FK to sectors.id defined at DB level
  remoteJid: varchar('remote_jid', { length: 255 }), // Remote JID identifier
  conversationMode: text('conversation_mode').default('ai'), // 'ai', 'human', 'hybrid'
  status: varchar('status', { length: 50 }).default('active'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  lastMessagePreview: text('last_message_preview'),
  unreadCount: integer('unread_count').default(0),
  assignedTo: uuid('assigned_to').references(() => profiles.id),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  remoteJid: varchar('remote_jid', { length: 255 }).notNull(),
  messageId: varchar('message_id', { length: 255 }).notNull().unique(),
  content: text('content').notNull(),
  messageType: varchar('message_type', { length: 50 }).default('text'),
  mediaUrl: text('media_url'),
  mediaMimetype: varchar('media_mimetype', { length: 100 }),
  mediaFilename: text('media_filename'),
  isFromMe: boolean('is_from_me').default(false),
  isInternal: boolean('is_internal').default(false),
  isSupervisorMessage: boolean('is_supervisor_message').default(false),
  status: varchar('status', { length: 50 }).default('sent'),
  quotedMessageId: varchar('quoted_message_id', { length: 255 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  originalContent: text('original_content'),
  audioTranscription: text('audio_transcription'),
  transcriptionStatus: varchar('transcription_status', { length: 20 }),
  sentBy: uuid('sent_by').references(() => profiles.id),
  deleted: boolean('deleted').default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by').references(() => profiles.id),
  readParticipants: jsonb('read_participants').default([]),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappMacros = pgTable('whatsapp_macros', {
  id: uuid('id').defaultRandom().primaryKey(),
  instanceId: uuid('instance_id').references(() => whatsappInstances.id),
  name: text('name').notNull(),
  shortcut: text('shortcut').notNull(),
  content: text('content').notNull(),
  description: text('description'),
  category: text('category').default('geral'),
  isActive: boolean('is_active').default(true),
  usageCount: integer('usage_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const conversationAssignments = pgTable('conversation_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  assignedFrom: uuid('assigned_from').references(() => profiles.id),
  assignedTo: uuid('assigned_to').notNull().references(() => profiles.id),
  assignedBy: uuid('assigned_by').references(() => profiles.id),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const assignmentRules = pgTable('assignment_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  instanceId: uuid('instance_id').references(() => whatsappInstances.id),
  // Nullable sector reference (managed at DB level to avoid circular imports)
  sectorId: uuid('sector_id'),
  ruleType: text('rule_type').notNull(),
  fixedAgentId: uuid('fixed_agent_id').references(() => profiles.id),
  roundRobinAgents: uuid('round_robin_agents').array(),
  roundRobinLastIndex: integer('round_robin_last_index').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
