import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { useKnowledgeBase } from "@/hooks/ai-agent/useKnowledgeBase";
import { useResponseTemplates } from "@/hooks/ai-agent/useResponseTemplates";
import { useLearningExamples } from "@/hooks/ai-agent/useLearningExamples";

interface KnowledgeInsightsProps {
  sectorId: string;
}

export const KnowledgeInsights = ({ sectorId }: KnowledgeInsightsProps) => {
  const { items: knowledge, stats: knowledgeStats, isLoading: knowledgeLoading } = useKnowledgeBase(sectorId);
  const { templates, stats: templateStats, isLoading: templatesLoading } = useResponseTemplates(sectorId);
  const { examples, stats: examplesStats, isLoading: examplesLoading } = useLearningExamples(sectorId);

  const isLoading = knowledgeLoading || templatesLoading || examplesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Calculate insights
  const unverifiedKnowledge = knowledge.filter(k => !k.is_verified).length;
  const unusedKnowledge = knowledge.filter(k => k.usage_count === 0).length;
  const lowSuccessTemplates = templates.filter(t => t.success_rate !== null && t.success_rate < 0.5);
  const topUsedKnowledge = [...knowledge].sort((a, b) => b.usage_count - a.usage_count).slice(0, 5);
  const topUsedTemplates = [...templates].sort((a, b) => b.usage_count - a.usage_count).slice(0, 5);

  // Coverage score (0-100)
  const coverageScore = Math.min(100, Math.round(
    ((knowledge.length / 20) * 30) + // Up to 30 points for knowledge items
    ((templates.length / 10) * 30) + // Up to 30 points for templates
    ((examples.length / 10) * 20) + // Up to 20 points for examples
    ((knowledgeStats?.verified || 0) / Math.max(knowledge.length, 1) * 20) // Up to 20 points for verification
  ));

  return (
    <div className="space-y-6">
      {/* Overall Health Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Saúde do DNA do Negócio
          </CardTitle>
          <CardDescription>
            Avaliação geral da base de conhecimento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold">
              {coverageScore}%
            </div>
            <div className="flex-1">
              <Progress value={coverageScore} className="h-3" />
            </div>
            <Badge variant={coverageScore >= 80 ? "default" : coverageScore >= 50 ? "secondary" : "destructive"}>
              {coverageScore >= 80 ? "Excelente" : coverageScore >= 50 ? "Bom" : "Precisa Melhorar"}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-2xl font-bold">{knowledge.length}</p>
              <p className="text-xs text-muted-foreground">Conhecimentos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{templates.length}</p>
              <p className="text-xs text-muted-foreground">Templates</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{examples.length}</p>
              <p className="text-xs text-muted-foreground">Exemplos</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {(unverifiedKnowledge > 0 || unusedKnowledge > 0 || lowSuccessTemplates.length > 0) && (
        <Card className="border-orange-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-5 w-5" />
              Atenção Necessária
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {unverifiedKnowledge > 0 && (
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-yellow-500/10">
                  {unverifiedKnowledge}
                </Badge>
                <span className="text-sm">
                  Conhecimentos aguardando verificação
                </span>
              </div>
            )}
            {unusedKnowledge > 0 && (
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-gray-500/10">
                  {unusedKnowledge}
                </Badge>
                <span className="text-sm">
                  Conhecimentos nunca utilizados
                </span>
              </div>
            )}
            {lowSuccessTemplates.length > 0 && (
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-red-500/10">
                  {lowSuccessTemplates.length}
                </Badge>
                <span className="text-sm">
                  Templates com baixa taxa de sucesso (&lt;50%)
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Used Knowledge */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Conhecimento Mais Usado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topUsedKnowledge.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum conhecimento utilizado ainda</p>
          ) : (
            <div className="space-y-3">
              {topUsedKnowledge.map((item, index) => (
                <div key={item.id} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground w-6">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  </div>
                  <Badge variant="secondary">
                    {item.usage_count} usos
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Used Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            Templates Mais Usados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topUsedTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum template utilizado ainda</p>
          ) : (
            <div className="space-y-3">
              {topUsedTemplates.map((template, index) => (
                <div key={template.id} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground w-6">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {template.category} • {template.success_rate !== null ? `${Math.round(template.success_rate * 100)}% sucesso` : "Sem dados"}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {template.usage_count} usos
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            Sugestões de Melhoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <div className="space-y-3">
              {knowledge.length < 10 && (
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <span className="text-lg">📚</span>
                  <div>
                    <p className="font-medium text-sm">Adicione mais conhecimento</p>
                    <p className="text-xs text-muted-foreground">
                      Você tem apenas {knowledge.length} itens. Recomendamos pelo menos 10 para boas respostas.
                    </p>
                  </div>
                </div>
              )}
              
              {templates.length < 5 && (
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <span className="text-lg">💬</span>
                  <div>
                    <p className="font-medium text-sm">Crie mais templates</p>
                    <p className="text-xs text-muted-foreground">
                      Templates de resposta aceleram o atendimento e garantem consistência.
                    </p>
                  </div>
                </div>
              )}

              {examples.length < 5 && (
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <span className="text-lg">🎓</span>
                  <div>
                    <p className="font-medium text-sm">Marque conversas como bons exemplos</p>
                    <p className="text-xs text-muted-foreground">
                      Exemplos de sucesso ajudam a IA a aprender o padrão ideal de resposta.
                    </p>
                  </div>
                </div>
              )}

              {unverifiedKnowledge > knowledge.length / 2 && (
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <span className="text-lg">✅</span>
                  <div>
                    <p className="font-medium text-sm">Verifique o conhecimento pendente</p>
                    <p className="text-xs text-muted-foreground">
                      Conhecimento verificado tem maior prioridade nas respostas da IA.
                    </p>
                  </div>
                </div>
              )}

              {coverageScore >= 80 && (
                <div className="flex items-start gap-3 p-3 bg-green-500/10 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-green-700 dark:text-green-400">
                      Excelente trabalho!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sua base de conhecimento está bem estruturada.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
