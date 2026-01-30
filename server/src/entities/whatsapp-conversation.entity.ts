import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { WhatsappInstance } from './whatsapp-instance.entity';
import { WhatsappContact } from './whatsapp-contact.entity';
import { WhatsappMessage } from './whatsapp-message.entity';
import { Profile } from './profile.entity';

@Entity('whatsapp_conversations')
export class WhatsappConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_id' })
  instanceId: string;

  @Column({ name: 'contact_id' })
  contactId: string;

  @Column({ name: 'sector_id', nullable: true })
  sectorId: string;

  @Column({ name: 'remote_jid', length: 255, nullable: true })
  remoteJid: string;

  @Column({ name: 'contact_phone', nullable: true })
  contactPhone: string;

  @Column({ name: 'conversation_mode', default: 'ai', nullable: true })
  conversationMode: string;

  @Column({ length: 50, default: 'active', nullable: true })
  status: string;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date;

  @Column({ name: 'last_message_preview', type: 'text', nullable: true })
  lastMessagePreview: string;

  @Column({ name: 'unread_count', default: 0, nullable: true })
  unreadCount: number;

  @Column({ name: 'assigned_to', nullable: true })
  assignedTo: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WhatsappInstance, instance => instance.conversations)
  @JoinColumn({ name: 'instance_id' })
  instance: WhatsappInstance;

  @ManyToOne(() => WhatsappContact, contact => contact.conversations)
  @JoinColumn({ name: 'contact_id' })
  contact: WhatsappContact;

  @ManyToOne(() => Profile)
  @JoinColumn({ name: 'assigned_to' })
  assignedAgent: Profile;

  @OneToMany(() => WhatsappMessage, msg => msg.conversation)
  messages: WhatsappMessage[];
}
