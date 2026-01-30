import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Plus,
  Search,
  Trash2,
  Edit,
  MessageSquare,
  TrendingUp,
  Zap,
  Loader2,
  Copy,
} from "lucide-react";
import { useResponseTemplates, TEMPLATE_CATEGORIES, TemplateCategory } from "@/hooks/ai-agent/useResponseTemplates";
import { toast } from "sonner";

interface ResponseTemplatesEditorProps {
  sectorId: string;
}

export const ResponseTemplatesEditor = ({ sectorId }: ResponseTemplatesEditorProps) => {
  const {
    templates,
    isLoading,
    stats,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    isCreating,
    isUpdating,
  } = useResponseTemplates(sectorId);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "greeting" as TemplateCategory,
    trigger_patterns: "",
    template_content: "",
    intent_match: "",
    priority: 1,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "greeting",
      trigger_patterns: "",
      template_content: "",
      intent_match: "",
      priority: 1,
    });
    setEditingTemplate(null);
  };

  const handleAdd = async () => {
    await createTemplate.mutateAsync({
      sector_id: sectorId,
      name: formData.name,
      description: formData.description || null,
      category: formData.category,
      trigger_patterns: formData.trigger_patterns.split(",").map(p => p.trim()).filter(Boolean),
      template_content: formData.template_content,
      intent_match: formData.intent_match.split(",").map(i => i.trim()).filter(Boolean),
      variables: {},
      priority: formData.priority,
      is_active: true,
      created_by: null,
    });
    setShowAddDialog(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;
    await updateTemplate.mutateAsync({
      id: editingTemplate.id,
      name: formData.name,
      description: formData.description || null,
      category: formData.category,
      trigger_patterns: formData.trigger_patterns.split(",").map(p => p.trim()).filter(Boolean),
      template_content: formData.template_content,
      intent_match: formData.intent_match.split(",").map(i => i.trim()).filter(Boolean),
      priority: formData.priority,
    });
    setShowAddDialog(false);
    resetForm();
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category || "greeting",
      trigger_patterns: template.trigger_patterns?.join(", ") || "",
      template_content: template.template_content,
      intent_match: template.intent_match?.join(", ") || "",
      priority: template.priority || 1,
    });
    setShowAddDialog(true);
  };

  const handleCopyTemplate = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Template copiado!");
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = !searchQuery || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.template_content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || template.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      greeting: "bg-green-500/10 text-green-700 dark:text-green-400",
      objection: "bg-red-500/10 text-red-700 dark:text-red-400",
      closing: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      support: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      sales: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      follow_up: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    };
    return colors[category] || "bg-muted text-muted-foreground";
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
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold">{stats.total}</span>
              </div>
              <p className="text-xs text-muted-foreground">Templates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                <span className="text-2xl font-bold">{stats.totalUsage || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">Usos totais</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-2xl font-bold">
                  {stats.avgSuccessRate ? `${Math.round(stats.avgSuccessRate * 100)}%` : "N/A"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Taxa de sucesso</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span className="text-2xl font-bold">{Object.keys(stats.byCategory || {}).length}</span>
              </div>
              <p className="text-xs text-muted-foreground">Categorias ativas</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Add Dialog */}
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Editar Template" : "Novo Template"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Saudação inicial"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: TemplateCategory) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Quando usar este template"
                />
              </div>

              <div className="space-y-2">
                <Label>Gatilhos (separados por vírgula)</Label>
                <Input
                  value={formData.trigger_patterns}
                  onChange={(e) =>
                    setFormData({ ...formData, trigger_patterns: e.target.value })
                  }
                  placeholder="olá, oi, bom dia, boa tarde"
                />
                <p className="text-xs text-muted-foreground">
                  Palavras que ativam este template automaticamente
                </p>
              </div>

              <div className="space-y-2">
                <Label>Conteúdo do Template</Label>
                <Textarea
                  value={formData.template_content}
                  onChange={(e) =>
                    setFormData({ ...formData, template_content: e.target.value })
                  }
                  placeholder="Olá {nome}! 👋 Seja bem-vindo(a)! Como posso ajudar você hoje?"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{nome}"}, {"{empresa}"} para variáveis dinâmicas
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Intenções (separadas por vírgula)</Label>
                  <Input
                    value={formData.intent_match}
                    onChange={(e) =>
                      setFormData({ ...formData, intent_match: e.target.value })
                    }
                    placeholder="saudacao, inicio"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Input
                    type="number"
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })
                    }
                    min={1}
                    max={10}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddDialog(false);
                    resetForm();
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={editingTemplate ? handleUpdate : handleAdd}
                  disabled={isCreating || isUpdating || !formData.name || !formData.template_content}
                >
                  {isCreating || isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {editingTemplate ? "Salvar" : "Criar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Templates Grid */}
      <ScrollArea className="h-[400px]">
        <div className="grid gap-4">
          {filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                Nenhum template encontrado
              </CardContent>
            </Card>
          ) : (
            filteredTemplates.map((template) => (
              <Card key={template.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{template.name}</h4>
                        <Badge variant="secondary" className={getCategoryColor(template.category || "")}>
                          {TEMPLATE_CATEGORIES.find(c => c.value === template.category)?.label || template.category}
                        </Badge>
                        {template.priority > 5 && (
                          <Badge variant="outline" className="text-xs">
                            Alta prioridade
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {template.description}
                        </p>
                      )}
                      <div className="p-3 bg-muted rounded-md text-sm">
                        {template.template_content}
                      </div>
                      {template.trigger_patterns && template.trigger_patterns.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {template.trigger_patterns.map((pattern, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {pattern}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Usos: {template.usage_count}</span>
                        {template.success_rate !== null && (
                          <span>Sucesso: {Math.round(template.success_rate * 100)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleCopyTemplate(template.template_content)}
                        title="Copiar"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(template)}
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" title="Excluir">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteTemplate.mutate(template.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
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
