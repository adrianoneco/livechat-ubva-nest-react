import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Profile } from './profile.entity';

@Entity('user_roles')
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ default: 'agent' })
  role: 'admin' | 'supervisor' | 'agent';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Profile, profile => profile.roles)
  @JoinColumn({ name: 'user_id' })
  user: Profile;
}
