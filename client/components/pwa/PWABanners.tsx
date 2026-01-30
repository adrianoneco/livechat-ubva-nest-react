import { usePWA } from '@/contexts/PWAContext';
import { WifiOff, RefreshCw, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const { isOnline } = usePWA();
  const [show, setShow] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" message briefly
      setTimeout(() => setShow(false), 3000);
    }
  }, [isOnline, wasOffline]);

  if (!show) return null;

  return (
    <div 
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 flex items-center justify-center gap-2 text-sm transition-colors ${
        isOnline 
          ? 'bg-green-500/90 text-white' 
          : 'bg-destructive/90 text-destructive-foreground'
      }`}
    >
      {isOnline ? (
        <>
          <RefreshCw className="h-4 w-4" />
          <span>Conexão restaurada!</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Você está offline. Algumas funcionalidades podem não estar disponíveis.</span>
        </>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 ml-2 hover:bg-white/20"
        onClick={() => setShow(false)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function UpdateBanner() {
  const { isUpdateAvailable, updateApp } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  if (!isUpdateAvailable || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-primary text-primary-foreground rounded-lg shadow-lg p-4 max-w-sm">
      <div className="flex items-start gap-3">
        <RefreshCw className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Atualização disponível</p>
          <p className="text-sm opacity-90 mt-1">
            Uma nova versão do app está disponível.
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDismissed(true)}
            >
              Depois
            </Button>
            <Button
              size="sm"
              onClick={updateApp}
            >
              Atualizar agora
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InstallPrompt() {
  const { isInstallable, installPrompt, isInstalled } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  // Check if user has dismissed before (in this session) - MUST be before any conditional returns
  useEffect(() => {
    const wasDismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (wasDismissed) setDismissed(true);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Don't show if already installed, not installable, or dismissed
  if (isInstalled || !isInstallable || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-card border rounded-lg shadow-lg p-4 max-w-sm">
      <div className="flex items-start gap-3">
        <Download className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary" />
        <div className="flex-1">
          <p className="font-medium">Instalar LiveChat</p>
          <p className="text-sm text-muted-foreground mt-1">
            Instale o app para acesso rápido e notificações.
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
            >
              Agora não
            </Button>
            <Button
              size="sm"
              onClick={installPrompt}
            >
              Instalar
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 -mt-1 -mr-1"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
