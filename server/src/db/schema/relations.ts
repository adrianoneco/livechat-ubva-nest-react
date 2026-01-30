import { relations } from 'drizzle-orm';
import { profiles, userRoles, projectConfig } from './users';
import { userPasswords } from './auth';
import {
  whatsappInstances,
  whatsappInstanceSecrets,
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappMacros,
  conversationAssignments,
  assignmentRules,
} from './whatsapp';
import {
  whatsappSentimentAnalysis,
  whatsappSentimentHistory,
  whatsappConversationSummaries,
  whatsappConversationNotes,
  whatsappReactions,
  whatsappMessageEditHistory,
  whatsappTopicsHistory,
} from './sentiment';
import { leads, leadActivities, leadStatusHistory, salesTargets } from './sales';

// User relations
export const profilesRelations = relations(profiles, ({ many, one }) => ({
  roles: many(userRoles),
  password: one(userPasswords, {
    fields: [profiles.id],
    references: [userPasswords.userId],
  }),
  conversations: many(whatsappConversations),
  leads: many(leads),
  salesTargets: many(salesTargets),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(profiles, {
    fields: [userRoles.userId],
    references: [profiles.id],
  }),
}));

export const userPasswordsRelations = relations(userPasswords, ({ one }) => ({
  user: one(profiles, {
    fields: [userPasswords.userId],
    references: [profiles.id],
  }),
}));

// WhatsApp relations
export const whatsappInstancesRelations = relations(whatsappInstances, ({ one, many }) => ({
  secrets: one(whatsappInstanceSecrets, {
    fields: [whatsappInstances.id],
    references: [whatsappInstanceSecrets.instanceId],
  }),
  contacts: many(whatsappContacts),
  conversations: many(whatsappConversations),
  macros: many(whatsappMacros),
}));

export const whatsappInstanceSecretsRelations = relations(whatsappInstanceSecrets, ({ one }) => ({
  instance: one(whatsappInstances, {
    fields: [whatsappInstanceSecrets.instanceId],
    references: [whatsappInstances.id],
  }),
}));

export const whatsappContactsRelations = relations(whatsappContacts, ({ one, many }) => ({
  instance: one(whatsappInstances, {
    fields: [whatsappContacts.instanceId],
    references: [whatsappInstances.id],
  }),
  conversations: many(whatsappConversations),
  leads: many(leads),
}));

export const whatsappConversationsRelations = relations(whatsappConversations, ({ one, many }) => ({
  instance: one(whatsappInstances, {
    fields: [whatsappConversations.instanceId],
    references: [whatsappInstances.id],
  }),
  contact: one(whatsappContacts, {
    fields: [whatsappConversations.contactId],
    references: [whatsappContacts.id],
  }),
  assignedToUser: one(profiles, {
    fields: [whatsappConversations.assignedTo],
    references: [profiles.id],
  }),
  messages: many(whatsappMessages),
  assignments: many(conversationAssignments),
  leads: many(leads),
  sentiment: one(whatsappSentimentAnalysis, {
    fields: [whatsappConversations.id],
    references: [whatsappSentimentAnalysis.conversationId],
  }),
  sentimentHistory: many(whatsappSentimentHistory),
  summaries: many(whatsappConversationSummaries),
  notes: many(whatsappConversationNotes),
  reactions: many(whatsappReactions),
  topicsHistory: many(whatsappTopicsHistory),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappMessages.conversationId],
    references: [whatsappConversations.id],
  }),
}));

// Sales relations
export const leadsRelations = relations(leads, ({ one, many }) => ({
  contact: one(whatsappContacts, {
    fields: [leads.contact_id],
    references: [whatsappContacts.id],
  }),
  conversation: one(whatsappConversations, {
    fields: [leads.conversation_id],
    references: [whatsappConversations.id],
  }),
  assignedToUser: one(profiles, {
    fields: [leads.assigned_to],
    references: [profiles.id],
  }),
  activities: many(leadActivities),
  statusHistory: many(leadStatusHistory),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, {
    fields: [leadActivities.leadId],
    references: [leads.id],
  }),
  user: one(profiles, {
    fields: [leadActivities.userId],
    references: [profiles.id],
  }),
}));

export const leadStatusHistoryRelations = relations(leadStatusHistory, ({ one }) => ({
  lead: one(leads, {
    fields: [leadStatusHistory.lead_id],
    references: [leads.id],
  }),
  changedByUser: one(profiles, {
    fields: [leadStatusHistory.changed_by],
    references: [profiles.id],
  }),
}));

export const salesTargetsRelations = relations(salesTargets, ({ one }) => ({
  user: one(profiles, {
    fields: [salesTargets.userId],
    references: [profiles.id],
  }),
}));

// Sentiment relations
export const whatsappSentimentAnalysisRelations = relations(whatsappSentimentAnalysis, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappSentimentAnalysis.conversationId],
    references: [whatsappConversations.id],
  }),
  contact: one(whatsappContacts, {
    fields: [whatsappSentimentAnalysis.contactId],
    references: [whatsappContacts.id],
  }),
}));

export const whatsappSentimentHistoryRelations = relations(whatsappSentimentHistory, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappSentimentHistory.conversationId],
    references: [whatsappConversations.id],
  }),
  contact: one(whatsappContacts, {
    fields: [whatsappSentimentHistory.contactId],
    references: [whatsappContacts.id],
  }),
}));

export const whatsappConversationSummariesRelations = relations(whatsappConversationSummaries, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappConversationSummaries.conversationId],
    references: [whatsappConversations.id],
  }),
}));

export const whatsappConversationNotesRelations = relations(whatsappConversationNotes, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappConversationNotes.conversationId],
    references: [whatsappConversations.id],
  }),
}));

export const whatsappReactionsRelations = relations(whatsappReactions, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappReactions.conversationId],
    references: [whatsappConversations.id],
  }),
}));

export const whatsappMessageEditHistoryRelations = relations(whatsappMessageEditHistory, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappMessageEditHistory.conversationId],
    references: [whatsappConversations.id],
  }),
}));

export const whatsappTopicsHistoryRelations = relations(whatsappTopicsHistory, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappTopicsHistory.conversationId],
    references: [whatsappConversations.id],
  }),
  contact: one(whatsappContacts, {
    fields: [whatsappTopicsHistory.contactId],
    references: [whatsappContacts.id],
  }),
}));
