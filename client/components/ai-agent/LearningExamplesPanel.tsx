import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Trash2,
  GraduationCap,
  Star,
  MessageCircle,
  Lightbulb,
  Loader2,
  TrendingUp,
  Award,
} from "lucide-react";
import { useLearningExamples, SCENARIO_TYPES, ScenarioType } from "@/hooks/ai-agent/useLearningExamples";

interface LearningExamplesPanelProps {
  sectorId: string;
}

export const LearningExamplesPanel = ({ sectorId }: LearningExamplesPanelProps) => {
  const {
    examples,
    isLoading,
    stats,
    deleteExample,
    getExamplesByScenario,
    getHighQualityExamples,
  } = useLearningExamples(sectorId);

  const [filterScenario, setFilterScenario] = useState<string>("all");
  const [filterQuality, setFilterQuality] = useState<string>("all");

  const filteredExamples = examples.filter(example => {
    const matchesScenario = filterScenario === "all" || example.scenario_type === filterScenario;
    const matchesQuality = filterQuality === "all" || 
      (filterQuality === "high" && (example.quality_score || 0) >= 0.8) ||
      (filterQuality === "medium" && (example.quality_score || 0) >= 0.5 && (example.quality_score || 0) < 0.8) ||
      (filterQuality === "low" && (example.quality_score || 0) < 0.5);
    return matchesScenario && matchesQuality;
  });

  const getScenarioColor = (scenario: string) => {
    const colors: Record<string, string> = {
      sales: "bg-green-500/10 text-green-700 dark:text-green-400",
      support: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      objection: "bg-red-500/10 text-red-700 dark:text-red-400",
      closing: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      greeting: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      follow_up: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    };
    return colors[scenario] || "bg-muted text-muted-foreground";
  };

  const getQualityBadge = (score: number | null) => {
    if (score === null) return null;
    if (score >= 0.8) {
      return (
        <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
          <Star className="h-3 w-3 mr-1 fill-current" />
          Excelente
        </Badge>
      );
    }
    if (score >= 0.5) {
      return (
        <Badge variant="outline">
          <Star className="h-3 w-3 mr-1" />
          Bom
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Revisão necessária
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold">{stats.total}</span>
              </div>
              <p className="text-xs text-muted-foreground">Exemplos totais</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-green-500" />
                <span className="text-2xl font-bold">{examples.filter(e => (e.quality_score || 0) >= 0.8).length}</span>
              </div>
              <p className="text-xs text-muted-foreground">Alta qualidade</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-2xl font-bold">
                  {stats.avgQuality ? `${Math.round(stats.avgQuality * 100)}%` : "N/A"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Qualidade média</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                <span className="text-2xl font-bold">{Object.keys(stats.byScenario || {}).length}</span>
              </div>
              <p className="text-xs text-muted-foreground">Cenários cobertos</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterScenario} onValueChange={setFilterScenario}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Cenário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cenários</SelectItem>
            {SCENARIO_TYPES.map((scenario) => (
              <SelectItem key={scenario.value} value={scenario.value}>
                {scenario.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterQuality} onValueChange={setFilterQuality}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Qualidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="high">Alta (80%+)</SelectItem>
            <SelectItem value="medium">Média (50-80%)</SelectItem>
            <SelectItem value="low">Baixa (&lt;50%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Examples List */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-4">
          {filteredExamples.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                Nenhum exemplo encontrado
              </CardContent>
            </Card>
          ) : (
            filteredExamples.map((example) => (
              <Card key={example.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className={getScenarioColor(example.scenario_type)}>
                          {SCENARIO_TYPES.find(s => s.value === example.scenario_type)?.label || example.scenario_type}
                        </Badge>
                        {getQualityBadge(example.quality_score)}
                      </div>

                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Contexto (Mensagem do cliente)</p>
                          <div className="p-2 bg-muted/50 rounded-md text-sm">
                            {example.input_context}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Resposta ideal</p>
                          <div className="p-2 bg-primary/5 border border-primary/20 rounded-md text-sm">
                            {example.ideal_response}
                          </div>
                        </div>
                      </div>

                      {example.tags && example.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {example.tags.map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir exemplo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Este exemplo não será mais usado para treinar a IA.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteExample.mutate(example.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
