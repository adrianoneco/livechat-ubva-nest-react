import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThumbsUp, ThumbsDown, MessageSquare, Loader2 } from "lucide-react";
import { useAIFeedback, FEEDBACK_TYPES, FeedbackType } from "@/hooks/ai-agent/useAIFeedback";
import { cn } from "@/lib/utils";

interface AIFeedbackButtonProps {
  conversationId: string;
  messageId: string;
  aiResponse: string;
  className?: string;
}

export const AIFeedbackButton = ({
  conversationId,
  messageId,
  aiResponse,
  className,
}: AIFeedbackButtonProps) => {
  const { submitQuickFeedback, submitDetailedFeedback, isSubmitting } = useAIFeedback(conversationId);
  const [showDetailedDialog, setShowDetailedDialog] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [correctedResponse, setCorrectedResponse] = useState("");
  const [feedbackReason, setFeedbackReason] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleQuickFeedback = async (rating: number) => {
    setSelectedRating(rating);
    await submitQuickFeedback.mutateAsync({
      rating,
      feedbackType: rating >= 4 ? 'helpful' : 'incorrect',
    });
    setHasSubmitted(true);
  };

  const handleDetailedFeedback = async () => {
    if (!selectedType) return;
    
    await submitDetailedFeedback.mutateAsync({
      rating: selectedRating || 3,
      feedbackType: selectedType,
      correctedResponse: correctedResponse || undefined,
      correctionReason: feedbackReason || undefined,
    });
    setShowDetailedDialog(false);
    setHasSubmitted(true);
    resetForm();
  };

  const resetForm = () => {
    setSelectedType(null);
    setCorrectedResponse("");
    setFeedbackReason("");
  };

  const openDetailedFeedback = (rating: number) => {
    setSelectedRating(rating);
    setShowDetailedDialog(true);
  };

  if (hasSubmitted) {
    return (
      <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
        ✓ Feedback enviado
      </div>
    );
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity", className)}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Feedback
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-2">
          <p className="text-xs text-muted-foreground mb-2">Esta resposta foi útil?</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickFeedback(5)}
              disabled={isSubmitting}
              className="flex-1"
            >
              <ThumbsUp className="h-4 w-4 mr-1 text-green-500" />
              Sim
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDetailedFeedback(2)}
              disabled={isSubmitting}
              className="flex-1"
            >
              <ThumbsDown className="h-4 w-4 mr-1 text-red-500" />
              Não
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openDetailedFeedback(3)}
            className="w-full mt-2 text-xs"
          >
            Dar feedback detalhado
          </Button>
        </PopoverContent>
      </Popover>

      {/* Detailed Feedback Dialog */}
      <Dialog open={showDetailedDialog} onOpenChange={setShowDetailedDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Feedback Detalhado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Response Preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Resposta da IA</Label>
              <div className="p-2 bg-muted rounded-md text-sm max-h-24 overflow-y-auto">
                {aiResponse}
              </div>
            </div>

            {/* Feedback Type */}
            <div className="space-y-2">
              <Label>Tipo de problema</Label>
              <div className="grid grid-cols-2 gap-2">
                {FEEDBACK_TYPES.map((type) => (
                  <Button
                    key={type.value}
                    size="sm"
                    variant={selectedType === type.value ? "default" : "outline"}
                    onClick={() => setSelectedType(type.value as FeedbackType)}
                    className="justify-start"
                  >
                    <span className="mr-2">{type.icon}</span>
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Corrected Response */}
            <div className="space-y-2">
              <Label>Como deveria ter respondido? (opcional)</Label>
              <Textarea
                value={correctedResponse}
                onChange={(e) => setCorrectedResponse(e.target.value)}
                placeholder="Digite a resposta ideal..."
                rows={3}
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Observações adicionais (opcional)</Label>
              <Textarea
                value={feedbackReason}
                onChange={(e) => setFeedbackReason(e.target.value)}
                placeholder="Explique o que estava errado..."
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDetailedDialog(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDetailedFeedback}
                disabled={!selectedType || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Enviar Feedback
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
