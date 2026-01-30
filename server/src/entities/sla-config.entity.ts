import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('sla_config')
export class SlaConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sector_id', type: 'uuid', nullable: true, unique: true })
  sectorId: string;

  @Column({ name: 'first_response_time_minutes', type: 'int', default: 15, nullable: true })
  firstResponseTimeMinutes: number;

  @Column({ name: 'resolution_time_minutes', type: 'int', default: 240, nullable: true })
  resolutionTimeMinutes: number;

  @Column({ name: 'priority_escalation_enabled', type: 'boolean', default: true, nullable: true })
  priorityEscalationEnabled: boolean;

  @Column({ name: 'escalation_threshold_minutes', type: 'int', default: 30, nullable: true })
  escalationThresholdMinutes: number;

  @Column({ name: 'working_hours_start', type: 'varchar', default: '09:00', nullable: true })
  workingHoursStart: string;

  @Column({ name: 'working_hours_end', type: 'varchar', default: '18:00', nullable: true })
  workingHoursEnd: string;

  @Column({ name: 'working_days', type: 'text', array: true, nullable: true })
  workingDays: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true, nullable: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
