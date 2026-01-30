import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Video, Phone, MapPin, MessageCircle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMeetingSchedules, MeetingSchedule } from '@/hooks/scheduling/useMeetingSchedules';
import { cn } from '@/lib/utils';

interface UpcomingMeetingsCardProps {
  sectorId?: string;
  agentId?: string;
  limit?: number;
  onMeetingClick?: (meeting: MeetingSchedule) => void;
  onViewAll?: () => void;
}

export function UpcomingMeetingsCard({
  sectorId,
  agentId,
  limit = 5,
  onMeetingClick,
  onViewAll,
}: UpcomingMeetingsCardProps) {
  const { meetings, isLoading, upcomingCount } = useMeetingSchedules({
    sectorId,
    agentId,
    status: ['scheduled', 'confirmed'],
    startDate: new Date(),
  });

  const upcomingMeetings = meetings?.slice(0, limit) || [];

  const getMeetingTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-3.5 w-3.5" />;
      case 'call':
        return <Phone className="h-3.5 w-3.5" />;
      case 'in_person':
        return <MapPin className="h-3.5 w-3.5" />;
      case 'whatsapp':
        return <MessageCircle className="h-3.5 w-3.5" />;
      default:
        return <Calendar className="h-3.5 w-3.5" />;
    }
  };

  const getTimeUntil = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `em ${days} dia${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `em ${hours}h`;
    } else {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes > 0 ? `em ${minutes}min` : 'agora';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Próximas Reuniões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Próximas Reuniões
            {upcomingCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {upcomingCount}
              </Badge>
            )}
          </CardTitle>
          {onViewAll && upcomingCount > limit && (
            <Button variant="ghost" size="sm" onClick={onViewAll}>
              Ver todas
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {upcomingMeetings.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma reunião agendada</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-2">
              {upcomingMeetings.map(meeting => {
                const meetingDate = new Date(meeting.scheduled_at);
                const isToday = new Date().toDateString() === meetingDate.toDateString();

                return (
                  <div
                    key={meeting.id}
                    onClick={() => onMeetingClick?.(meeting)}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors",
                      meeting.status === 'confirmed' && "border-green-500/50 bg-green-500/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getMeetingTypeIcon(meeting.meeting_type)}
                          <span className="font-medium text-sm truncate">
                            {meeting.title}
                          </span>
                        </div>
                        {meeting.contact?.name && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {meeting.contact.name}
                          </div>
                        )}
                      </div>
                      <Badge 
                        variant={meeting.status === 'confirmed' ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5"
                      >
                        {meeting.status === 'confirmed' ? 'Confirmado' : 'Agendado'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {isToday ? 'Hoje' : format(meetingDate, 'EEE, dd/MM', { locale: ptBR })}
                          {' às '}
                          {format(meetingDate, 'HH:mm')}
                        </span>
                      </div>
                      <span className={cn(
                        "font-medium",
                        isToday ? "text-primary" : "text-muted-foreground"
                      )}>
                        {getTimeUntil(meetingDate)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
