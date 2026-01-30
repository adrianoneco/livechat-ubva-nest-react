import { pgTable, uuid, text, boolean, timestamp, integer, time, date, real, index } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappConversations, whatsappContacts } from './whatsapp';
import { sectors } from './sectors';
import { leads } from './sales';

export const schedulingConfig = pgTable('scheduling_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }).unique(),
  
  // General Settings
  isEnabled: boolean('is_enabled').default(true),
  allowAiScheduling: boolean('allow_ai_scheduling').default(true),
  
  // Default Slot Settings
  defaultDurationMinutes: integer('default_duration_minutes').default(30),
  slotIntervalMinutes: integer('slot_interval_minutes').default(30),
  minAdvanceHours: integer('min_advance_hours').default(2),
  maxAdvanceDays: integer('max_advance_days').default(30),
  
  // Allowed Meeting Types
  allowedMeetingTypes: text('allowed_meeting_types').array(),
  defaultMeetingType: text('default_meeting_type').default('video'),
  
  // Buffer Settings
  bufferBeforeMinutes: integer('buffer_before_minutes').default(5),
  bufferAfterMinutes: integer('buffer_after_minutes').default(5),
  
  // Reminder Settings
  sendReminder24h: boolean('send_reminder_24h').default(true),
  sendReminder1h: boolean('send_reminder_1h').default(true),
  customReminderHours: integer('custom_reminder_hours'),
  reminderMessage24h: text('reminder_message_24h'),
  reminderMessage1h: text('reminder_message_1h'),
  
  // Confirmation Settings
  requireConfirmation: boolean('require_confirmation').default(true),
  autoCancelNoConfirmationHours: integer('auto_cancel_no_confirmation_hours').default(24),
  confirmationMessage: text('confirmation_message'),
  
  // Future: Calendar Integration
  googleCalendarSync: boolean('google_calendar_sync').default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const availabilitySlots = pgTable('availability_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Can be per sector OR per agent
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => profiles.id, { onDelete: 'cascade' }),
  
  // Recurrence Configuration
  dayOfWeek: integer('day_of_week'),
  specificDate: date('specific_date'),
  
  // Time Configuration
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  timezone: text('timezone').default('America/Sao_Paulo'),
  
  // Slot Type
  slotType: text('slot_type').default('available'),
  
  // Control
  isActive: boolean('is_active').default(true),
  maxConcurrentMeetings: integer('max_concurrent_meetings').default(1),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_availability_slots_sector').on(table.sectorId),
  index('idx_availability_slots_agent').on(table.agentId),
  index('idx_availability_slots_day').on(table.dayOfWeek),
  index('idx_availability_slots_date').on(table.specificDate),
]);

export const meetingSchedules = pgTable('meeting_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relationships
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'set null' }),
  contactId: uuid('contact_id').references(() => whatsappContacts.id, { onDelete: 'set null' }),
  assignedAgentId: uuid('assigned_agent_id').references(() => profiles.id, { onDelete: 'set null' }),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  
  // Meeting Details
  title: text('title').notNull(),
  description: text('description'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').default(30),
  timezone: text('timezone').default('America/Sao_Paulo'),
  
  // Meeting Type and Location
  meetingType: text('meeting_type').default('call'),
  location: text('location'),
  meetingLink: text('meeting_link'),
  
  // Status
  status: text('status').default('scheduled'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  // Reminders
  reminder24hSent: boolean('reminder_24h_sent').default(false),
  reminder1hSent: boolean('reminder_1h_sent').default(false),
  reminderCustomSent: boolean('reminder_custom_sent').default(false),
  
  // Origin
  createdBy: text('created_by').default('ai'),
  aiSessionId: uuid('ai_session_id'),
  
  // Metadata
  notes: text('notes'),
  metadata: text('metadata'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_meeting_schedules_scheduled_at').on(table.scheduledAt),
  index('idx_meeting_schedules_status').on(table.status),
  index('idx_meeting_schedules_agent').on(table.assignedAgentId),
  index('idx_meeting_schedules_sector').on(table.sectorId),
  index('idx_meeting_schedules_contact').on(table.contactId),
  index('idx_meeting_schedules_conversation').on(table.conversationId),
]);

export const schedulingIntents = pgTable('scheduling_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  aiSessionId: uuid('ai_session_id'),
  
  // Detected Intent
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow(),
  intentType: text('intent_type'),
  confidence: real('confidence'),
  
  // Extracted Information
  preferredDates: text('preferred_dates'), // JSON string
  meetingPurpose: text('meeting_purpose'),
  durationRequested: integer('duration_requested'),
  
  // Offered Slots
  offeredSlots: text('offered_slots'), // JSON string
  selectedSlotIndex: integer('selected_slot_index'),
  
  // Result
  status: text('status').default('pending'),
  resultingMeetingId: uuid('resulting_meeting_id').references(() => meetingSchedules.id, { onDelete: 'set null' }),
  
  // Expiry
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_scheduling_intents_conversation').on(table.conversationId),
  index('idx_scheduling_intents_status').on(table.status),
]);
