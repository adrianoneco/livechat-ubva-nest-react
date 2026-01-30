import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { WhatsappInstance } from './whatsapp-instance.entity';

@Entity('sectors')
export class Sector {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_id', type: 'uuid', nullable: true })
  instanceId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_default', type: 'boolean', default: false, nullable: true })
  isDefault: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true, nullable: true })
  isActive: boolean;

  @Column({ name: 'tipo_atendimento', type: 'varchar', default: 'humano', nullable: true })
  tipoAtendimento: string;

  @Column({ name: 'gera_ticket', type: 'boolean', default: false, nullable: true })
  geraTicket: boolean;

  @Column({ name: 'gera_ticket_usuarios', type: 'boolean', default: false, nullable: true })
  geraTicketUsuarios: boolean;

  @Column({ name: 'gera_ticket_grupos', type: 'boolean', default: false, nullable: true })
  geraTicketGrupos: boolean;

  @Column({ name: 'grupos_permitidos_todos', type: 'boolean', default: true, nullable: true })
  gruposPermitidosTodos: boolean;

  @Column({ name: 'mensagem_boas_vindas', type: 'text', nullable: true })
  mensagemBoasVindas: string;

  @Column({ name: 'mensagem_reabertura', type: 'text', nullable: true })
  mensagemReabertura: string;

  @Column({ name: 'mensagem_encerramento', type: 'text', nullable: true })
  mensagemEncerramento: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WhatsappInstance)
  @JoinColumn({ name: 'instance_id' })
  instance: WhatsappInstance;
}

@Entity('user_sectors')
@Unique('user_sectors_unique', ['userId', 'sectorId'])
export class UserSector {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string;

  @Column({ name: 'sector_id', type: 'uuid', nullable: true })
  sectorId: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false, nullable: true })
  isPrimary: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('sector_instances')
@Unique('sector_instances_unique', ['sectorId', 'instanceId'])
@Index('idx_sector_instances_sector_id', ['sectorId'])
@Index('idx_sector_instances_instance_id', ['instanceId'])
export class SectorInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sector_id', type: 'uuid' })
  sectorId: string;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('sector_allowed_groups')
@Unique('sector_allowed_groups_unique', ['sectorId', 'groupJid'])
@Index('idx_sector_allowed_groups_sector_id', ['sectorId'])
export class SectorAllowedGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sector_id', type: 'uuid' })
  sectorId: string;

  @Column({ name: 'group_jid', type: 'text' })
  groupJid: string;

  @Column({ name: 'group_name', type: 'text', nullable: true })
  groupName: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
