import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { LeadStatus } from './useLeads';

export interface SalesMetrics {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  wonLeads: number;
  lostLeads: number;
  totalValue: number;
  wonValue: number;
  potentialValue: number;
  conversionRate: number;
  averageDealSize: number;
  leadsByStatus: Record<LeadStatus, number>;
  leadsBySource: Record<string, number>;
  recentActivity: any[];
}

export interface MetricsFilters {
  dateFrom?: string;
  dateTo?: string;
  assignedTo?: string;
}

export const useSalesMetrics = (filters?: MetricsFilters) => {
  return useQuery({
    queryKey: ['sales-metrics', filters],
    queryFn: async () => {
      let query = supabase.from('leads').select('*');

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }
      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      const { data: leads, error } = await query;
      if (error) throw error;

      const allLeads = leads || [];

      // Calculate metrics
      const totalLeads = allLeads.length;
      const newLeads = allLeads.filter(l => l.status === 'new').length;
      const qualifiedLeads = allLeads.filter(l => ['qualified', 'proposal', 'negotiation'].includes(l.status)).length;
      const wonLeads = allLeads.filter(l => l.status === 'won').length;
      const lostLeads = allLeads.filter(l => l.status === 'lost').length;

      const totalValue = allLeads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      const wonValue = allLeads
        .filter(l => l.status === 'won')
        .reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      const potentialValue = allLeads
        .filter(l => !['won', 'lost'].includes(l.status))
        .reduce((sum, l) => sum + (Number(l.value) || 0) * ((l.probability || 0) / 100), 0);

      const closedDeals = wonLeads + lostLeads;
      const conversionRate = closedDeals > 0 ? (wonLeads / closedDeals) * 100 : 0;
      const averageDealSize = wonLeads > 0 ? wonValue / wonLeads : 0;

      // Group by status
      const leadsByStatus: Record<LeadStatus, number> = {
        new: 0,
        contacted: 0,
        qualified: 0,
        proposal: 0,
        negotiation: 0,
        won: 0,
        lost: 0,
      };
      allLeads.forEach(l => {
        if (l.status in leadsByStatus) {
          leadsByStatus[l.status as LeadStatus]++;
        }
      });

      // Group by source
      const leadsBySource: Record<string, number> = {};
      allLeads.forEach(l => {
        leadsBySource[l.source] = (leadsBySource[l.source] || 0) + 1;
      });

      // Recent activity (last 10 leads)
      const recentActivity = allLeads.slice(0, 10);

      return {
        totalLeads,
        newLeads,
        qualifiedLeads,
        wonLeads,
        lostLeads,
        totalValue,
        wonValue,
        potentialValue,
        conversionRate,
        averageDealSize,
        leadsByStatus,
        leadsBySource,
        recentActivity,
      } as SalesMetrics;
    },
  });
};
