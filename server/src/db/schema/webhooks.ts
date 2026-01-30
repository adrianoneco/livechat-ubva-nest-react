import { pgTable, uuid, text, boolean, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { profiles } from './users';

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret'),
  events: text('events').array(),
  isActive: boolean('is_active').default(true),
  headers: text('headers'), // JSON
  retryCount: integer('retry_count').default(3),
  retryDelay: integer('retry_delay').default(1000),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_webhooks_user_id').on(table.userId),
  index('idx_webhooks_is_active').on(table.isActive),
]);

export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id').references(() => webhooks.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  payload: text('payload'), // JSON
  response: text('response'), // JSON
  statusCode: integer('status_code'),
  success: boolean('success').default(false),
  error: text('error'),
  duration: integer('duration'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_webhook_logs_webhook_id').on(table.webhookId),
  index('idx_webhook_logs_event').on(table.event),
  index('idx_webhook_logs_created_at').on(table.createdAt),
]);

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  prefix: text('prefix'),
  permissions: text('permissions').array(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_api_tokens_user_id').on(table.userId),
  index('idx_api_tokens_token').on(table.token),
]);

export const apiUsageLogs = pgTable('api_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenId: uuid('token_id').references(() => apiTokens.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  endpoint: text('endpoint').notNull(),
  method: text('method').notNull(),
  statusCode: integer('status_code'),
  responseTime: integer('response_time'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  requestBody: text('request_body'), // JSON (truncated)
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_api_usage_logs_token_id').on(table.tokenId),
  index('idx_api_usage_logs_user_id').on(table.userId),
  index('idx_api_usage_logs_endpoint').on(table.endpoint),
  index('idx_api_usage_logs_created_at').on(table.createdAt),
]);
