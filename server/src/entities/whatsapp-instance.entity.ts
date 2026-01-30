import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { WhatsappContact } from './whatsapp-contact.entity';
import { WhatsappConversation } from './whatsapp-conversation.entity';

@Entity('whatsapp_instances')
export class WhatsappInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'instance_name', length: 255, unique: true })
  instanceName: string;

  @Column({ length: 50, default: 'disconnected', nullable: true })
  status: string;

  @Column({ name: 'qr_code', type: 'text', nullable: true })
  qrCode: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @Column({ name: 'provider_type', default: 'self_hosted' })
  providerType: string;

  @Column({ name: 'instance_id_external', nullable: true })
  instanceIdExternal: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => WhatsappContact, contact => contact.instance)
  contacts: WhatsappContact[];

  @OneToMany(() => WhatsappConversation, conv => conv.instance)
  conversations: WhatsappConversation[];
}
