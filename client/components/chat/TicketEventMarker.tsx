import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Flag, X, RefreshCw, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type TicketEventType = 'ticket_opened' | 'ticket_closed' | 'conversation_reopened' | 'conversation_transferred';

interface TicketEventMarkerProps {
  eventType: TicketEventType;
  ticketNumber: number;
  timestamp: string;
  className?: string;
}

interface TransferInfo {
  fromAgent: string;
  toAgent: string;
  reason?: string;
}

export const TicketEventMarker = ({ 
  eventType, 
  ticketNumber, 
  timestamp,
  className,
  transferInfo
}: TicketEventMarkerProps & { transferInfo?: TransferInfo }) => {
  const isOpened = eventType === 'ticket_opened';
  const isClosed = eventType === 'ticket_closed';
  const isReopened = eventType === 'conversation_reopened';
  const isTransferred = eventType === 'conversation_transferred';
  const date = new Date(timestamp);
  const formattedDate = format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });

  return (
    <div className={cn("flex justify-center my-3", className)}>
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium w-full max-w-2xl",
          isOpened && "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-200",
          isClosed && "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/30 dark:border-red-700 dark:text-red-200",
          isReopened && "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-200",
          isTransferred && "bg-purple-50 border-purple-300 text-purple-800 dark:bg-purple-950/30 dark:border-purple-700 dark:text-purple-200"
        )}
      >
        {isOpened && <Flag className="h-4 w-4 flex-shrink-0" />}
        {isClosed && <X className="h-4 w-4 flex-shrink-0" />}
        {isReopened && <RefreshCw className="h-4 w-4 flex-shrink-0" />}
        {isTransferred && <ArrowRightLeft className="h-4 w-4 flex-shrink-0" />}
        
        <span className="flex-1">
          {isOpened && (
            <>
              Início do atendimento{" "}
              <span className="font-bold">[ {ticketNumber} ]</span>{" "}
              aberto em: {formattedDate}
            </>
          )}
          {isClosed && (
            <>
              Fim do atendimento{" "}
              <span className="font-bold">[ {ticketNumber} ]</span>{" "}
              fechado em: {formattedDate}
            </>
          )}
          {isReopened && (
            <>
              Conversa reaberta após ticket{" "}
              <span className="font-bold">[ {ticketNumber} ]</span>{" "}
              em: {formattedDate}
            </>
          )}
          {isTransferred && transferInfo && (
            <>
              Conversa transferida de{" "}
              <span className="font-bold">{transferInfo.fromAgent}</span>{" "}
              para <span className="font-bold">{transferInfo.toAgent}</span>
              {transferInfo.reason && (
                <> — Motivo: <span className="italic">{transferInfo.reason}</span></>
              )}
              {" "}em: {formattedDate}
            </>
          )}
          {isTransferred && !transferInfo && (
            <>
              Conversa transferida em: {formattedDate}
            </>
          )}
        </span>
      </div>
    </div>
  );
};

// Helper to check if a message is a ticket event
export const isTicketEvent = (messageType: string | null): boolean => {
  return messageType === 'ticket_opened' || messageType === 'ticket_closed' || messageType === 'conversation_reopened' || messageType === 'conversation_transferred';
};

// Helper to parse ticket number from content (format: "TICKET_EVENT:123" or "CONVERSATION_REOPENED:123")
export const parseTicketNumber = (content: string | null): number => {
  if (!content) return 0;
  const match = content.match(/(?:TICKET_EVENT|CONVERSATION_REOPENED):(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

// Helper to parse transfer info from content (format: "TRANSFER:fromAgent|toAgent|reason")
export const parseTransferInfo = (content: string | null): { fromAgent: string; toAgent: string; reason?: string } | null => {
  if (!content) return null;
  const match = content.match(/TRANSFER:([^|]+)\|([^|]+)(?:\|(.+))?/);
  if (!match) return null;
  return {
    fromAgent: match[1],
    toAgent: match[2],
    reason: match[3] || undefined,
  };
};
