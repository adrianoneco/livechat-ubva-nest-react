import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Lead, LeadStatus } from "@/hooks/sales/useLeads";
import { useMemo } from 'react';
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RecentLeadsListProps {
  leads: Lead[];
  onSelectLead?: (lead: Lead) => void;
}

const statusConfig: Record<LeadStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  new: { label: 'Novo', variant: 'default' },
  contacted: { label: 'Contatado', variant: 'secondary' },
  qualified: { label: 'Qualificado', variant: 'outline' },
  proposal: { label: 'Proposta', variant: 'outline' },
  negotiation: { label: 'Negociação', variant: 'outline' },
  won: { label: 'Ganho', variant: 'default' },
  lost: { label: 'Perdido', variant: 'destructive' },
};

export const RecentLeadsList = ({ leads, onSelectLead }: RecentLeadsListProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const leadsArray = useMemo(() => {
    // Defensive: ensure leads is an array. Sometimes upstream queries
    // may return an object (e.g. { data }) due to mis-binding.
    if (Array.isArray(leads)) {
      return leads;
    }
    if (leads && typeof leads === 'object' && Array.isArray((leads as any).data)) {
      return (leads as any).data;
    }
    return [] as typeof leads;
  }, [leads]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads Recentes</CardTitle>
      </CardHeader>
      <CardContent>
        {leadsArray.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum lead encontrado
          </p>
        ) : (
          <div className="space-y-4">
            {leadsArray.slice(0, 5).map((lead) => {
              const config = statusConfig[lead.status];
              return (
                <div
                  key={lead.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onSelectLead?.(lead)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={lead.contact?.profile_picture_url} />
                    <AvatarFallback>
                      {lead.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{lead.name}</span>
                      <Badge variant={config.variant} className="text-xs">
                        {config.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {lead.company && (
                        <span className="truncate">{lead.company}</span>
                      )}
                      <span>•</span>
                      <span>
                        {lead.created_at && new Date(lead.created_at).getTime() 
                          ? formatDistanceToNow(new Date(lead.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })
                          : 'Data inválida'
                        }
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="font-semibold text-green-600">
                      {formatCurrency(Number(lead.value) || 0)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {lead.probability}% prob.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
