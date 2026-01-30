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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  CheckCircle,
  Clock,
  Trash2,
  Edit,
  FileUp,
  Brain,
  BookOpen,
  Tag,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { useKnowledgeBase, KNOWLEDGE_CATEGORIES, KnowledgeCategory } from "@/hooks/ai-agent/useKnowledgeBase";

interface KnowledgeBaseManagerProps {
  sectorId: string;
}

export const KnowledgeBaseManager = ({ sectorId }: KnowledgeBaseManagerProps) => {
  const {
    items,
    isLoading,
    stats,
    addKnowledge,
    updateKnowledge,
    deleteKnowledge,
    verifyKnowledge,
    importKnowledge,
    isAdding,
    isUpdating,
    isDeleting,
  } = useKnowledgeBase(sectorId);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [importText, setImportText] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    category: "faq" as KnowledgeCategory,
    subcategory: "",
    title: "",
    content: "",
    keywords: "",
    source: "manual",
    confidence_score: 0.8,
    is_active: true,
    is_verified: false,
  });

  const resetForm = () => {
    setFormData({
      category: "faq",
      subcategory: "",
      title: "",
      content: "",
      keywords: "",
      source: "manual",
      confidence_score: 0.8,
      is_active: true,
      is_verified: false,
    });
    setEditingItem(null);
  };

  const handleAdd = async () => {
    await addKnowledge.mutateAsync({
      sector_id: sectorId,
      category: formData.category,
      subcategory: formData.subcategory || null,
      title: formData.title,
      content: formData.content,
      keywords: formData.keywords.split(",").map(k => k.trim()).filter(Boolean),
      source: formData.source,
      confidence_score: formData.confidence_score,
      is_active: true,
      is_verified: false,
      created_by: null,
      verified_by: null,
    });
    setShowAddDialog(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingItem) return;
    await updateKnowledge.mutateAsync({
      id: editingItem.id,
      category: formData.category,
      subcategory: formData.subcategory || null,
      title: formData.title,
      content: formData.content,
      keywords: formData.keywords.split(",").map(k => k.trim()).filter(Boolean),
    });
    setShowAddDialog(false);
    resetForm();
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      category: item.category,
      subcategory: item.subcategory || "",
      title: item.title,
      content: item.content,
      keywords: item.keywords?.join(", ") || "",
      source: item.source,
      confidence_score: item.confidence_score,
      is_active: item.is_active,
      is_verified: item.is_verified,
    });
    setShowAddDialog(true);
  };

  const handleImport = async () => {
    try {
      const lines = importText.split("\n").filter(l => l.trim());
      const importItems = lines.map(line => {
        const [category, title, content] = line.split("|").map(s => s.trim());
        return { category: category || "faq", title: title || "", content: content || title || "" };
      }).filter(item => item.title);
      
      if (importItems.length > 0) {
        await importKnowledge.mutateAsync(importItems);
        setShowImportDialog(false);
        setImportText("");
      }
    } catch (error) {
      console.error("Import error:", error);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      product: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      policy: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      faq: "bg-green-500/10 text-green-700 dark:text-green-400",
      procedure: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      pricing: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      script: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
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
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold">{stats.total}</span>
              </div>
              <p className="text-xs text-muted-foreground">Total de itens</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-2xl font-bold">{stats.verified}</span>
              </div>
              <p className="text-xs text-muted-foreground">Verificados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-2xl font-bold">{stats.totalUsage || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">Usos totais</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-500" />
                <span className="text-2xl font-bold">{stats.bySource?.ai || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">Aprendidos pela IA</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conhecimento..."
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
            {KNOWLEDGE_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Import Dialog */}
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <FileUp className="h-4 w-4 mr-2" />
              Importar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar Conhecimento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Formato: categoria|título|conteúdo</Label>
                <Textarea
                  placeholder="faq|Prazo de entrega|Entregamos em 3 a 5 dias úteis
product|Plano Pro|Nosso plano mais completo com recursos avançados"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={8}
                />
              </div>
              <Button onClick={handleImport} disabled={!importText.trim()}>
                Importar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Dialog */}
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? "Editar Conhecimento" : "Adicionar Conhecimento"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: KnowledgeCategory) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KNOWLEDGE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subcategoria (opcional)</Label>
                  <Input
                    value={formData.subcategory}
                    onChange={(e) =>
                      setFormData({ ...formData, subcategory: e.target.value })
                    }
                    placeholder="Ex: Envio, Pagamento"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="Ex: Prazo de entrega"
                />
              </div>

              <div className="space-y-2">
                <Label>Conteúdo</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="O prazo de entrega é de 3 a 5 dias úteis para todo o Brasil..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Palavras-chave (separadas por vírgula)</Label>
                <Input
                  value={formData.keywords}
                  onChange={(e) =>
                    setFormData({ ...formData, keywords: e.target.value })
                  }
                  placeholder="entrega, prazo, frete, envio"
                />
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
                  onClick={editingItem ? handleUpdate : handleAdd}
                  disabled={isAdding || isUpdating || !formData.title || !formData.content}
                >
                  {isAdding || isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {editingItem ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Knowledge Table */}
      <Card>
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Usos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum conhecimento encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {item.content}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getCategoryColor(item.category)}>
                        {KNOWLEDGE_CATEGORIES.find(c => c.value === item.category)?.label || item.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.is_verified ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-700 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Verificado
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          Pendente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium">{item.usage_count}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!item.is_verified && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => verifyKnowledge.mutate(item.id)}
                            title="Verificar"
                          >
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(item)}
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
                              <AlertDialogTitle>Excluir conhecimento?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteKnowledge.mutate(item.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
};
