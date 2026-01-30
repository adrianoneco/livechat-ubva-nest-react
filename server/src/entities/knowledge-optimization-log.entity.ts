import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('knowledge_optimization_log')
export class KnowledgeOptimizationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'optimization_type', length: 100 })
  optimizationType: string;

  @Column({ name: 'items_affected', default: 0, nullable: true })
  itemsAffected: number;

  @Column({ type: 'jsonb', nullable: true })
  changes: any;

  @Column({ name: 'performed_by', length: 50, default: 'system', nullable: true })
  performedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
