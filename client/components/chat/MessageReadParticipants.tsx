import { Users } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ReadParticipant {
  jid: string;
  name?: string;
  timestamp?: string;
}

interface MessageReadParticipantsProps {
  participants: ReadParticipant[];
  isFromMe: boolean;
}

export function MessageReadParticipants({ participants, isFromMe }: MessageReadParticipantsProps) {
  if (!participants || participants.length === 0) return null;

  const formatParticipantName = (p: ReadParticipant): string => {
    if (p.name) return p.name;
    // Extract phone number from jid (e.g., 5511999999999@s.whatsapp.net -> 5511999999999)
    const phone = p.jid?.replace(/@.*/, '') || 'Desconhecido';
    // Format as phone number if it looks like one
    if (/^\d{10,15}$/.test(phone)) {
      return phone.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '+$1 ($2) $3-$4');
    }
    return phone;
  };

  const participantNames = participants.map(formatParticipantName);
  const displayText = participants.length === 1 
    ? participantNames[0] 
    : `${participants.length} viram`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1 cursor-pointer",
            isFromMe ? "text-white/60 hover:text-white/80" : "text-muted-foreground hover:text-foreground"
          )}>
            <Users className="h-3 w-3" />
            <span className="text-[10px]">{participants.length}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px]">
          <div className="space-y-1">
            <p className="font-medium text-xs mb-1">Lido por:</p>
            <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
              {participants.map((p, i) => (
                <div key={p.jid || i} className="text-xs flex justify-between gap-2">
                  <span className="truncate">{formatParticipantName(p)}</span>
                  {p.timestamp && (
                    <span className="text-muted-foreground flex-shrink-0">
                      {new Date(p.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
