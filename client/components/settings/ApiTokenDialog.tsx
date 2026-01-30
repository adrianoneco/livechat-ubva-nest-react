import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApiTokens, API_PERMISSIONS } from '@/hooks/api/useApiTokens';

interface ApiTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenCreated: (plainToken: string) => void;
}

export function ApiTokenDialog({ open, onOpenChange, onTokenCreated }: ApiTokenDialogProps) {
  const { createToken, isCreating } = useApiTokens();
  const [name, setName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(['read']);
  const [expiresIn, setExpiresIn] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let expires_at: string | undefined;
    if (expiresIn) {
      const days = parseInt(expiresIn);
      const date = new Date();
      date.setDate(date.getDate() + days);
      expires_at = date.toISOString();
    }

    try {
      const result = await createToken({
        name,
        permissions: selectedPermissions,
        expires_at,
      });
      
      onTokenCreated(result.plainToken);
      onOpenChange(false);
      
      // Reset form
      setName('');
      setSelectedPermissions(['read']);
      setExpiresIn('');
    } catch (error) {
      // Error handled by hook
    }
  };

  const handlePermissionToggle = (permission: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Novo Token de API</DialogTitle>
          <DialogDescription>
            Crie um token para acessar a API externamente
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Token</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Integração CRM"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Permissões</Label>
            <div className="space-y-3">
              {API_PERMISSIONS.map((permission) => (
                <div key={permission.value} className="flex items-start space-x-2">
                  <Checkbox
                    id={permission.value}
                    checked={selectedPermissions.includes(permission.value)}
                    onCheckedChange={() => handlePermissionToggle(permission.value)}
                  />
                  <div className="grid gap-0.5">
                    <Label htmlFor={permission.value} className="text-sm font-normal cursor-pointer">
                      {permission.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {permission.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires">Expiração (dias)</Label>
            <Input
              id="expires"
              type="number"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              placeholder="Deixe vazio para nunca expirar"
              min="1"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isCreating || selectedPermissions.length === 0}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Token
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
