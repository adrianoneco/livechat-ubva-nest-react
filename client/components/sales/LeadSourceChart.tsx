import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface LeadSourceChartProps {
  data: Record<string, number>;
}

const sourceLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  website: 'Website',
  referral: 'Indicação',
  ads: 'Anúncios',
  organic: 'Orgânico',
  other: 'Outros',
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

export const LeadSourceChart = ({ data }: LeadSourceChartProps) => {
  const chartData = Object.entries(data).map(([source, count], index) => ({
    name: sourceLabels[source] || source,
    value: count,
    color: COLORS[index % COLORS.length],
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Origem dos Leads</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px]">
          <p className="text-muted-foreground">Nenhum dado disponível</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Origem dos Leads</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [value, 'Leads']}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
