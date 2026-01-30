import { useState } from 'react';
import { Plus, Trash2, Key, Copy, Check, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApiTokens, API_PERMISSIONS } from '@/hooks/api/useApiTokens';
import { ApiTokenDialog } from './ApiTokenDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

export function ApiTokensManager() {
  const { tokens, isLoading, revokeToken, deleteToken, isDeleting } = useApiTokens();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    if (newToken) {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      toast({ title: "Token copiado!" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTokenCreated = (plainToken: string) => {
    setNewToken(plainToken);
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteToken(deletingId);
      setDeletingId(null);
    }
  };

  const getPermissionLabel = (permission: string) => {
    return API_PERMISSIONS.find(p => p.value === permission)?.label || permission;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Tokens de API</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie tokens para integração com sistemas externos
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Token
        </Button>
      </div>

      {/* New token display */}
      {newToken && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Token Criado
            </CardTitle>
            <CardDescription>
              Copie este token agora. Ele não será exibido novamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                {newToken}
              </code>
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="mt-2"
              onClick={() => setNewToken(null)}
            >
              Fechar
            </Button>
          </CardContent>
        </Card>
      )}

      {tokens && tokens.length > 0 ? (
        <div className="grid gap-4">
          {tokens.map((token) => (
            <Card key={token.id} className={!token.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{token.name}</CardTitle>
                    {!token.is_active && (
                      <Badge variant="destructive">Revogado</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {token.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeToken(token.id)}
                      >
                        Revogar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingId(token.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="font-mono">
                  {token.token_prefix}...
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2 mb-3">
                  {token.permissions.map((permission) => (
                    <Badge key={permission} variant="secondary">
                      {getPermissionLabel(permission)}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    Criado em: {format(new Date(token.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                  {token.last_used_at && (
                    <span>
                      Último uso: {format(new Date(token.last_used_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  )}
                  {token.expires_at && (
                    <span>
                      Expira: {format(new Date(token.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              Nenhum token de API criado
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro token
            </Button>
          </CardContent>
        </Card>
      )}

      <ApiTokenDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onTokenCreated={handleTokenCreated}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir token?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O token será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
