import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('team_invites')
export class TeamInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 50, default: 'agent' })
  role: string;

  @Column({ name: 'sector_id', nullable: true })
  sectorId: string;

  @Column({ name: 'invite_token', length: 255, unique: true })
  inviteToken: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamp', nullable: true })
  acceptedAt: Date;

  @Column({ name: 'invited_by' })
  invitedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
