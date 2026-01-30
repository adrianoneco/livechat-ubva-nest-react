import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { WhatsappConversation } from './whatsapp-conversation.entity';

@Entity('whatsapp_conversation_notes')
export class WhatsappConversationNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string;

  @Column({ name: 'current_sentiment', type: 'varchar', nullable: true })
  currentSentiment: string;

  @Column({ name: 'conversation_mode', type: 'varchar', default: 'ai', nullable: true })
  conversationMode: string;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('whatsapp_sentiment_analysis')
export class WhatsappSentimentAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId: string;

  @Column({ type: 'varchar', nullable: true })
  sentiment: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score: number;

  @Column({ type: 'jsonb', nullable: true })
  analysis: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('whatsapp_sentiment_history')
export class WhatsappSentimentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ type: 'varchar', nullable: true })
  sentiment: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('whatsapp_conversation_summaries')
export class WhatsappConversationSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  topics: any;

  @Column({ type: 'jsonb', nullable: true })
  keywords: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('whatsapp_reactions')
export class WhatsappReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @Column({ type: 'varchar', nullable: true })
  emoji: string;

  @Column({ name: 'from_jid', type: 'varchar', nullable: true })
  fromJid: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
