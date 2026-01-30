import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('sla_config')
export class SlaConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sector_id', nullable: true, unique: true })
  sectorId: string;

  @Column({ name: 'first_response_time_minutes', default: 15, nullable: true })
  firstResponseTimeMinutes: number;

  @Column({ name: 'resolution_time_minutes', default: 240, nullable: true })
  resolutionTimeMinutes: number;

  @Column({ name: 'priority_escalation_enabled', default: true, nullable: true })
  priorityEscalationEnabled: boolean;

  @Column({ name: 'escalation_threshold_minutes', default: 30, nullable: true })
  escalationThresholdMinutes: number;

  @Column({ name: 'working_hours_start', default: '09:00', nullable: true })
  workingHoursStart: string;

  @Column({ name: 'working_hours_end', default: '18:00', nullable: true })
  workingHoursEnd: string;

  @Column({ name: 'working_days', type: 'text', array: true, nullable: true })
  workingDays: string[];

  @Column({ name: 'is_active', default: true, nullable: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
