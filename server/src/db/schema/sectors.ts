import { pgTable, uuid, text, boolean, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappInstances } from './whatsapp';

export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').references(() => whatsappInstances.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  tipoAtendimento: text('tipo_atendimento').default('humano'),
  geraTicket: boolean('gera_ticket').default(false),
  geraTicketUsuarios: boolean('gera_ticket_usuarios').default(false),
  geraTicketGrupos: boolean('gera_ticket_grupos').default(false),
  gruposPermitidosTodos: boolean('grupos_permitidos_todos').default(true),
  mensagemBoasVindas: text('mensagem_boas_vindas'),
  mensagemReabertura: text('mensagem_reabertura'),
  mensagemEncerramento: text('mensagem_encerramento'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const userSectors = pgTable('user_sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('user_sectors_unique').on(table.userId, table.sectorId)
]);

// Many-to-many relationship between sectors and whatsapp_instances
export const sectorInstances = pgTable('sector_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').notNull().references(() => sectors.id, { onDelete: 'cascade' }),
  instanceId: uuid('instance_id').notNull().references(() => whatsappInstances.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('sector_instances_unique').on(table.sectorId, table.instanceId),
  index('idx_sector_instances_sector_id').on(table.sectorId),
  index('idx_sector_instances_instance_id').on(table.instanceId),
]);

// Allowed WhatsApp groups per sector
export const sectorAllowedGroups = pgTable('sector_allowed_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').notNull().references(() => sectors.id, { onDelete: 'cascade' }),
  groupJid: text('group_jid').notNull(),
  groupName: text('group_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('sector_allowed_groups_unique').on(table.sectorId, table.groupJid),
  index('idx_sector_allowed_groups_sector_id').on(table.sectorId),
]);
