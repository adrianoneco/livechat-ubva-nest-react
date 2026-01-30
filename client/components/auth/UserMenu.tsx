import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LogOut, User as UserIcon, Circle, Search, BarChart3, Users, Monitor, Settings } from 'lucide-react';
import { ProfileModal } from './ProfileModal';

const statusColors = {
  online: 'bg-green-500',
  offline: 'bg-gray-500',
  away: 'bg-yellow-500',
  busy: 'bg-red-500',
};

const roleLabels = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Atendente',
};

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { profile, role, signOut } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (!profile || !role) {
    return null;
  }

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button className="flex items-center p-1 rounded-md hover:bg-accent/50 transition-colors">
            <div className="relative">
              <Avatar className="h-8 w-8 border-2 border-border">
                <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Circle
                className={`absolute -bottom-1 -right-1 h-2.5 w-2.5 ${statusColors[profile.status]} border-2 border-background rounded-full`}
                fill="currentColor"
              />
            </div>
          </button>
        ) : (
          <button className="flex items-center gap-3 hover:bg-accent/50 rounded-lg p-2 transition-colors">
            <div className="relative">
              <Avatar className="h-10 w-10 border-2 border-border">
                <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Circle 
                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 ${statusColors[profile.status]} border-2 border-background rounded-full`}
                fill="currentColor"
              />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-medium text-foreground">{profile.full_name}</span>
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {roleLabels[role]}
              </Badge>
            </div>
          </button>
        )}
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
          <DropdownMenuItem asChild>
            <Link to="/whatsapp/contatos">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Contatos
              </div>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link to="/whatsapp/relatorio">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Relatórios
              </div>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link to="/vendas">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Dashboard de Vendas
              </div>
            </Link>
          </DropdownMenuItem>

          {(role === 'admin' || role === 'supervisor') && (
            <DropdownMenuItem asChild>
              <Link to="/admin/conversas">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" />
                  Monitoramento
                </div>
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
            <UserIcon className="mr-2 h-4 w-4" />
            <span>Perfil</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link to="/whatsapp/settings">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configurações
              </div>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sair</span>
          </DropdownMenuItem>
      </DropdownMenuContent>

      <ProfileModal open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </DropdownMenu>
  );
}
