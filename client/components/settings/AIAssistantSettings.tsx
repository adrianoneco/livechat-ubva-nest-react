import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Settings2, Building2, Power, PowerOff, Plus, AlertCircle } from "lucide-react";
import { useSectors, type SectorWithInstance } from "@/hooks/useSectors";
import { useAllAIAgentConfigs, useAIAgentConfig } from "@/hooks/ai-agent";
import { AIAgentConfigModal } from "./AIAgentConfigModal";
import { supabase } from "@/integrations/api/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function AIAssistantSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sectors, isLoading: sectorsLoading } = useSectors();
  const { data: allConfigs, isLoading: configsLoading } = useAllAIAgentConfigs();
  const [selectedSector, setSelectedSector] = useState<SectorWithInstance | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const isLoading = sectorsLoading || configsLoading;

  // Show all sectors - AI assistant can be configured for any sector
  const allSectors = sectors;
  const configsMap = new Map(allConfigs?.map(c => [c.sector_id, c]) || []);

  const handleOpenConfig = (sector: SectorWithInstance) => {
    setSelectedSector(sector);
    setModalOpen(true);
  };

  const handleToggleEnabled = async (sectorId: string, configId: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('ai_agent_configs')
        .update({ is_enabled: !currentEnabled })
        .eq('id', configId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['ai-agent-configs-all'] });
      queryClient.invalidateQueries({ queryKey: ['ai-agent-config', sectorId] });

      toast({
        title: !currentEnabled ? "Assistente ativado" : "Assistente desativado",
        description: `O assistente virtual foi ${!currentEnabled ? 'ativado' : 'desativado'} com sucesso.`,
      });
    } catch (error) {
      console.error('Error toggling AI agent:', error);
      toast({
        title: "Erro",
        description: "Não foi possível alterar o status do assistente.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Assistente Virtual</h2>
          <p className="text-muted-foreground">Carregando configurações...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Assistente Virtual</h2>
        <p className="text-muted-foreground">
          Configure assistentes de IA para atendimento automático em cada setor
        </p>
      </div>

      {/* Info Card */}
      {allSectors.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">Nenhum setor cadastrado</p>
                <p className="text-sm text-muted-foreground">
                  Para usar o Assistente Virtual, vá até a aba <strong>Setores</strong> e crie 
                  pelo menos um setor de atendimento.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sectors Grid */}
      {allSectors.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {allSectors.map((sector) => {
            const config = configsMap.get(sector.id);
            const hasConfig = !!config;
            const isEnabled = config?.is_enabled ?? false;

            return (
              <Card 
                key={sector.id} 
                className={`relative transition-all ${isEnabled ? 'border-green-500/50' : ''}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        {config?.agent_image ? (
                          <AvatarImage src={config.agent_image} alt={config.agent_name || 'Assistente'} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10">
                          <Bot className="h-6 w-6 text-primary" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">
                          {config?.agent_name || 'Assistente Virtual'}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          {sector.name}
                        </CardDescription>
                      </div>
                    </div>
                    {hasConfig && (
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => handleToggleEnabled(sector.id, config.id, isEnabled)}
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hasConfig ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={isEnabled ? "default" : "secondary"} className="gap-1">
                          {isEnabled ? (
                            <Power className="h-3 w-3" />
                          ) : (
                            <PowerOff className="h-3 w-3" />
                          )}
                          {isEnabled ? 'Ativo' : 'Inativo'}
                        </Badge>
                        {config.auto_reply_enabled && (
                          <Badge variant="outline">Resposta automática</Badge>
                        )}
                        <Badge variant="outline">{config.tone_of_voice === 'professional' ? 'Profissional' : config.tone_of_voice === 'friendly' ? 'Amigável' : 'Casual'}</Badge>
                      </div>
                      {config.persona_description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {config.persona_description}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-sm text-muted-foreground mb-2">
                        Assistente não configurado
                      </p>
                    </div>
                  )}
                  
                  <Button 
                    onClick={() => handleOpenConfig(sector)}
                    variant={hasConfig ? "outline" : "default"}
                    className="w-full"
                  >
                    {hasConfig ? (
                      <>
                        <Settings2 className="mr-2 h-4 w-4" />
                        Configurar Assistente
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Assistente
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <p className="font-medium flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-500" />
              Como funciona o Assistente Virtual
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>O assistente responde automaticamente mensagens recebidas no setor configurado</li>
              <li>Você pode personalizar o nome, foto de perfil e personalidade do assistente</li>
              <li>Configure palavras-chave para escalar automaticamente para atendimento humano</li>
              <li>Defina horários de funcionamento e mensagem fora do expediente</li>
              <li>Adicione contexto sobre seu negócio e FAQ para respostas mais precisas</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* AI Agent Config Modal */}
      <AIAgentConfigModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        sector={selectedSector}
      />
    </div>
  );
}
