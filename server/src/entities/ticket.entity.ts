import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { WhatsappConversation } from './whatsapp-conversation.entity';
import { Profile } from './profile.entity';

@Entity('tickets')
@Index('idx_tickets_conversation_id', ['conversationId'])
@Index('idx_tickets_sector_id', ['sectorId'])
@Index('idx_tickets_status', ['status'])
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'numero', generated: 'increment', type: 'int' })
  numero: number;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'sector_id', type: 'uuid', nullable: true })
  sectorId: string;

  @Column({ type: 'varchar', default: 'aberto' })
  status: string;

  @Column({ type: 'varchar', default: 'whatsapp', nullable: true })
  canal: string;

  @Column({ type: 'varchar', default: 'outro', nullable: true })
  categoria: string;

  @Column({ type: 'varchar', default: 'media', nullable: true })
  prioridade: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy: string;

  @ManyToOne(() => WhatsappConversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation: WhatsappConversation;

  @ManyToOne(() => Profile)
  @JoinColumn({ name: 'closed_by' })
  closedByUser: Profile;
}
