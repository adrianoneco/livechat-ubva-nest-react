import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: string;

  @Column({ name: 'message_template', type: 'text' })
  messageTemplate: string;

  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl: string;

  @Column({ name: 'media_type', type: 'varchar', length: 50, nullable: true })
  mediaType: string;

  @Column({ name: 'target_audience', type: 'jsonb', nullable: true })
  targetAudience: any;

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduledAt: Date;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ name: 'total_recipients', type: 'int', default: 0, nullable: true })
  totalRecipients: number;

  @Column({ name: 'sent_count', type: 'int', default: 0, nullable: true })
  sentCount: number;

  @Column({ name: 'delivered_count', type: 'int', default: 0, nullable: true })
  deliveredCount: number;

  @Column({ name: 'read_count', type: 'int', default: 0, nullable: true })
  readCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0, nullable: true })
  failedCount: number;

  @Column({ name: 'instance_id', type: 'uuid', nullable: true })
  instanceId: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
