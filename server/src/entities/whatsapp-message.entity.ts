import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { WhatsappConversation } from './whatsapp-conversation.entity';
import { Profile } from './profile.entity';

@Entity('whatsapp_messages')
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id' })
  conversationId: string;

  @Column({ name: 'remote_jid', length: 255 })
  remoteJid: string;

  @Column({ name: 'message_id', length: 255, unique: true })
  messageId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'message_type', length: 50, default: 'text', nullable: true })
  messageType: string;

  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl: string;

  @Column({ name: 'media_mimetype', length: 100, nullable: true })
  mediaMimetype: string;

  @Column({ name: 'media_filename', type: 'text', nullable: true })
  mediaFilename: string;

  @Column({ name: 'is_from_me', default: false, nullable: true })
  isFromMe: boolean;

  @Column({ name: 'is_internal', default: false, nullable: true })
  isInternal: boolean;

  @Column({ name: 'is_supervisor_message', default: false, nullable: true })
  isSupervisorMessage: boolean;

  @Column({ length: 50, default: 'sent', nullable: true })
  status: string;

  @Column({ name: 'quoted_message_id', length: 255, nullable: true })
  quotedMessageId: string;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date;

  @Column({ name: 'original_content', type: 'text', nullable: true })
  originalContent: string;

  @Column({ name: 'audio_transcription', type: 'text', nullable: true })
  audioTranscription: string;

  @Column({ name: 'transcription_status', length: 20, nullable: true })
  transcriptionStatus: string;

  @Column({ name: 'sent_by', nullable: true })
  sentBy: string;

  @Column({ default: false, nullable: true })
  deleted: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;

  @Column({ name: 'deleted_by', nullable: true })
  deletedBy: string;

  @Column({ name: 'read_participants', type: 'jsonb', default: [], nullable: true })
  readParticipants: any;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WhatsappConversation, conv => conv.messages)
  @JoinColumn({ name: 'conversation_id' })
  conversation: WhatsappConversation;

  @ManyToOne(() => Profile)
  @JoinColumn({ name: 'sent_by' })
  sender: Profile;
}
