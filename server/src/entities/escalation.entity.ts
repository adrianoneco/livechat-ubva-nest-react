import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('escalations')
export class Escalation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ type: 'varchar', length: 100 })
  reason: string;

  @Column({ name: 'escalation_keyword', type: 'varchar', length: 255, nullable: true })
  escalationKeyword: string;

  @Column({ name: 'original_agent_id', type: 'uuid', nullable: true })
  originalAgentId: string;

  @Column({ name: 'escalated_to', type: 'uuid', nullable: true })
  escalatedTo: string;

  @Column({ name: 'escalation_type', type: 'varchar', length: 50, default: 'user' })
  escalationType: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'varchar', length: 50, default: 'medium', nullable: true })
  priority: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
