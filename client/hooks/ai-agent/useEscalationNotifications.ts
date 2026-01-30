import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { playNotificationSound } from '@/utils/notificationSound';

export interface EscalationNotification {
  id: string;
  escalation_id: string;
  user_id: string;
  notification_type: 'new_escalation' | 'priority_change' | 'reassignment' | 'timeout_warning';
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  // Joined data
  escalation?: {
    id: string;
    conversation_id: string;
    ai_summary: string | null;
    escalation_reason: string;
    priority: number;
    customer_sentiment: string | null;
    conversation?: {
      contact?: {
        name: string | null;
        phone_number: string;
      };
    };
  };
}

export const useEscalationNotifications = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['escalation-notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('escalation_notifications')
        .select(`
          *,
          escalation:escalation_queue(
            id,
            conversation_id,
            ai_summary,
            escalation_reason,
            priority,
            customer_sentiment,
            conversation:whatsapp_conversations(
              contact:whatsapp_contacts(name, phone_number)
            )
          )
        `)
        .eq('user_id', user.id)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as EscalationNotification[];
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const unreadNotifications = notifications.filter(n => !n.read_at);
  const unreadCount = unreadNotifications.length;

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;

    let notificationsInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel(`escalation-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'escalation_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Debounce invalidation to prevent excessive re-renders
          clearTimeout(notificationsInvalidateTimeout);
          notificationsInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['escalation-notifications', user.id] });
          }, 100);
          
          // Play notification sound for new escalations (only on INSERT)
          if (payload.eventType === 'INSERT' && payload.new && (payload.new as any).notification_type === 'new_escalation') {
            playNotificationSound();
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(notificationsInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('escalation_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
      return notificationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-notifications', user?.id] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user) return;

      const { error } = await supabase
        .from('escalation_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-notifications', user?.id] });
    },
  });

  const dismiss = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('escalation_notifications')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
      return notificationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-notifications', user?.id] });
    },
  });

  const dismissAll = useMutation({
    mutationFn: async () => {
      if (!user) return;

      const { error } = await supabase
        .from('escalation_notifications')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('dismissed_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-notifications', user?.id] });
    },
  });

  return {
    notifications,
    unreadNotifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    dismiss,
    dismissAll,
  };
};
