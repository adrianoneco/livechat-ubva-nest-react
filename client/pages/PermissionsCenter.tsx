import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Shield, Users, Building2, History, FileText } from 'lucide-react';
import { 
  PermissionsMatrix, 
  SectorPermissionsCard, 
  RolesCapabilitiesCard,
  PermissionAuditLog 
} from '@/components/permissions';

const PermissionsCenter = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('matrix');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/whatsapp/settings')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Central de Permissões
                </h1>
                <p className="text-sm text-muted-foreground">
                  Gerencie permissões por usuário e setor
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="matrix" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Matriz de Acessos
            </TabsTrigger>
            <TabsTrigger value="sectors" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Por Setor
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documentação
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matrix">
            <PermissionsMatrix />
          </TabsContent>

          <TabsContent value="sectors">
            <SectorPermissionsCard />
          </TabsContent>

          <TabsContent value="roles">
            <RolesCapabilitiesCard />
          </TabsContent>

          <TabsContent value="audit">
            <PermissionAuditLog />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default PermissionsCenter;
