import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
export type LeadSource = 'whatsapp' | 'website' | 'referral' | 'ads' | 'organic' | 'other';

export interface Lead {
  id: string;
  contact_id: string | null;
  conversation_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  status: LeadStatus;
  source: LeadSource;
  value: number;
  probability: number;
  expected_close_date: string | null;
  assigned_to: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  // Joined data
  contact?: any;
  assigned_agent?: any;
}

export interface LeadFilters {
  status?: LeadStatus[];
  source?: LeadSource[];
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface KanbanViewFilters extends LeadFilters {
  viewMode?: 'personal' | 'member' | 'sector' | 'all';
  selectedMemberId?: string;
  selectedSectorId?: string;
}

export const useLeads = (filters?: KanbanViewFilters) => {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          contact:whatsapp_contacts(id, name, phone_number, profile_picture_url),
          assigned_agent:profiles!leads_assigned_to_fkey(id, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status?.length) {
        query = query.in('status', filters.status);
      }
      if (filters?.source?.length) {
        query = query.in('source', filters.source);
      }
      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,company.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
      }

      // Filtro por membro específico (modo admin)
      if (filters?.selectedMemberId) {
        query = query.eq('assigned_to', filters.selectedMemberId);
      }

      // Filtro por setor específico (modo admin)
      if (filters?.selectedSectorId) {
        query = query.eq('sector_id', filters.selectedSectorId);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }
      return data as Lead[];
    },
  });

  const createLead = useMutation({
    mutationFn: async (lead: Omit<Partial<Lead>, 'contact' | 'assigned_agent'>) => {
      const { data, error } = await supabase
        .from('leads')
        .insert(lead as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-metrics'] });
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-metrics'] });
    },
  });

  const updateLeadStatus = useMutation({
    mutationFn: async ({ id, status, closedAt }: { id: string; status: LeadStatus; closedAt?: string }) => {
      const updates: any = { status };
      if (status === 'won' || status === 'lost') {
        updates.closed_at = closedAt || new Date().toISOString();
      }
      
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-metrics'] });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-metrics'] });
    },
  });

  return {
    leads,
    isLoading,
    error,
    createLead,
    updateLead,
    updateLeadStatus,
    deleteLead,
  };
};
