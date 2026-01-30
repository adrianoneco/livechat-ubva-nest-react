import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Zap, Search, MessageSquareText } from "lucide-react";
import { useWhatsAppMacros } from "@/hooks/whatsapp/useWhatsAppMacros";
import { cn } from "@/lib/utils";

interface MacrosButtonProps {
  onSelectMacro: (content: string, macroId: string) => void;
  disabled?: boolean;
}

export const MacrosButton = ({ onSelectMacro, disabled }: MacrosButtonProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { macros, isLoading, incrementUsage } = useWhatsAppMacros();

  const filteredMacros = macros.filter((macro) => {
    const searchLower = search.toLowerCase();
    return (
      macro.name.toLowerCase().includes(searchLower) ||
      macro.shortcut.toLowerCase().includes(searchLower) ||
      macro.content.toLowerCase().includes(searchLower) ||
      (macro.category?.toLowerCase().includes(searchLower))
    );
  });

  // Group macros by category
  const groupedMacros = filteredMacros.reduce((acc, macro) => {
    const category = macro.category || "Geral";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(macro);
    return acc;
  }, {} as Record<string, typeof macros>);

  const handleSelectMacro = (macro: typeof macros[0]) => {
    onSelectMacro(macro.content, macro.id);
    incrementUsage(macro.id);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        size="icon"
        variant="ghost"
        disabled={disabled}
        className="h-9 w-9 shrink-0"
        title="Respostas rápidas (Macros)"
      >
        <Zap className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Respostas Rápidas (Macros)
            </DialogTitle>
            <DialogDescription>
              Selecione uma macro para inserir na mensagem
            </DialogDescription>
          </DialogHeader>

          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, atalho ou conteúdo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-[300px]">
              <div className="pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">Carregando macros...</p>
              </div>
            ) : filteredMacros.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquareText className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">
                  {search
                    ? "Nenhuma macro encontrada para esta busca"
                    : "Nenhuma macro cadastrada"}
                </p>
                {!search && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Crie macros em Configurações → Macros
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4 pb-2">
                {Object.entries(groupedMacros).map(([category, categoryMacros]) => (
                  <div key={category}>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {categoryMacros.map((macro) => (
                        <button
                          key={macro.id}
                          onClick={() => handleSelectMacro(macro)}
                          className={cn(
                            "w-full text-left p-3 rounded-lg border transition-colors",
                            "hover:bg-accent hover:border-primary/50",
                            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">
                              {macro.name}
                            </span>
                            <Badge variant="secondary" className="text-xs font-mono">
                              /{macro.shortcut}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {macro.content}
                          </p>
                          {macro.usage_count > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Usado {macro.usage_count}x
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
              </div>
            </ScrollArea>
          </div>

          <div className="text-xs text-muted-foreground pt-2 border-t flex-shrink-0">
            💡 Dica: Digite <code className="bg-muted px-1 rounded">/macro:atalho</code> na caixa de mensagem para buscar rapidamente
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
