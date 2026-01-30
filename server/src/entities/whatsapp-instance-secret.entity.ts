import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { WhatsappInstance } from './whatsapp-instance.entity';

@Entity('whatsapp_instance_secrets')
export class WhatsappInstanceSecret {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string;

  @Column({ name: 'api_key', type: 'text' })
  apiKey: string;

  @Column({ name: 'api_url', type: 'text' })
  apiUrl: string;

  @Column({ name: 'webhook_endpoint', type: 'text', nullable: true })
  webhookEndpoint: string;

  @Column({ name: 'webhook_base64', type: 'boolean', nullable: true })
  webhookBase64: boolean;

  @Column({ name: 'provider_type', type: 'varchar', default: 'self_hosted', nullable: true })
  providerType: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => WhatsappInstance)
  @JoinColumn({ name: 'instance_id' })
  instance: WhatsappInstance;
}
