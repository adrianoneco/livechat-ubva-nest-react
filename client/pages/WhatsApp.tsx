import { useState, useEffect, useCallback } from "react";
import { ConversationsSidebar } from "@/components/conversations";
import { ChatArea, ConversationDetailsSidebar } from "@/components/chat";
import { useWhatsAppInstances, useWhatsAppConversations } from "@/hooks/whatsapp";
import { useNotifications } from "@/hooks/useNotifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { useInstanceStatusMonitor } from "@/hooks/useInstanceStatusMonitor";
import { DisconnectedInstancesBanner } from "@/components/notifications/DisconnectedInstancesBanner";
import { EscalationAlert } from "@/components/escalation";
import { Button } from "@/components/ui/button";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Settings, ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

const SIDEBAR_WIDTH_KEY = "whatsapp_sidebar_width";
const DEFAULT_SIDEBAR_SIZE = 25; // percentage
const MIN_SIDEBAR_SIZE = 15;
const MAX_SIDEBAR_SIZE = 40;

const WhatsApp = () => {
  const navigate = useNavigate();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const { setSelectedConversationId } = useNotifications();
  const [isDetailsSidebarCollapsed, setIsDetailsSidebarCollapsed] = useState(false);
  const [isConversationsSidebarCollapsed, setIsConversationsSidebarCollapsed] = useState(false);
  const { instances } = useWhatsAppInstances();
  const { disconnectedInstances } = useInstanceStatusMonitor();
  const isMobile = useIsMobile();

  // Load saved sidebar width from localStorage
  const [sidebarSize, setSidebarSize] = useState<number>(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= MIN_SIDEBAR_SIZE && parsed <= MAX_SIDEBAR_SIZE) {
        return parsed;
      }
    }
    return DEFAULT_SIDEBAR_SIZE;
  });

  // Save sidebar width to localStorage
  const handleSidebarResize = useCallback((sizes: number[]) => {
    const newSize = sizes[0];
    if (newSize >= MIN_SIDEBAR_SIZE && newSize <= MAX_SIDEBAR_SIZE) {
      setSidebarSize(newSize);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, newSize.toString());
    }
  }, []);

  // If route param present, use it as selected conversation
  const { conversationId: routeConversationId } = useParams();
  useEffect(() => {
    if (routeConversationId) setSelectedConversation(routeConversationId);
  }, [routeConversationId]);

  // Show all conversations from all instances by default
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>(undefined);

  // Fetch conversations to get contact name
  const { conversations } = useWhatsAppConversations({ instanceId: selectedInstanceId });
  const selectedConv = conversations.find(c => c.id === selectedConversation);

  // Inform NotificationContext about open conversation
  useEffect(() => {
    setSelectedConversationId(selectedConversation);
    return () => setSelectedConversationId(null);
  }, [selectedConversation, setSelectedConversationId]);

  const handleSelectConversation = (id: string | null) => {
    setSelectedConversation(id);
    if (id) navigate(`/whatsapp/${id}`);
    else navigate('/whatsapp');
  };

  const handleBackToSidebar = () => {
    setSelectedConversation(null);
  };

  // Mobile: show sidebar OR chat, never both
  const showSidebar = !isMobile || !selectedConversation;
  const showChat = !isMobile || selectedConversation;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      {/* Disconnected Instances Banner */}
      <DisconnectedInstancesBanner instances={disconnectedInstances} />

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Layout */}
        {isMobile ? (
          <>
            {showSidebar && (
              <div className="w-full border-r border-border">
                <ConversationsSidebar
                  selectedId={selectedConversation}
                  onSelect={handleSelectConversation}
                  instanceId={selectedInstanceId}
                  isCollapsed={false}
                  onToggleCollapse={() => { }}
                />
              </div>
            )}
            {showChat && (
              <div className="flex-1 flex flex-col">
                {selectedConversation && (
                  <div className="border-b border-border p-2">
                    <Button variant="ghost" size="sm" onClick={handleBackToSidebar}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Voltar
                    </Button>
                  </div>
                )}
                <ChatArea conversationId={selectedConversation} />
              </div>
            )}
          </>
        ) : (
          /* Desktop Layout with Resizable Panels */
          <ResizablePanelGroup
            direction="horizontal"
            onLayout={handleSidebarResize}
            className="flex-1"
          >
            {/* Conversations Sidebar */}
            <ResizablePanel
              defaultSize={sidebarSize}
              minSize={MIN_SIDEBAR_SIZE}
              maxSize={MAX_SIDEBAR_SIZE}
              className="border-r border-border"
            >
              {isConversationsSidebarCollapsed ? (
                <div className="w-14 h-full">
                  <ConversationsSidebar
                    selectedId={selectedConversation}
                    onSelect={handleSelectConversation}
                    instanceId={selectedInstanceId}
                    isCollapsed={true}
                    onToggleCollapse={() => setIsConversationsSidebarCollapsed(false)}
                  />
                </div>
              ) : (
                <ConversationsSidebar
                  selectedId={selectedConversation}
                  onSelect={handleSelectConversation}
                  instanceId={selectedInstanceId}
                  isCollapsed={false}
                  onToggleCollapse={() => setIsConversationsSidebarCollapsed(true)}
                />
              )}
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Chat Area */}
            <ResizablePanel defaultSize={100 - sidebarSize - (isDetailsSidebarCollapsed ? 3 : 20)} minSize={30}>
              <ChatArea conversationId={selectedConversation} rightSidebarPercent={isDetailsSidebarCollapsed ? 3 : 20} />
            </ResizablePanel>

            {/* Details Sidebar */}
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={isDetailsSidebarCollapsed ? 3 : 20}
              minSize={3}
              maxSize={35}
              collapsible
              collapsedSize={3}
            >
              <ConversationDetailsSidebar
                conversationId={selectedConversation}
                contactName={selectedConv?.contact?.name}
                isCollapsed={isDetailsSidebarCollapsed}
                onToggleCollapse={() => setIsDetailsSidebarCollapsed(!isDetailsSidebarCollapsed)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        {/* No instance state removed - instances list handles empty state */}
      </div>

      {/* Escalation Alert */}
      <EscalationAlert onOpenQueue={() => navigate('/admin/conversas')} />
    </div>
  );
};

export default WhatsApp;
