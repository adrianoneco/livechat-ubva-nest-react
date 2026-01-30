import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useWhatsAppInstances, useCreateConversation } from "@/hooks/whatsapp";
import { toast } from "sonner";
import { normalizeBrazilianPhone } from "@/utils/phoneUtils";

// Phone mask function: supports (00) 0000-0000 (landline) and (00) 00000-0000 (mobile)
const formatPhoneMask = (value: string): string => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');
  
  // Apply mask progressively
  if (digits.length === 0) {
    return '';
  } else if (digits.length <= 2) {
    return `(${digits}`;
  } else if (digits.length <= 6) {
    // (00) 0000
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  } else if (digits.length <= 10) {
    // Landline: (00) 0000-0000
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  } else {
    // Mobile: (00) 00000-0000
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
};

interface NewConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  onSuccess?: (conversationId: string) => void;
}

const formSchema = z.object({
  instanceId: z.string().min(1, "Selecione uma instância"),
  phoneNumber: z
    .string()
    .refine((val) => {
      const digits = val.replace(/\D/g, '');
      // Accept 10 digits (landline) or 11 digits (mobile)
      return digits.length === 10 || digits.length === 11;
    }, {
      message: "Preencha o número completo: (00) 0000-0000 ou (00) 00000-0000",
    }),
  contactName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome muito longo"),
  generateTicket: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

const NewConversationModal = ({
  open,
  onOpenChange,
  instanceId,
  onSuccess,
}: NewConversationModalProps) => {
  const { instances, isLoading: loadingInstances } = useWhatsAppInstances();
  const { mutate: createConversation, isPending } = useCreateConversation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      instanceId: instanceId || "",
      phoneNumber: "",
      contactName: "",
      generateTicket: false,
    },
  });

  // Handle phone input with mask
  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, onChange: (value: string) => void) => {
    const formatted = formatPhoneMask(e.target.value);
    onChange(formatted);
  }, []);

  // Auto-select first instance if only one exists or if no instance is selected
  useEffect(() => {
    if (instances.length > 0 && !form.getValues('instanceId')) {
      form.setValue('instanceId', instances[0].id);
    }
  }, [instances, form]);

  const onSubmit = (values: FormValues) => {
    // Extract only digits and normalize phone number with country code 55
    const onlyDigits = values.phoneNumber.replace(/\D/g, '');
    const normalizedPhone = normalizeBrazilianPhone(onlyDigits);

    createConversation(
      {
        instanceId: values.instanceId,
        phoneNumber: normalizedPhone,
        contactName: values.contactName,
        generateTicket: values.generateTicket,
      },
      {
        onSuccess: (data) => {
          toast.success("Conversa criada com sucesso!");
          form.reset();
          onSuccess?.(data.conversation.id);
        },
        onError: (error) => {
          toast.error("Erro ao criar conversa", {
            description: error.message,
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
          <DialogDescription>
            Crie uma nova conversa com um contato do WhatsApp
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Instance selection (only if multiple instances or no instance selected) */}
            {(instances.length > 1 || !form.watch('instanceId')) && (
              <FormField
                control={form.control}
                name="instanceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instância</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loadingInstances}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma instância" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {instances.map((instance) => (
                          <SelectItem key={instance.id} value={instance.id}>
                            {instance.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Phone number with mask */}
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Telefone</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="(00) 0000-0000 ou (00) 00000-0000"
                      value={field.value}
                      onChange={(e) => handlePhoneChange(e, field.onChange)}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      maxLength={16}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    O código do país (55) será adicionado automaticamente
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Contact name */}
            <FormField
              control={form.control}
              name="contactName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Contato</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="João Silva"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Generate ticket checkbox (optional) */}
            <FormField
              control={form.control}
              name="generateTicket"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer">
                      Gerar ticket de atendimento
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Opcional: cria um ticket para esta conversa
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Criando..." : "Criar Conversa"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default NewConversationModal;
