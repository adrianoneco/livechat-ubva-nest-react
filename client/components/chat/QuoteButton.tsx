import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { QuoteBuilderDialog } from "@/components/sales/quotes/QuoteBuilderDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface QuoteButtonProps {
  conversationId: string;
  leadId?: string;
  sectorId?: string;
  disabled?: boolean;
}

export const QuoteButton = ({ conversationId, leadId, sectorId, disabled }: QuoteButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            disabled={disabled}
            className="text-primary"
          >
            <FileText className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Criar cotação</p>
        </TooltipContent>
      </Tooltip>

      <QuoteBuilderDialog
        open={open}
        onOpenChange={setOpen}
        conversationId={conversationId}
        leadId={leadId}
        sectorId={sectorId}
      />
    </>
  );
};
