import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Profile } from './profile.entity';

@Entity('webhooks')
@Index('idx_webhooks_user_id', ['userId'])
@Index('idx_webhooks_is_active', ['isActive'])
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  secret: string;

  @Column({ type: 'text', array: true, nullable: true })
  events: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true, nullable: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  headers: string;

  @Column({ name: 'retry_count', type: 'int', default: 3, nullable: true })
  retryCount: number;

  @Column({ name: 'retry_delay', type: 'int', default: 1000, nullable: true })
  retryDelay: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Profile)
  @JoinColumn({ name: 'user_id' })
  user: Profile;
}

@Entity('webhook_logs')
@Index('idx_webhook_logs_webhook_id', ['webhookId'])
@Index('idx_webhook_logs_event', ['event'])
@Index('idx_webhook_logs_created_at', ['createdAt'])
export class WebhookLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'webhook_id', type: 'uuid', nullable: true })
  webhookId: string;

  @Column({ type: 'text' })
  event: string;

  @Column({ type: 'text', nullable: true })
  payload: string;

  @Column({ type: 'text', nullable: true })
  response: string;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number;

  @Column({ type: 'boolean', default: false, nullable: true })
  success: boolean;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'int', nullable: true })
  duration: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Webhook)
  @JoinColumn({ name: 'webhook_id' })
  webhook: Webhook;
}

@Entity('api_tokens')
@Index('idx_api_tokens_user_id', ['userId'])
@Index('idx_api_tokens_token', ['token'])
export class ApiToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
  token: string;

  @Column({ type: 'text', nullable: true })
  prefix: string;

  @Column({ type: 'text', array: true, nullable: true })
  permissions: string[];

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true, nullable: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Profile)
  @JoinColumn({ name: 'user_id' })
  user: Profile;
}

@Entity('api_usage_logs')
@Index('idx_api_usage_logs_token_id', ['tokenId'])
@Index('idx_api_usage_logs_user_id', ['userId'])
@Index('idx_api_usage_logs_endpoint', ['endpoint'])
@Index('idx_api_usage_logs_created_at', ['createdAt'])
export class ApiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_id', type: 'uuid', nullable: true })
  tokenId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'text' })
  endpoint: string;

  @Column({ type: 'text' })
  method: string;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number;

  @Column({ name: 'response_time', type: 'int', nullable: true })
  responseTime: number;

  @Column({ name: 'ip_address', type: 'text', nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string;

  @Column({ name: 'request_body', type: 'text', nullable: true })
  requestBody: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
