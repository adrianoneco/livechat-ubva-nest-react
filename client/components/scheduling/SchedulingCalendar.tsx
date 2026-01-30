import { useState } from 'react';
import { format, addDays, startOfWeek, isSameDay, isToday, isPast, addWeeks, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Video, Phone, MapPin, MessageCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMeetingSchedules, MeetingSchedule } from '@/hooks/scheduling/useMeetingSchedules';
import { cn } from '@/lib/utils';

interface SchedulingCalendarProps {
  sectorId?: string;
  agentId?: string;
  onMeetingClick?: (meeting: MeetingSchedule) => void;
  onCreateClick?: (date: Date) => void;
}

export function SchedulingCalendar({ 
  sectorId, 
  agentId, 
  onMeetingClick, 
  onCreateClick 
}: SchedulingCalendarProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });

  const { meetings, isLoading } = useMeetingSchedules({
    sectorId,
    agentId,
    startDate: weekStart,
    endDate: addDays(weekStart, 6),
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 10 }, (_, i) => i + 8); // 8:00 - 17:00

  const getMeetingsForSlot = (day: Date, hour: number) => {
    return meetings?.filter(m => {
      const meetingDate = new Date(m.scheduled_at);
      return isSameDay(meetingDate, day) && meetingDate.getHours() === hour;
    }) || [];
  };

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
        return <Clock className="h-3 w-3" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500/20 border-green-500 text-green-700';
      case 'scheduled':
        return 'bg-blue-500/20 border-blue-500 text-blue-700';
      case 'cancelled':
        return 'bg-red-500/20 border-red-500 text-red-700 opacity-60';
      case 'completed':
        return 'bg-gray-500/20 border-gray-500 text-gray-600';
      case 'no_show':
        return 'bg-amber-500/20 border-amber-500 text-amber-700';
      default:
        return 'bg-muted border-muted-foreground/30';
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Agenda
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {format(weekStart, "dd MMM", { locale: ptBR })} - {format(addDays(weekStart, 6), "dd MMM yyyy", { locale: ptBR })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(new Date())}
            >
              Hoje
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px]">
          <div className="min-w-[800px]">
            {/* Header with days */}
            <div className="grid grid-cols-8 border-b sticky top-0 bg-background z-10">
              <div className="p-2 text-xs text-muted-foreground border-r">Hora</div>
              {days.map(day => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "p-2 text-center border-r",
                    isToday(day) && "bg-primary/5"
                  )}
                >
                  <div className="text-xs text-muted-foreground">
                    {format(day, 'EEE', { locale: ptBR })}
                  </div>
                  <div className={cn(
                    "text-lg font-semibold",
                    isToday(day) && "text-primary"
                  )}>
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>

            {/* Time grid */}
            {hours.map(hour => (
              <div key={hour} className="grid grid-cols-8 border-b min-h-[80px]">
                <div className="p-2 text-xs text-muted-foreground border-r flex items-start">
                  {`${hour.toString().padStart(2, '0')}:00`}
                </div>
                {days.map(day => {
                  const slotMeetings = getMeetingsForSlot(day, hour);
                  const isPastSlot = isPast(new Date(day.setHours(hour, 0, 0, 0)));

                  return (
                    <div
                      key={`${day.toISOString()}-${hour}`}
                      className={cn(
                        "border-r p-1 relative group",
                        isToday(day) && "bg-primary/5",
                        isPastSlot && "bg-muted/30"
                      )}
                    >
                      {slotMeetings.map(meeting => (
                        <div
                          key={meeting.id}
                          onClick={() => onMeetingClick?.(meeting)}
                          className={cn(
                            "p-1.5 rounded border text-xs mb-1 cursor-pointer hover:opacity-80 transition-opacity",
                            getStatusColor(meeting.status)
                          )}
                        >
                          <div className="flex items-center gap-1 font-medium truncate">
                            {getMeetingTypeIcon(meeting.meeting_type)}
                            <span className="truncate">{meeting.title}</span>
                          </div>
                          {meeting.contact?.name && (
                            <div className="text-[10px] truncate opacity-80">
                              {meeting.contact.name}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Add button on hover */}
                      {!isPastSlot && slotMeetings.length === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          onClick={() => {
                            const slotDate = new Date(day);
                            slotDate.setHours(hour, 0, 0, 0);
                            onCreateClick?.(slotDate);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Legend */}
        <div className="p-3 border-t flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500" />
            <span>Agendado</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500" />
            <span>Confirmado</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-gray-500/20 border border-gray-500" />
            <span>Concluído</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500" />
            <span>Cancelado</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
