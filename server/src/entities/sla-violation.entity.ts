import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { WhatsappConversation } from './whatsapp-conversation.entity';
import { Ticket } from './ticket.entity';
import { SlaConfig } from './sla-config.entity';
import { Profile } from './profile.entity';

@Entity('sla_violations')
@Index('idx_sla_violations_conversation', ['conversationId'])
@Index('idx_sla_violations_ticket', ['ticketId'])
@Index('idx_sla_violations_type', ['violationType'])
export class SlaViolation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId: string;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string;

  @Column({ name: 'sla_config_id', type: 'uuid', nullable: true })
  slaConfigId: string;

  @Column({ name: 'violation_type', type: 'varchar' })
  violationType: string;

  @Column({ name: 'expected_time_minutes', type: 'int', nullable: true })
  expectedTimeMinutes: number;

  @Column({ name: 'actual_time_minutes', type: 'int', nullable: true })
  actualTimeMinutes: number;

  @Column({ type: 'boolean', default: false, nullable: true })
  acknowledged: boolean;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedBy: string;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WhatsappConversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation: WhatsappConversation;

  @ManyToOne(() => Ticket)
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @ManyToOne(() => SlaConfig)
  @JoinColumn({ name: 'sla_config_id' })
  slaConfig: SlaConfig;

  @ManyToOne(() => Profile)
  @JoinColumn({ name: 'acknowledged_by' })
  acknowledgedByUser: Profile;
}
