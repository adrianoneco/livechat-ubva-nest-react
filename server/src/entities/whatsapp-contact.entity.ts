import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { WhatsappInstance } from './whatsapp-instance.entity';
import { WhatsappConversation } from './whatsapp-conversation.entity';

@Entity('whatsapp_contacts')
export class WhatsappContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_id' })
  instanceId: string;

  @Column({ name: 'phone_number', length: 50 })
  phoneNumber: string;

  @Column({ name: 'remote_jid', length: 255, nullable: true })
  remoteJid: string;

  @Column({ name: 'remote_lid', nullable: true })
  remoteLid: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'profile_picture_url', type: 'text', nullable: true })
  profilePictureUrl: string;

  @Column({ name: 'is_group', default: false, nullable: true })
  isGroup: boolean;

  @Column({ name: 'on_whatsapp', default: true, nullable: true })
  onWhatsapp: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @Column({ name: 'is_active', default: true, nullable: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WhatsappInstance, instance => instance.contacts)
  @JoinColumn({ name: 'instance_id' })
  instance: WhatsappInstance;

  @OneToMany(() => WhatsappConversation, conv => conv.contact)
  conversations: WhatsappConversation[];
}
