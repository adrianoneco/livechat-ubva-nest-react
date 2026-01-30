import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/api/client";
import { playNotificationSound } from "@/utils/notificationSound";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getNotificationSettings, NotificationSettingsData } from "@/components/settings/NotificationSettings";

type NotificationSoundType = "reply" | "new_conversation" | "transfer";

interface NotificationContextType {
  permission: NotificationPermission;
  soundEnabled: boolean;
  totalUnread: number;
  selectedConversationId: string | null;
  requestPermission: () => Promise<void>;
  toggleSound: () => void;
  setSelectedConversationId: (id: string | null) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const SOUND_ENABLED_KEY = "whatsapp-sound-enabled";

// Custom audio player that uses settings with support for different sound types
const playCustomNotificationSound = (settings: NotificationSettingsData, type: NotificationSoundType = "reply") => {
  if (!settings.soundEnabled) return;
  
  let audioSrc: string;
  
  switch (type) {
    case "new_conversation":
      audioSrc = settings.customAudioNewConversation || settings.customAudioUrl || "/notification.mp3";
      break;
    case "transfer":
      audioSrc = settings.customAudioTransfer || settings.customAudioUrl || "/notification.mp3";
      break;
    case "reply":
    default:
      audioSrc = settings.customAudioUrl || "/notification.mp3";
      break;
  }
  
  const audio = new Audio(audioSrc);
  audio.volume = 0.5;
  audio.play().catch(console.error);
};

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem(SOUND_ENABLED_KEY);
    return saved !== null ? saved === "true" : true;
  });
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const selectedConversationRef = useRef<string | null>(null);
  const notificationSettingsRef = useRef<NotificationSettingsData>(getNotificationSettings());

  // Listen for settings changes
  useEffect(() => {
    const handleSettingsChange = (e: CustomEvent<NotificationSettingsData>) => {
      notificationSettingsRef.current = e.detail;
    };
    
    window.addEventListener("notification-settings-changed" as any, handleSettingsChange);
    return () => {
      window.removeEventListener("notification-settings-changed" as any, handleSettingsChange);
    };
  }, []);

  // Sync ref with state for realtime listener
  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // Calculate total unread count
  const { data: conversations } = useQuery({
    queryKey: ["conversations-unread-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("unread_count")
        .neq("unread_count", 0);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const totalUnread = conversations?.reduce((sum, conv) => sum + (conv.unread_count || 0), 0) || 0;

  // Update page title with unread count
  useEffect(() => {
    const baseTitle = "WhatsApp";
    if (totalUnread > 0) {
      document.title = totalUnread > 99 ? `(99+) ${baseTitle}` : `(${totalUnread}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [totalUnread]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const newValue = !prev;
      localStorage.setItem(SOUND_ENABLED_KEY, String(newValue));
      return newValue;
    });
  }, []);

  const showWebNotification = useCallback(async (contactName: string, messagePreview: string, conversationId: string) => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    try {
      const notification = new Notification(contactName, {
        body: messagePreview?.substring(0, 100) || "Nova mensagem",
        icon: "/favicon.ico",
        tag: `whatsapp-${conversationId}`,
        silent: true,
      });

      notification.onclick = () => {
        window.focus();
        window.dispatchEvent(
          new CustomEvent("openConversation", {
            detail: { conversationId },
          })
        );
        notification.close();
      };
    } catch (error) {
      console.error("Error showing notification:", error);
    }
  }, []);

  // Global listener for new messages
  useEffect(() => {
    const channel = supabase
      .channel("global-new-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
        },
        async (payload) => {
          const newMessage = payload.new as any;
          const settings = notificationSettingsRef.current;

          // Check if notifications are enabled
          if (!settings.enabled) return;

          // Ignore messages sent by us
          if (newMessage.is_from_me) return;

          // Ignore messages in the currently open conversation
          if (newMessage.conversation_id === selectedConversationRef.current) return;

          // Fetch conversation and contact info
          try {
            const { data: conversation } = await supabase
              .from("whatsapp_conversations")
              .select("contact:whatsapp_contacts(name), status")
              .eq("id", newMessage.conversation_id)
              .single();

            const contactName = conversation?.contact?.name || "Contato";
            const messagePreview = newMessage.content || "Nova mensagem";

            if (settings.showForReplies) {
              // Play sound
              if (settings.soundEnabled) {
                playCustomNotificationSound(settings, "reply");
              }

              // Show toast notification
              toast({
                title: contactName,
                description: messagePreview.substring(0, 80) + (messagePreview.length > 80 ? "..." : ""),
              });

              // Show web push notification
              showWebNotification(contactName, messagePreview, newMessage.conversation_id);
            }
          } catch (error) {
            console.error("Error processing notification:", error);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled, showWebNotification]);

  // Global listener for conversation transfers/assignments and status changes
  useEffect(() => {
    const channel = supabase
      .channel("global-conversation-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_conversations",
        },
        async (payload) => {
          const settings = notificationSettingsRef.current;
          if (!settings.enabled) return;

          const oldConv = payload.old as any;
          const newConv = payload.new as any;

          // Get current user
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // Check if status changed to open (reopened) or if it's a transfer
          const wasReopened = oldConv.status === "closed" && newConv.status === "open";
          const wasTransferred = oldConv.assigned_to !== newConv.assigned_to && newConv.assigned_to;
          const sectorChanged = oldConv.sector_id !== newConv.sector_id && newConv.sector_id;

          // Fetch contact info
          const { data: conversation } = await supabase
            .from("whatsapp_conversations")
            .select("contact:whatsapp_contacts(name)")
            .eq("id", newConv.id)
            .single();

          const contactName = conversation?.contact?.name || "Contato";

          // Handle transfer notifications
          if (wasTransferred && settings.showForTransfers) {
            // Notify the user being assigned
            if (newConv.assigned_to === user.id) {
              if (settings.soundEnabled) {
                playCustomNotificationSound(settings, "transfer");
              }
              toast({
                title: "Conversa transferida para você",
                description: `${contactName} foi atribuída a você`,
              });
            }

            // Notify members of the conversation's sector
            if (newConv.sector_id) {
              try {
                // Check if current user is in the sector
                const { data: userSector } = await supabase
                  .from("user_sectors")
                  .select("id")
                  .eq("user_id", user.id)
                  .eq("sector_id", newConv.sector_id)
                  .maybeSingle();

                // If user is in the sector and is NOT the assignee, notify them
                if (userSector && newConv.assigned_to !== user.id) {
                  const { data: assignee } = await supabase
                    .from("profiles")
                    .select("full_name")
                    .eq("id", newConv.assigned_to)
                    .single();

                  const assigneeName = assignee?.full_name || "Atendente";

                  toast({
                    title: "Conversa atribuída",
                    description: `${contactName} foi atribuída a ${assigneeName}`,
                  });
                }
              } catch (error) {
                console.error("Error checking sector membership:", error);
              }
            }
          }

          // Handle sector change (transfer to another sector)
          if (sectorChanged && settings.showForTransfers) {
            try {
              // Check if current user is in the NEW sector
              const { data: userSector } = await supabase
                .from("user_sectors")
                .select("id")
                .eq("user_id", user.id)
                .eq("sector_id", newConv.sector_id)
                .maybeSingle();

              // If user is in the new sector, notify them
              if (userSector) {
                const { data: sector } = await supabase
                  .from("sectors")
                  .select("name")
                  .eq("id", newConv.sector_id)
                  .single();

                const sectorName = sector?.name || "Setor";

                if (settings.soundEnabled) {
                  playCustomNotificationSound(settings, "transfer");
                }
                toast({
                  title: "Nova conversa no setor",
                  description: `${contactName} foi transferida para ${sectorName}`,
                });
              }
            } catch (error) {
              console.error("Error handling sector change:", error);
            }
          }

          // Handle reopened conversations
          if (wasReopened && settings.showForNewConversation) {
            try {
              // Check if current user is in the conversation's sector
              if (newConv.sector_id) {
                const { data: userSector } = await supabase
                  .from("user_sectors")
                  .select("id")
                  .eq("user_id", user.id)
                  .eq("sector_id", newConv.sector_id)
                  .maybeSingle();

                if (userSector) {
                  if (settings.soundEnabled) {
                    playCustomNotificationSound(settings, "new_conversation");
                  }
                  toast({
                    title: "Conversa reaberta",
                    description: `${contactName} reabriu a conversa`,
                  });
                }
              }
            } catch (error) {
              console.error("Error handling reopened conversation:", error);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Global listener for new conversations (INSERT)
  useEffect(() => {
    const channel = supabase
      .channel("global-new-conversations")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_conversations",
        },
        async (payload) => {
          const settings = notificationSettingsRef.current;
          if (!settings.enabled || !settings.showForNewConversation) return;

          const newConv = payload.new as any;

          // Get current user
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // Fetch contact info
          const { data: conversation } = await supabase
            .from("whatsapp_conversations")
            .select("contact:whatsapp_contacts(name)")
            .eq("id", newConv.id)
            .single();

          const contactName = conversation?.contact?.name || "Contato";

          // Check if current user is in the conversation's sector
          if (newConv.sector_id) {
            try {
              const { data: userSector } = await supabase
                .from("user_sectors")
                .select("id")
                .eq("user_id", user.id)
                .eq("sector_id", newConv.sector_id)
                .maybeSingle();

              if (userSector) {
                if (settings.soundEnabled) {
                  playCustomNotificationSound(settings, "new_conversation");
                }
                toast({
                  title: "Nova conversa",
                  description: `${contactName} iniciou uma nova conversa`,
                });
              }
            } catch (error) {
              console.error("Error handling new conversation:", error);
            }
          } else {
            // No sector assigned - notify admins/supervisors
            try {
              const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single();

              if (profile?.role === "admin" || profile?.role === "supervisor") {
                if (settings.soundEnabled) {
                  playCustomNotificationSound(settings, "new_conversation");
                }
                toast({
                  title: "Nova conversa",
                  description: `${contactName} iniciou uma nova conversa`,
                });
              }
            } catch (error) {
              console.error("Error checking admin status:", error);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        permission,
        soundEnabled,
        totalUnread,
        selectedConversationId,
        requestPermission,
        toggleSound,
        setSelectedConversationId,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
};
