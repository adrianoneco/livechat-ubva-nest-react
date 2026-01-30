import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity('campaign_messages')
export class CampaignMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id' })
  campaignId: string;

  @Column({ name: 'contact_id' })
  contactId: string;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt: Date;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ name: 'whatsapp_message_id', length: 255, nullable: true })
  whatsappMessageId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne(() => Campaign)
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;
}
