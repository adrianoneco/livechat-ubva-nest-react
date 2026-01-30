import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('escalations')
export class Escalation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id' })
  conversationId: string;

  @Column({ length: 100 })
  reason: string;

  @Column({ name: 'escalation_keyword', length: 255, nullable: true })
  escalationKeyword: string;

  @Column({ name: 'original_agent_id', nullable: true })
  originalAgentId: string;

  @Column({ name: 'escalated_to', nullable: true })
  escalatedTo: string;

  @Column({ name: 'escalation_type', length: 50, default: 'user' })
  escalationType: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ length: 50, default: 'medium', nullable: true })
  priority: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @Column({ name: 'resolved_by', nullable: true })
  resolvedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
