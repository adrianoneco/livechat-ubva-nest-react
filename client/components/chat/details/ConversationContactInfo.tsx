import { User, Phone, Hash, Copy, Check, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ContactInfo {
  id?: string;
  name?: string;
  phone_number?: string;
  remote_jid?: string;
}

interface AssignedProfile {
  id?: string;
  full_name?: string;
  avatar_url?: string;
}

interface ConversationContactInfoProps {
  conversationId: string | null;
  contact?: ContactInfo | null;
  assignedTo?: string | null;
  assignedProfile?: AssignedProfile | null;
}

// Format phone number to +00 (00) 00000-0000 format
function formatPhoneNumber(phone: string | null): string {
  if (!phone) return '-';
  
  // Remove all non-numeric characters
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 10) return phone;
  
  // Brazilian format: +55 (41) 99999-9999
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  
  // Brazilian format without country code: (41) 99999-9999
  if (digits.length === 11) {
    return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  
  // Brazilian format with country code: +55 (41) 99999-9999
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  
  // Generic international format
  if (digits.length >= 10) {
    const countryCode = digits.slice(0, 2);
    const areaCode = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length > 4) {
      return `+${countryCode} (${areaCode}) ${rest.slice(0, -4)}-${rest.slice(-4)}`;
    }
    return `+${countryCode} (${areaCode}) ${rest}`;
  }
  
  return phone;
}

// Extract WhatsApp ID suffix (@s.whatsapp.net or @lid)
function extractWhatsAppIdSuffix(remoteJid: string | null): string {
  if (!remoteJid) return '';
  const match = remoteJid.match(/@(.+)$/);
  return match ? `@${match[1]}` : '';
}

// Extract WhatsApp ID number from remote_jid
function extractWhatsAppIdNumber(remoteJid: string | null): string {
  if (!remoteJid) return '-';
  return remoteJid.replace(/@.*$/, '');
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity", className)}
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </Button>
  );
}

export function ConversationContactInfo({ conversationId, contact, assignedTo, assignedProfile }: ConversationContactInfoProps) {
  // Use contact passed from parent
  const contactInfo = contact;

  if (!contactInfo) {
    return null;
  }

  const whatsappIdNumber = extractWhatsAppIdNumber(contactInfo.remote_jid || null);
  const whatsappIdSuffix = extractWhatsAppIdSuffix(contactInfo.remote_jid || null);
  const formattedPhone = formatPhoneNumber(contactInfo.phone_number || null);
  const isInQueue = !assignedTo;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <User className="h-4 w-4" />
        Informações do Contato
      </h4>
      
      <div className="space-y-2 text-sm">
        {/* Nome */}
        <div className="flex items-start gap-2 group">
          <span className="text-muted-foreground min-w-[80px]">Nome:</span>
          <span className="font-medium flex-1 break-words">{contactInfo.name || '-'}</span>
          {contactInfo.name && <CopyButton text={contactInfo.name} />}
        </div>
        
        {/* ID WhatsApp */}
        <div className="flex items-start gap-2 group">
          <span className="text-muted-foreground min-w-[80px] flex items-center gap-1">
            <Hash className="h-3 w-3" />
            ID:
          </span>
          <span className="font-mono text-xs flex-1 break-all">
            {whatsappIdNumber}
            {whatsappIdSuffix && <span className="text-muted-foreground">{whatsappIdSuffix}</span>}
          </span>
          {whatsappIdNumber !== '-' && <CopyButton text={contactInfo.remote_jid || whatsappIdNumber} />}
        </div>
        
        {/* Telefone */}
        <div className="flex items-start gap-2 group">
          <span className="text-muted-foreground min-w-[80px] flex items-center gap-1">
            <Phone className="h-3 w-3" />
            Telefone:
          </span>
          <span className="font-medium flex-1">{formattedPhone}</span>
          {contactInfo.phone_number && <CopyButton text={contactInfo.phone_number} />}
        </div>
        
        {/* Atendente Atribuído */}
        <div className="flex items-start gap-2 group">
          <span className="text-muted-foreground min-w-[80px] flex items-center gap-1">
            <UserCheck className="h-3 w-3" />
            Atendente:
          </span>
          <span className="flex-1">
            {isInQueue ? (
              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                <Users className="h-3 w-3 mr-1" />
                Na fila
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                <UserCheck className="h-3 w-3 mr-1" />
                {assignedProfile?.full_name || 'Atribuído'}
              </Badge>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
