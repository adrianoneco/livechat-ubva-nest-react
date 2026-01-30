import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('meetings')
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string;

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'scheduled_at', type: 'timestamp' })
  scheduledAt: Date;

  @Column({ type: 'int', default: 60 })
  duration: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string;

  @Column({ name: 'meeting_url', type: 'text', nullable: true })
  meetingUrl: string;

  @Column({ type: 'varchar', length: 50, default: 'scheduled' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  attendees: any;

  @Column({ name: 'reminder_sent', type: 'boolean', default: false, nullable: true })
  reminderSent: boolean;

  @Column({ name: 'reminder_sent_at', type: 'timestamp', nullable: true })
  reminderSentAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
