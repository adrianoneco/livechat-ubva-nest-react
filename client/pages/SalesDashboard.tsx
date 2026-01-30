import { useNavigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useSalesMetrics, useLeads } from "@/hooks/sales";
import { 
  SalesMetricCard, 
  SalesFunnelChart, 
  LeadSourceChart,
  RecentLeadsList,
  KanbanBoard,
  QuotesList,
  OrdersList,
  ProductCatalogManager
} from "@/components/sales";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Target,
  UserPlus,
  CheckCircle2,
  XCircle,
  Clock,
  LayoutGrid,
  Kanban,
  ArrowLeft,
  FileText,
  Package,
  ShoppingBag
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const SalesDashboardContent = () => {
  const navigate = useNavigate();
  const { data: metrics, isLoading: metricsLoading } = useSalesMetrics();
  const { leads, isLoading: leadsLoading } = useLeads();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Dashboard de Vendas</h1>
            <p className="text-muted-foreground">
              Acompanhe suas métricas e pipeline de vendas
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="gap-2">
            <LayoutGrid className="w-4 h-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="kanban" className="gap-2">
            <Kanban className="w-4 h-4" />
            Kanban
          </TabsTrigger>
          <TabsTrigger value="quotes" className="gap-2">
            <FileText className="w-4 h-4" />
            Cotações
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2">
            <Package className="w-4 h-4" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2">
            <ShoppingBag className="w-4 h-4" />
            Produtos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          {metricsLoading ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-80" />
                <Skeleton className="h-80" />
              </div>
            </>
          ) : (
            <>
              {/* Main Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SalesMetricCard
                  title="Total de Leads"
                  value={metrics?.totalLeads || 0}
                  subtitle="leads ativos"
                  icon={<Users className="w-4 h-4" />}
                />
                <SalesMetricCard
                  title="Valor Total"
                  value={formatCurrency(metrics?.totalValue || 0)}
                  subtitle="em pipeline"
                  icon={<DollarSign className="w-4 h-4" />}
                />
                <SalesMetricCard
                  title="Taxa de Conversão"
                  value={`${(metrics?.conversionRate || 0).toFixed(1)}%`}
                  subtitle="leads convertidos"
                  icon={<TrendingUp className="w-4 h-4" />}
                  trend={{ value: 5.2, label: 'vs mês anterior' }}
                />
                <SalesMetricCard
                  title="Ticket Médio"
                  value={formatCurrency(metrics?.averageDealSize || 0)}
                  subtitle="por venda"
                  icon={<Target className="w-4 h-4" />}
                />
              </div>

              {/* Secondary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SalesMetricCard
                  title="Novos Leads"
                  value={metrics?.newLeads || 0}
                  icon={<UserPlus className="w-4 h-4" />}
                  className="bg-blue-500/10 border-blue-500/20"
                />
                <SalesMetricCard
                  title="Qualificados"
                  value={metrics?.qualifiedLeads || 0}
                  icon={<Clock className="w-4 h-4" />}
                  className="bg-yellow-500/10 border-yellow-500/20"
                />
                <SalesMetricCard
                  title="Ganhos"
                  value={metrics?.wonLeads || 0}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  className="bg-green-500/10 border-green-500/20"
                />
                <SalesMetricCard
                  title="Perdidos"
                  value={metrics?.lostLeads || 0}
                  icon={<XCircle className="w-4 h-4" />}
                  className="bg-red-500/10 border-red-500/20"
                />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SalesFunnelChart 
                  data={metrics?.leadsByStatus || {
                    new: 0,
                    contacted: 0,
                    qualified: 0,
                    proposal: 0,
                    negotiation: 0,
                    won: 0,
                    lost: 0,
                  }} 
                />
                <LeadSourceChart data={metrics?.leadsBySource || {}} />
              </div>

              {/* Recent Leads */}
              <RecentLeadsList leads={leads || []} />
            </>
          )}
        </TabsContent>

        <TabsContent value="kanban" className="mt-0">
          <KanbanBoard />
        </TabsContent>

        <TabsContent value="quotes" className="mt-0">
          <QuotesList />
        </TabsContent>

        <TabsContent value="orders" className="mt-0">
          <OrdersList />
        </TabsContent>

        <TabsContent value="products" className="mt-0">
          <ProductCatalogManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const SalesDashboard = () => {
  return (
    <ProtectedRoute>
      <SalesDashboardContent />
    </ProtectedRoute>
  );
};

export default SalesDashboard;
