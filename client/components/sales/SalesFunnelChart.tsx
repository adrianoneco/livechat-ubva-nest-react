import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadStatus } from "@/hooks/sales/useLeads";

interface SalesFunnelChartProps {
  data: Record<LeadStatus, number>;
}

const statusConfig: { status: LeadStatus; label: string; color: string }[] = [
  { status: 'new', label: 'Novos', color: 'bg-blue-500' },
  { status: 'contacted', label: 'Contatados', color: 'bg-cyan-500' },
  { status: 'qualified', label: 'Qualificados', color: 'bg-yellow-500' },
  { status: 'proposal', label: 'Proposta', color: 'bg-orange-500' },
  { status: 'negotiation', label: 'Negociação', color: 'bg-purple-500' },
  { status: 'won', label: 'Ganhos', color: 'bg-green-500' },
];

export const SalesFunnelChart = ({ data }: SalesFunnelChartProps) => {
  const funnelData = useMemo(() => {
    const maxValue = Math.max(...statusConfig.map(s => data[s.status] || 0), 1);
    
    return statusConfig.map((config, index) => {
      const count = data[config.status] || 0;
      const width = Math.max((count / maxValue) * 100, 10);
      const isLast = index === statusConfig.length - 1;
      
      return {
        ...config,
        count,
        width: isLast ? width * 0.6 : width - (index * 5),
      };
    });
  }, [data]);

  const totalLeads = Object.values(data).reduce((sum, val) => sum + val, 0);
  const wonLeads = data.won || 0;
  const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Funil de Vendas</span>
          <span className="text-sm font-normal text-muted-foreground">
            Taxa de conversão: <span className="font-semibold text-green-500">{conversionRate}%</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {funnelData.map((item) => (
            <div key={item.status} className="relative">
              <div className="flex items-center gap-3">
                <div className="w-24 text-sm text-muted-foreground shrink-0">
                  {item.label}
                </div>
                <div className="flex-1 relative">
                  <div
                    className={`h-10 ${item.color} rounded-r-lg transition-all duration-500 flex items-center justify-end pr-3`}
                    style={{ width: `${item.width}%` }}
                  >
                    <span className="text-white font-semibold text-sm">
                      {item.count}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Perdidos</span>
            <span className="font-semibold text-red-500">{data.lost || 0}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
