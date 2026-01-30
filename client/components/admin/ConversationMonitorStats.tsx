import { MessageSquare, Users, Clock, UserX, Bell, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ConversationMonitorStatsProps {
  stats: {
    total: number;
    active: number;
    waiting: number;
    unassigned: number;
    withUnread: number;
    slaViolated: number;
  };
}

export function ConversationMonitorStats({ stats }: ConversationMonitorStatsProps) {
  const statItems = [
    {
      label: 'Total',
      value: stats.total,
      icon: MessageSquare,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Ativas',
      value: stats.active,
      icon: Users,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Aguardando',
      value: stats.waiting,
      icon: Clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
    {
      label: 'Sem atendente',
      value: stats.unassigned,
      icon: UserX,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      label: 'Com não lidas',
      value: stats.withUnread,
      icon: Bell,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'SLA Violado',
      value: stats.slaViolated,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
      {statItems.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
