import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(!navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        // Show reconnected message briefly
        setTimeout(() => setShowBanner(false), 3000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  if (!showBanner) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[9999] px-4 py-3 flex items-center justify-center gap-3 text-sm font-medium transition-all duration-300",
        isOnline
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white"
      )}
    >
      {isOnline ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Conexão restaurada! Sincronizando...</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Você está offline. Algumas funcionalidades podem estar indisponíveis.</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-2 px-2 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
          >
            Tentar Reconectar
          </button>
        </>
      )}
      <button
        onClick={() => setShowBanner(false)}
        className="ml-auto p-1 hover:bg-white/20 rounded transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
