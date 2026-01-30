import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Monitor, Settings, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdminConversations } from '@/hooks/admin/useAdminConversations';
import { useConversationAssignment } from '@/hooks/whatsapp/useConversationAssignment';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';
import {
  ConversationMonitorCard,
  ConversationMonitorFilters,
  ConversationMonitorStats,
  ConversationViewModal,
} from '@/components/admin';
import { AssignAgentDialog } from '@/components/conversations/AssignAgentDialog';
import { Loader2 } from 'lucide-react';

const AdminConversations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { assignConversation, isAssigning } = useConversationAssignment();

  // Filters state
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [instanceId, setInstanceId] = useState('all');
  const [agentId, setAgentId] = useState('all');
  
  const debouncedSearch = useDebounce(search, 300);

  // Modal states
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferringConversationId, setTransferringConversationId] = useState<string | null>(null);

  const { conversations, isLoading, refetch, stats } = useAdminConversations({
    status: status !== 'all' ? status : undefined,
    instanceId: instanceId !== 'all' ? instanceId : undefined,
    agentId: agentId !== 'all' ? agentId : undefined,
    search: debouncedSearch,
  });

  const handleView = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setViewModalOpen(true);
  };

  const handleAssume = (conversationId: string) => {
    if (!user) return;
    
    assignConversation({
      conversationId,
      assignedTo: user.id,
      reason: 'Assumido pelo admin',
    });
  };

  const handleTransfer = (conversationId: string) => {
    setTransferringConversationId(conversationId);
    setTransferDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/whatsapp')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao WhatsApp
            </Button>
            <div className="flex items-center gap-2">
              <Monitor className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold text-foreground">
                Monitoramento de Conversas
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Link to="/admin/tickets">
              <Button variant="outline" size="sm">
                <Ticket className="h-4 w-4 mr-2" />
                Dashboard de Tickets
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => navigate('/whatsapp/settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4 space-y-4">
        {/* Stats */}
        <ConversationMonitorStats stats={stats} />

        {/* Filters */}
        <ConversationMonitorFilters
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          instanceId={instanceId}
          onInstanceChange={setInstanceId}
          agentId={agentId}
          onAgentChange={setAgentId}
        />

        {/* Conversations List */}
        <ScrollArea className="flex-1 h-[calc(100vh-320px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Monitor className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhuma conversa encontrada</p>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {conversations.map((conversation) => (
                <ConversationMonitorCard
                  key={conversation.id}
                  conversation={conversation}
                  onView={handleView}
                  onAssume={handleAssume}
                  onTransfer={handleTransfer}
                  isAssuming={isAssigning}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* View Modal */}
      <ConversationViewModal
        conversationId={selectedConversationId}
        open={viewModalOpen}
        onOpenChange={setViewModalOpen}
      />

      {/* Transfer Dialog */}
      {transferringConversationId && (
        <AssignAgentDialog
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
          conversationId={transferringConversationId}
          isTransfer={true}
        />
      )}
    </div>
  );
};

export default AdminConversations;
