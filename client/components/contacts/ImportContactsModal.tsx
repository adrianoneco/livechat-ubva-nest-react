import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useWhatsAppInstances } from '@/hooks/whatsapp';
import { useSectors } from '@/hooks/useSectors';
import { supabase } from '@/integrations/api/client';
import { toast } from 'sonner';
import { Loader2, Upload, CheckCircle, AlertCircle, Cloud } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ImportContactsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ImportStep = 'config' | 'connecting' | 'importing' | 'complete';

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export function ImportContactsModal({ open, onOpenChange }: ImportContactsModalProps) {
  const [step, setStep] = useState<ImportStep>('config');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [result, setResult] = useState<ImportResult | null>(null);
  
  const { instances } = useWhatsAppInstances();
  const { sectors } = useSectors(selectedInstanceId || undefined);

  const handleReset = () => {
    setStep('config');
    setResult(null);
    setSelectedInstanceId('');
    setSelectedSectorId('');
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const handleGoogleAuth = async () => {
    if (!selectedInstanceId) {
      toast.error('Selecione uma instância');
      return;
    }

    setStep('connecting');

    try {
      // Use Supabase OAuth to get Google token
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/contacts.readonly',
          redirectTo: `${window.location.origin}/whatsapp/contatos?import=google`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        throw error;
      }

      // Store import config in localStorage for after redirect
      localStorage.setItem('googleImportConfig', JSON.stringify({
        instanceId: selectedInstanceId,
        sectorId: selectedSectorId === '__none__' ? null : selectedSectorId,
      }));

    } catch (error: any) {
      console.error('Google auth error:', error);
      toast.error('Erro ao conectar com o Google');
      setStep('config');
    }
  };

  const handleImport = async (accessToken: string) => {
    setStep('importing');

    try {
      const config = localStorage.getItem('googleImportConfig');
      const { instanceId, sectorId } = config ? JSON.parse(config) : {
        instanceId: selectedInstanceId,
        sectorId: selectedSectorId,
      };

      const { data, error } = await supabase.functions.invoke('import-google-contacts', {
        body: {
          googleAccessToken: accessToken,
          instanceId,
          sectorId,
        },
      });

      if (error) throw error;

      setResult(data.result);
      setStep('complete');
      toast.success(data.message);

      // Clear config
      localStorage.removeItem('googleImportConfig');

    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Erro ao importar contatos');
      setStep('config');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            Importar Contatos do Google
          </DialogTitle>
          <DialogDescription>
            Importe seus contatos diretamente da sua conta Google.
          </DialogDescription>
        </DialogHeader>

        {step === 'config' && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instance">Instância de destino *</Label>
              <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a instância" />
                </SelectTrigger>
                <SelectContent>
                  {instances?.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedInstanceId && sectors.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="sector">Setor (opcional)</Label>
                <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem setor específico" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem setor específico</SelectItem>
                    {sectors.map((sector) => (
                      <SelectItem key={sector.id} value={sector.id}>
                        {sector.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <p className="text-muted-foreground">
                Ao clicar em "Conectar ao Google", você será redirecionado para autorizar o acesso 
                aos seus contatos. Apenas contatos com número de telefone serão importados.
              </p>
            </div>
          </div>
        )}

        {step === 'connecting' && (
          <div className="py-8 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Conectando ao Google...</p>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Importando contatos...</p>
            <Progress value={undefined} className="w-full" />
          </div>
        )}

        {step === 'complete' && result && (
          <div className="py-4 space-y-4">
            <div className="flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            
            <div className="text-center">
              <h3 className="text-lg font-semibold">Importação Concluída!</h3>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-500/10 p-3 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                <p className="text-xs text-muted-foreground">Importados</p>
              </div>
              <div className="bg-blue-500/10 p-3 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                <p className="text-xs text-muted-foreground">Atualizados</p>
              </div>
              <div className="bg-gray-500/10 p-3 rounded-lg">
                <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Ignorados</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-destructive/10 p-3 rounded-lg">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium text-sm">Erros ({result.errors.length})</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1 max-h-20 overflow-y-auto">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>... e mais {result.errors.length - 5} erros</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'config' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleGoogleAuth} disabled={!selectedInstanceId}>
                <Upload className="h-4 w-4 mr-2" />
                Conectar ao Google
              </Button>
            </>
          )}
          {step === 'complete' && (
            <Button onClick={handleClose}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
