import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    // Listen for service worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setNeedRefresh(true);
              }
            });
          }
        });
      });

      // Check if already cached for offline
      navigator.serviceWorker.ready.then(() => {
        setOfflineReady(true);
      });
    }

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleRefresh = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      });
    }
    window.location.reload();
  };

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstall(false);
    }
    setInstallPrompt(null);
  };

  if (needRefresh) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] bg-primary text-primary-foreground p-4 rounded-lg shadow-lg max-w-sm">
        <div className="flex items-start gap-3">
          <Download className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Nova versão disponível!</p>
            <p className="text-sm opacity-90 mt-1">
              Uma atualização está pronta. Recarregue para aplicar.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="secondary" onClick={handleRefresh}>
                Atualizar Agora
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
                Depois
              </Button>
            </div>
          </div>
          <button onClick={() => setNeedRefresh(false)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (showInstall && installPrompt) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] bg-card text-card-foreground border p-4 rounded-lg shadow-lg max-w-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium">Instalar LiveChat</p>
            <p className="text-sm text-muted-foreground mt-1">
              Instale o app para acesso rápido e uso offline.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleInstall}>
                Instalar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowInstall(false)}>
                Agora Não
              </Button>
            </div>
          </div>
          <button onClick={() => setShowInstall(false)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
