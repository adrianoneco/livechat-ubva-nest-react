import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, Brain, Heart, Target, Zap } from "lucide-react";

interface PersonalityTraits {
  empathy: number;
  directness: number;
  formality: number;
  enthusiasm: number;
}

interface PersonalityConfiguratorProps {
  traits: PersonalityTraits;
  forbiddenTopics: string[];
  customInstructions: string;
  objectionHandling: string;
  onChange: (updates: {
    traits?: PersonalityTraits;
    forbiddenTopics?: string[];
    customInstructions?: string;
    objectionHandling?: string;
  }) => void;
}

export const PersonalityConfigurator = ({
  traits,
  forbiddenTopics,
  customInstructions,
  objectionHandling,
  onChange,
}: PersonalityConfiguratorProps) => {
  const [newForbiddenTopic, setNewForbiddenTopic] = useState("");

  const handleTraitChange = (trait: keyof PersonalityTraits, value: number[]) => {
    onChange({
      traits: {
        ...traits,
        [trait]: value[0],
      },
    });
  };

  const handleAddForbiddenTopic = () => {
    if (newForbiddenTopic.trim() && !forbiddenTopics.includes(newForbiddenTopic.trim())) {
      onChange({
        forbiddenTopics: [...forbiddenTopics, newForbiddenTopic.trim()],
      });
      setNewForbiddenTopic("");
    }
  };

  const handleRemoveForbiddenTopic = (topic: string) => {
    onChange({
      forbiddenTopics: forbiddenTopics.filter((t) => t !== topic),
    });
  };

  const getTraitLabel = (value: number, lowLabel: string, highLabel: string) => {
    if (value <= 30) return lowLabel;
    if (value >= 70) return highLabel;
    return "Equilibrado";
  };

  return (
    <div className="space-y-6">
      {/* Personality Traits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Traços de Personalidade
          </CardTitle>
          <CardDescription>
            Ajuste os sliders para definir como o agente se comporta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Empathy */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-pink-500" />
                Empatia
              </Label>
              <Badge variant="outline">
                {getTraitLabel(traits.empathy, "Objetivo", "Muito Empático")}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-16">Objetivo</span>
              <Slider
                value={[traits.empathy]}
                onValueChange={(value) => handleTraitChange("empathy", value)}
                min={0}
                max={100}
                step={10}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-16 text-right">Empático</span>
            </div>
          </div>

          {/* Directness */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                Objetividade
              </Label>
              <Badge variant="outline">
                {getTraitLabel(traits.directness, "Detalhista", "Direto ao Ponto")}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-16">Detalhista</span>
              <Slider
                value={[traits.directness]}
                onValueChange={(value) => handleTraitChange("directness", value)}
                min={0}
                max={100}
                step={10}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-16 text-right">Direto</span>
            </div>
          </div>

          {/* Formality */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <span className="text-lg">🎩</span>
                Formalidade
              </Label>
              <Badge variant="outline">
                {getTraitLabel(traits.formality, "Casual", "Muito Formal")}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-16">Casual</span>
              <Slider
                value={[traits.formality]}
                onValueChange={(value) => handleTraitChange("formality", value)}
                min={0}
                max={100}
                step={10}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-16 text-right">Formal</span>
            </div>
          </div>

          {/* Enthusiasm */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Entusiasmo
              </Label>
              <Badge variant="outline">
                {getTraitLabel(traits.enthusiasm, "Neutro", "Muito Animado")}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-16">Neutro</span>
              <Slider
                value={[traits.enthusiasm]}
                onValueChange={(value) => handleTraitChange("enthusiasm", value)}
                min={0}
                max={100}
                step={10}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-16 text-right">Animado</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Forbidden Topics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🚫 Tópicos Proibidos</CardTitle>
          <CardDescription>
            Assuntos que o agente não deve discutir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ex: política, religião, concorrentes"
              value={newForbiddenTopic}
              onChange={(e) => setNewForbiddenTopic(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddForbiddenTopic()}
            />
            <Button onClick={handleAddForbiddenTopic} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {forbiddenTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum tópico proibido</p>
            ) : (
              forbiddenTopics.map((topic) => (
                <Badge key={topic} variant="secondary" className="gap-1">
                  {topic}
                  <button
                    onClick={() => handleRemoveForbiddenTopic(topic)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Objection Handling */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">💪 Tratamento de Objeções</CardTitle>
          <CardDescription>
            Como o agente deve lidar com objeções comuns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={objectionHandling}
            onChange={(e) => onChange({ objectionHandling: e.target.value })}
            placeholder="Quando o cliente diz que está caro: Destaque o valor e os benefícios únicos do produto.

Quando o cliente diz que precisa pensar: Ofereça enviar mais informações e agende um follow-up.

Quando o cliente menciona concorrente: Foque nos nossos diferenciais sem falar mal do concorrente."
            rows={6}
          />
        </CardContent>
      </Card>

      {/* Custom Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📝 Instruções Personalizadas</CardTitle>
          <CardDescription>
            Regras específicas adicionais para o agente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={customInstructions}
            onChange={(e) => onChange({ customInstructions: e.target.value })}
            placeholder="- Sempre mencione nossa garantia de 30 dias
- Use o nome do cliente quando possível
- Ofereça o desconto de primeira compra apenas se perguntarem sobre preço
- Encerre sempre desejando um ótimo dia"
            rows={4}
          />
        </CardContent>
      </Card>
    </div>
  );
};
