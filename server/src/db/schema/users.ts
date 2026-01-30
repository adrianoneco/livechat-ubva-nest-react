import { pgTable, uuid, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const appRoleEnum = pgEnum('app_role', ['admin', 'supervisor', 'agent']);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  fullName: text('full_name').notNull(),
  avatarUrl: text('avatar_url'),
  status: text('status').default('online'),
  email: text('email'),
  isActive: boolean('is_active').default(true).notNull(),
  isApproved: boolean('is_approved').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const userRoles = pgTable('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  role: appRoleEnum('role').default('agent').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const projectConfig = pgTable('project_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
