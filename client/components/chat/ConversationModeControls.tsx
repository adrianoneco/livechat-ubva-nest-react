import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, User, RefreshCw, UserPlus } from "lucide-react";
import { useAIAgentSession, ConversationMode } from "@/hooks/ai-agent";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ConversationModeControlsProps {
  conversationId: string | null;
  conversationMode?: string;
}

const modeConfig: Record<ConversationMode, { icon: typeof Bot; label: string; color: string }> = {
  ai: { icon: Bot, label: 'I.A', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  human: { icon: User, label: 'Humano', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  hybrid: { icon: RefreshCw, label: 'Híbrido', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
};

export const ConversationModeControls = ({ conversationId, conversationMode }: ConversationModeControlsProps) => {
  const { session } = useAIAgentSession(conversationId);

  if (!conversationId) return null;

  const currentMode = (conversationMode as ConversationMode) || session?.mode || 'human';
  const config = modeConfig[currentMode];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn("flex items-center gap-1", config.color)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};
