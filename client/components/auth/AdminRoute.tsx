import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';

interface AdminRouteProps {
  children: ReactNode;
  allowedRoles?: ('admin' | 'supervisor')[];
}

export function AdminRoute({ children, allowedRoles = ['admin', 'supervisor'] }: AdminRouteProps) {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const hasAccess = role && allowedRoles.includes(role as 'admin' | 'supervisor');

  if (!hasAccess) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Acesso Negado</h1>
          <p className="text-muted-foreground max-w-md">
            Você não tem permissão para acessar esta página. 
            Apenas administradores e supervisores podem acessar o painel de monitoramento.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
