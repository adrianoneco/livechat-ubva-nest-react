import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { profiles } from './users';

export const userPasswords = pgTable('user_passwords', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }).unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
