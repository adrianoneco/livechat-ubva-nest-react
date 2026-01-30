import { useState, useEffect, useCallback } from 'react';

interface OnlineStatusOptions {
  pingUrl?: string;
  pingInterval?: number;
  onOnline?: () => void;
  onOffline?: () => void;
}

export function useOnlineStatus(options: OnlineStatusOptions = {}) {
  const {
    pingUrl = '/api/health',
    pingInterval = 30000,
    onOnline,
    onOffline,
  } = options;

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [lastOnline, setLastOnline] = useState<Date | null>(navigator.onLine ? new Date() : null);

  const checkServerConnection = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      const reachable = response.ok;
      setIsServerReachable(reachable);
      
      if (reachable) {
        setLastOnline(new Date());
      }
      
      return reachable;
    } catch {
      setIsServerReachable(false);
      return false;
    }
  }, [pingUrl]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastOnline(new Date());
      checkServerConnection();
      onOnline?.();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsServerReachable(false);
      onOffline?.();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic server ping when online
    let intervalId: NodeJS.Timeout | null = null;
    if (pingInterval > 0) {
      intervalId = setInterval(() => {
        if (navigator.onLine) {
          checkServerConnection();
        }
      }, pingInterval);
    }

    // Initial check
    if (navigator.onLine) {
      checkServerConnection();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (intervalId) clearInterval(intervalId);
    };
  }, [checkServerConnection, pingInterval, onOnline, onOffline]);

  return {
    isOnline,
    isServerReachable,
    isFullyOnline: isOnline && isServerReachable,
    lastOnline,
    checkConnection: checkServerConnection,
  };
}
