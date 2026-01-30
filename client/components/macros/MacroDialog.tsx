import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tables } from "@/integrations/api/types";

type Macro = Tables<'whatsapp_macros'>;

const macroSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  description: z.string().optional(),
  category: z.string().default('geral'),
});

// Generate shortcut from name
const generateShortcut = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .substring(0, 20); // Limit length
};

type MacroFormValues = z.infer<typeof macroSchema>;

interface MacroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: MacroFormValues & { instance_id?: string }) => void;
  macro?: Macro;
  instanceId?: string;
  isLoading?: boolean;
}

const CATEGORIES = [
  { value: 'geral', label: 'Geral' },
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'suporte', label: 'Suporte' },
  { value: 'horarios', label: 'Horários' },
  { value: 'precos', label: 'Preços' },
];

export const MacroDialog = ({
  open,
  onOpenChange,
  onSubmit,
  macro,
  instanceId,
  isLoading,
}: MacroDialogProps) => {
  const form = useForm<MacroFormValues>({
    resolver: zodResolver(macroSchema),
    defaultValues: {
      name: macro?.name || "",
      content: macro?.content || "",
      description: macro?.description || "",
      category: macro?.category || "geral",
    },
  });

  const handleSubmit = (data: MacroFormValues) => {
    // Auto-generate shortcut from name
    const shortcut = macro?.shortcut || generateShortcut(data.name);
    onSubmit({ ...data, shortcut, instance_id: instanceId });
    form.reset();
  };

  const contentLength = form.watch("content")?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{macro ? "Editar Macro" : "Nova Macro"}</DialogTitle>
          <DialogDescription>
            Crie respostas rápidas para agilizar seu atendimento
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Macro</FormLabel>
                  <FormControl>
                    <Input placeholder="Boas-vindas" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conteúdo da Resposta</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Olá! Seja bem-vindo(a) à nossa loja!&#10;Como posso ajudar você hoje?"
                      className="min-h-[120px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="flex justify-between">
                    <span>O texto que será inserido no chat</span>
                    <span className="text-muted-foreground">{contentLength} caracteres</span>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Mensagem inicial para novos clientes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Salvando..." : macro ? "Atualizar Macro" : "Salvar Macro"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
