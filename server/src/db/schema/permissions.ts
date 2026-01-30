import { pgTable, uuid, text, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { sectors } from './sectors';

export const permissionTypes = pgTable('permission_types', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').default('general'),
  defaultForAdmin: boolean('default_for_admin').default(true),
  defaultForSupervisor: boolean('default_for_supervisor').default(false),
  defaultForAgent: boolean('default_for_agent').default(false),
  defaultForManager: boolean('default_for_manager').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const sectorPermissions = pgTable('sector_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').notNull().references(() => sectors.id, { onDelete: 'cascade' }),
  permissionKey: text('permission_key').notNull().references(() => permissionTypes.key, { onDelete: 'cascade' }),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('sector_permissions_unique').on(table.sectorId, table.permissionKey),
  index('idx_sector_permissions_sector').on(table.sectorId),
]);

export const userPermissionOverrides = pgTable('user_permission_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  permissionKey: text('permission_key').notNull().references(() => permissionTypes.key, { onDelete: 'cascade' }),
  isEnabled: boolean('is_enabled').notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('user_permission_overrides_unique').on(table.userId, table.permissionKey),
  index('idx_user_permission_overrides_user').on(table.userId),
]);

export const permissionAuditLogs = pgTable('permission_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  changedBy: uuid('changed_by').notNull().references(() => profiles.id),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  permissionKey: text('permission_key').notNull(),
  oldValue: boolean('old_value'),
  newValue: boolean('new_value'),
  reason: text('reason'),
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_permission_audit_logs_target').on(table.targetType, table.targetId),
  index('idx_permission_audit_logs_created').on(table.createdAt),
]);
