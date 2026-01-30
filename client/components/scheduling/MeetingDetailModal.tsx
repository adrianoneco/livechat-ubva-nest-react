import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Calendar, Clock, Video, Phone, MapPin, MessageCircle, 
  User, Check, X, Edit, Trash2, ExternalLink, RefreshCw
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MeetingSchedule, useMeetingSchedules } from '@/hooks/scheduling/useMeetingSchedules';
import { cn } from '@/lib/utils';

interface MeetingDetailModalProps {
  meeting: MeetingSchedule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToConversation?: (conversationId: string) => void;
}

export function MeetingDetailModal({ 
  meeting, 
  open, 
  onOpenChange,
  onNavigateToConversation
}: MeetingDetailModalProps) {
  const [cancellationReason, setCancellationReason] = useState('');
  const [showCancelInput, setShowCancelInput] = useState(false);
  
  const { cancelMeeting, confirmMeeting, completeMeeting } = useMeetingSchedules();

  if (!meeting) return null;

  const meetingDate = new Date(meeting.scheduled_at);
  const isPast = meetingDate < new Date();

  const getMeetingTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'call':
        return <Phone className="h-4 w-4" />;
      case 'in_person':
        return <MapPin className="h-4 w-4" />;
      case 'whatsapp':
        return <MessageCircle className="h-4 w-4" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  const getMeetingTypeLabel = (type: string) => {
    switch (type) {
      case 'video':
        return 'Videochamada';
      case 'call':
        return 'Ligação';
      case 'in_person':
        return 'Presencial';
      case 'whatsapp':
        return 'WhatsApp';
      default:
        return 'Reunião';
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      scheduled: { label: 'Agendado', variant: 'secondary' },
      confirmed: { label: 'Confirmado', variant: 'default' },
      cancelled: { label: 'Cancelado', variant: 'destructive' },
      completed: { label: 'Concluído', variant: 'outline' },
      no_show: { label: 'Não compareceu', variant: 'destructive' },
      rescheduled: { label: 'Remarcado', variant: 'secondary' },
    };

    const config = configs[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleConfirm = () => {
    confirmMeeting.mutate(meeting.id, {
      onSuccess: () => onOpenChange(false)
    });
  };

  const handleComplete = () => {
    completeMeeting.mutate(meeting.id, {
      onSuccess: () => onOpenChange(false)
    });
  };

  const handleCancel = () => {
    if (showCancelInput) {
      cancelMeeting.mutate(
        { id: meeting.id, reason: cancellationReason },
        { onSuccess: () => {
          setShowCancelInput(false);
          setCancellationReason('');
          onOpenChange(false);
        }}
      );
    } else {
      setShowCancelInput(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2">
                {getMeetingTypeIcon(meeting.meeting_type)}
                {meeting.title}
              </DialogTitle>
              <DialogDescription>
                {getMeetingTypeLabel(meeting.meeting_type)} • {meeting.duration_minutes} min
              </DialogDescription>
            </div>
            {getStatusBadge(meeting.status)}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date and Time */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">
                {format(meetingDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(meetingDate, 'HH:mm')} - {format(new Date(meetingDate.getTime() + meeting.duration_minutes * 60000), 'HH:mm')}
              </div>
            </div>
          </div>

          {/* Contact Info */}
          {meeting.contact && (
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">{meeting.contact.name || 'Contato'}</div>
                <div className="text-sm text-muted-foreground">{meeting.contact.phone_number}</div>
              </div>
              {meeting.conversation_id && onNavigateToConversation && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    onOpenChange(false);
                    onNavigateToConversation(meeting.conversation_id!);
                  }}
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  Conversa
                </Button>
              )}
            </div>
          )}

          {/* Meeting Link */}
          {meeting.meeting_link && (
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Link da reunião</div>
                <a 
                  href={meeting.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate block"
                >
                  {meeting.meeting_link}
                </a>
              </div>
            </div>
          )}

          {/* Location */}
          {meeting.location && (
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Local</div>
                <div className="text-sm text-muted-foreground">{meeting.location}</div>
              </div>
            </div>
          )}

          {/* Description */}
          {meeting.description && (
            <>
              <Separator />
              <div>
                <Label className="text-sm font-medium">Descrição</Label>
                <p className="text-sm text-muted-foreground mt-1">{meeting.description}</p>
              </div>
            </>
          )}

          {/* Notes */}
          {meeting.notes && (
            <div>
              <Label className="text-sm font-medium">Notas</Label>
              <p className="text-sm text-muted-foreground mt-1">{meeting.notes}</p>
            </div>
          )}

          {/* Cancellation input */}
          {showCancelInput && (
            <div className="space-y-2">
              <Label>Motivo do cancelamento</Label>
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Informe o motivo do cancelamento..."
              />
            </div>
          )}

          {/* Cancellation reason if cancelled */}
          {meeting.status === 'cancelled' && meeting.cancellation_reason && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="text-sm font-medium text-destructive">Motivo do cancelamento</div>
              <p className="text-sm mt-1">{meeting.cancellation_reason}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Actions based on status */}
          {meeting.status === 'scheduled' && !isPast && (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                {showCancelInput ? 'Confirmar Cancelamento' : 'Cancelar'}
              </Button>
              <Button onClick={handleConfirm}>
                <Check className="h-4 w-4 mr-1" />
                Confirmar Presença
              </Button>
            </>
          )}

          {meeting.status === 'confirmed' && !isPast && (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button variant="secondary">
                <RefreshCw className="h-4 w-4 mr-1" />
                Remarcar
              </Button>
            </>
          )}

          {(meeting.status === 'scheduled' || meeting.status === 'confirmed') && isPast && (
            <>
              <Button variant="outline" onClick={() => {
                cancelMeeting.mutate({ id: meeting.id, reason: 'Não compareceu' });
                onOpenChange(false);
              }}>
                Marcar como Não Compareceu
              </Button>
              <Button onClick={handleComplete}>
                <Check className="h-4 w-4 mr-1" />
                Marcar como Concluído
              </Button>
            </>
          )}

          {(meeting.status === 'cancelled' || meeting.status === 'completed' || meeting.status === 'no_show') && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
