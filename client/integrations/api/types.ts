// Types for API compatibility
export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  status?: string;
  isActive: boolean;
  role: 'admin' | 'supervisor' | 'agent';
}

export interface Session {
  user: User;
  access_token: string;
}

export interface AuthError {
  message: string;
  status?: number;
}

export interface AuthResponse {
  data: {
    user: User | null;
    session: Session | null;
  } | null;
  error: AuthError | null;
}

// Database table types
export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  remote_jid: string;
  message_id: string;
  content: string;
  message_type: string | null;
  media_url: string | null;
  media_mimetype: string | null;
  is_from_me: boolean | null;
  is_supervisor_message: boolean | null;
  status: string | null;
  quoted_message_id: string | null;
  timestamp: string;
  edited_at: string | null;
  original_content: string | null;
  audio_transcription: string | null;
  transcription_status: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

// Generic Tables type helper for database tables
export type Tables<T extends string> = T extends 'whatsapp_messages'
  ? WhatsAppMessage
  : Record<string, any>;

// Insert/Update helpers
export type TablesInsert<T extends string> = Partial<Tables<T>>;
export type TablesUpdate<T extends string> = Partial<Tables<T>>;
