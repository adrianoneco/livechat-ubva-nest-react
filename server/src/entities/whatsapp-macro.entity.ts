import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { WhatsappInstance } from './whatsapp-instance.entity';

@Entity('whatsapp_macros')
export class WhatsappMacro {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_id', type: 'uuid', nullable: true })
  instanceId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  shortcut: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', default: 'geral', nullable: true })
  category: string;

  @Column({ name: 'is_active', type: 'boolean', default: true, nullable: true })
  isActive: boolean;

  @Column({ name: 'usage_count', type: 'int', default: 0, nullable: true })
  usageCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WhatsappInstance)
  @JoinColumn({ name: 'instance_id' })
  instance: WhatsappInstance;
}
