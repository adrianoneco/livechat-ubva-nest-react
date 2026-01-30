import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Video, Phone, MapPin, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useConversationMeetings, MeetingSchedule } from '@/hooks/scheduling/useMeetingSchedules';
import { cn } from '@/lib/utils';

interface MeetingBadgeProps {
  conversationId?: string;
  onClick?: (meeting: MeetingSchedule) => void;
}

export function MeetingBadge({ conversationId, onClick }: MeetingBadgeProps) {
  const { data: meetings, isLoading } = useConversationMeetings(conversationId);

  if (isLoading || !meetings || meetings.length === 0) {
    return null;
  }

  const nextMeeting = meetings[0];
  const meetingDate = new Date(nextMeeting.scheduled_at);
  const isToday = new Date().toDateString() === meetingDate.toDateString();
  const isSoon = meetingDate.getTime() - new Date().getTime() < 2 * 60 * 60 * 1000; // within 2 hours

  const getMeetingTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-3 w-3" />;
      case 'call':
        return <Phone className="h-3 w-3" />;
      case 'in_person':
        return <MapPin className="h-3 w-3" />;
      case 'whatsapp':
        return <MessageCircle className="h-3 w-3" />;
      default:
        return <Calendar className="h-3 w-3" />;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onClick?.(nextMeeting)}
            className={cn(
              "h-7 px-2 gap-1.5 text-xs",
              isSoon && "bg-primary/10 text-primary hover:bg-primary/20",
              nextMeeting.status === 'confirmed' && "bg-green-500/10 text-green-700 hover:bg-green-500/20"
            )}
          >
            {getMeetingTypeIcon(nextMeeting.meeting_type)}
            <span>
              {isToday 
                ? format(meetingDate, 'HH:mm')
                : format(meetingDate, 'dd/MM HH:mm')
              }
            </span>
            {isSoon && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <div className="space-y-1">
            <div className="font-medium">{nextMeeting.title}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(meetingDate, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
            </div>
            <Badge 
              variant={nextMeeting.status === 'confirmed' ? 'default' : 'secondary'}
              className="text-[10px] mt-1"
            >
              {nextMeeting.status === 'confirmed' ? 'Confirmado' : 'Agendado'}
            </Badge>
            {meetings.length > 1 && (
              <div className="text-[10px] text-muted-foreground pt-1">
                +{meetings.length - 1} outra{meetings.length > 2 ? 's' : ''} reunião
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
