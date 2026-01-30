import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Ticket, 
  Clock, 
  AlertTriangle, 
  CheckCircle2,
  TrendingUp,
  Star,
  RefreshCw,
  Download,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTicketMetrics, useCriticalTickets } from '@/hooks/admin/useTicketMetrics';
import { useSLAConfig } from '@/hooks/admin/useSLAConfig';
import { SLAIndicator } from '@/components/admin/SLAIndicator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_COLORS = {
  aberto: '#eab308',
  em_atendimento: '#3b82f6',
  finalizado: '#22c55e',
};

const PRIORITY_COLORS = {
  baixa: '#22c55e',
  media: '#eab308',
  alta: '#ef4444',
};

const PRIORITY_LABELS = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

const STATUS_LABELS = {
  aberto: 'Aberto',
  em_atendimento: 'Em Atendimento',
  finalizado: 'Finalizado',
};

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o período' },
];

export default function AdminTickets() {
  const [periodDays, setPeriodDays] = useState<number | undefined>(30);
  const { data: metrics, isLoading: metricsLoading, refetch } = useTicketMetrics(undefined, periodDays);
  const { data: criticalTickets, isLoading: criticalLoading } = useCriticalTickets();
  const { data: slaConfigMap } = useSLAConfig();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handlePeriodChange = (value: string) => {
    setPeriodDays(value === 'all' ? undefined : parseInt(value, 10));
  };

  const handleExportCSV = () => {
    if (!criticalTickets || criticalTickets.length === 0) return;
    
    const headers = ['Contato', 'Telefone', 'Setor', 'Prioridade', 'Status', 'Atendente', 'Criado em'];
    const rows = criticalTickets.map(ticket => [
      ticket.conversation?.contact?.name || 'N/A',
      ticket.conversation?.contact?.phone_number || 'N/A',
      ticket.sector?.name || 'N/A',
      PRIORITY_LABELS[ticket.prioridade as keyof typeof PRIORITY_LABELS] || 'Média',
      STATUS_LABELS[ticket.status as keyof typeof STATUS_LABELS] || ticket.status,
      ticket.atendente?.full_name || 'Não atribuído',
      new Date(ticket.created_at).toLocaleString('pt-BR'),
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tickets-criticos-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatMinutes = (minutes: number | null) => {
    if (minutes === null) return '-';
    if (minutes < 60) return `${Math.round(minutes)}min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}min`;
  };

  const getNPSColor = (nps: number | null) => {
    if (nps === null) return 'text-muted-foreground';
    if (nps >= 50) return 'text-green-600';
    if (nps >= 0) return 'text-yellow-600';
    return 'text-red-600';
  };

  const statusChartData = metrics ? [
    { name: 'Aberto', value: metrics.byStatus.aberto, fill: STATUS_COLORS.aberto },
    { name: 'Em Atendimento', value: metrics.byStatus.em_atendimento, fill: STATUS_COLORS.em_atendimento },
    { name: 'Finalizado', value: metrics.byStatus.finalizado, fill: STATUS_COLORS.finalizado },
  ] : [];

  const priorityChartData = metrics ? [
    { name: 'Baixa', value: metrics.byPriority.baixa, fill: PRIORITY_COLORS.baixa },
    { name: 'Média', value: metrics.byPriority.media, fill: PRIORITY_COLORS.media },
    { name: 'Alta', value: metrics.byPriority.alta, fill: PRIORITY_COLORS.alta },
  ] : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/conversas">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <Ticket className="h-5 w-5" />
                Dashboard de Tickets
              </h1>
              <p className="text-sm text-muted-foreground">
                Métricas e monitoramento de SLA
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select 
              value={periodDays?.toString() || 'all'} 
              onValueChange={handlePeriodChange}
            >
              <SelectTrigger className="w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Tickets</CardTitle>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{metrics?.total || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics?.ticketsToday || 0} hoje · {metrics?.ticketsThisWeek || 0} esta semana
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SLA Violado</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-destructive">
                    {metrics?.slaViolated || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics?.total ? ((metrics.slaViolated / metrics.total) * 100).toFixed(1) : 0}% do total
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tempo Médio 1ª Resposta</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {formatMinutes(metrics?.avgFirstResponseMinutes ?? null)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Entre abertura e primeira resposta
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avaliação Média</CardTitle>
              <Star className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold flex items-center gap-1">
                    {metrics?.avgFeedbackScore?.toFixed(1) || '-'}
                    {metrics?.avgFeedbackScore && <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Baseado nos feedbacks recebidos
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">NPS</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className={`text-2xl font-bold ${getNPSColor(metrics?.nps ?? null)}`}>
                    {metrics?.nps !== null && metrics?.nps !== undefined ? metrics.nps : '-'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics?.promoters || 0} promotores · {metrics?.detractors || 0} detratores
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição por Status</CardTitle>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {statusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex justify-center gap-4 mt-4">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: STATUS_COLORS[key as keyof typeof STATUS_COLORS] }}
                    />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição por Prioridade</CardTitle>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priorityChartData} layout="vertical">
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={60} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {priorityChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Critical Tickets Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Tickets Críticos
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportCSV}
              disabled={!criticalTickets || criticalTickets.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </CardHeader>
          <CardContent>
            {criticalLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : criticalTickets && criticalTickets.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contato</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Atendente</TableHead>
                    <TableHead>Criado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criticalTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium">
                        {ticket.conversation?.contact?.name || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ticket.sector?.name}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          style={{ 
                            backgroundColor: PRIORITY_COLORS[ticket.prioridade as keyof typeof PRIORITY_COLORS] + '20',
                            color: PRIORITY_COLORS[ticket.prioridade as keyof typeof PRIORITY_COLORS],
                          }}
                        >
                          {PRIORITY_LABELS[ticket.prioridade as keyof typeof PRIORITY_LABELS] || 'Média'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <SLAIndicator 
                          ticket={ticket} 
                          slaConfig={slaConfigMap?.[ticket.prioridade || 'media']} 
                        />
                      </TableCell>
                      <TableCell>
                        {ticket.atendente?.full_name || (
                          <span className="text-muted-foreground">Não atribuído</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(ticket.created_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>Nenhum ticket crítico no momento</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
