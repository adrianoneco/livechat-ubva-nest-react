import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { InstanceCard } from "./InstanceCard";
import { Loader2 } from "lucide-react";

export const InstancesList = () => {
  const { instances, isLoading } = useWhatsAppInstances();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (instances.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {instances.map((instance) => (
        <InstanceCard key={instance.id} instance={instance} />
      ))}
    </div>
  );
};
