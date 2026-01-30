import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Profile } from './profile.entity';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contact_id', nullable: true })
  contactId: string;

  @Column({ name: 'conversation_id', nullable: true })
  conversationId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  phone: string;

  @Column({ type: 'text', nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  company: string;

  @Column({ default: 'new' })
  status: string;

  @Column({ default: 'whatsapp' })
  source: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, nullable: true })
  value: number;

  @Column({ default: 0, nullable: true })
  probability: number;

  @Column({ name: 'expected_close_date', type: 'date', nullable: true })
  expectedCloseDate: Date;

  @Column({ name: 'assigned_to', nullable: true })
  assignedTo: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', array: true, default: [], nullable: true })
  tags: string[];

  @Column({ type: 'jsonb', default: {}, nullable: true })
  metadata: any;

  @Column({ name: 'pipeline_insight', type: 'jsonb', default: {}, nullable: true })
  pipelineInsight: any;

  @Column({ name: 'qualification_score', nullable: true })
  qualificationScore: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date;

  @ManyToOne(() => Profile)
  @JoinColumn({ name: 'assigned_to' })
  assignedAgent: Profile;

  @OneToMany(() => LeadActivity, activity => activity.lead)
  activities: LeadActivity[];
}

@Entity('lead_activities')
export class LeadActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id' })
  leadId: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ name: 'activity_type', type: 'text', nullable: true })
  activityType: string;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  outcome: string;

  @Column({ name: 'performed_by', nullable: true })
  performedBy: string;

  @Column({ name: 'scheduled_for', type: 'timestamp', nullable: true })
  scheduledFor: Date;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string;

  @Column({ type: 'jsonb', default: {}, nullable: true })
  metadata: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Lead, lead => lead.activities)
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;
}

@Entity('lead_status_history')
export class LeadStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id' })
  leadId: string;

  @Column({ name: 'old_status', type: 'text', nullable: true })
  oldStatus: string;

  @Column({ name: 'new_status', type: 'text' })
  newStatus: string;

  @Column({ name: 'changed_by', nullable: true })
  changedBy: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
