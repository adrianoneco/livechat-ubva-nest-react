import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('knowledge_base')
export class KnowledgeBase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sector_id', nullable: true })
  sectorId: string;

  @Column({ length: 100 })
  category: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @Column({ type: 'jsonb', nullable: true })
  keywords: any;

  @Column({ name: 'use_count', default: 0, nullable: true })
  useCount: number;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ name: 'is_active', default: true, nullable: true })
  isActive: boolean;

  @Column({ default: 0, nullable: true })
  priority: number;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
