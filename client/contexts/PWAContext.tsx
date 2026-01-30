import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface PWAContextType {
  isOnline: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isUpdateAvailable: boolean;
  installPrompt: () => Promise<void>;
  updateApp: () => void;
  clearCache: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType | null>(null);

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('[PWA] Back online');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      console.log('[PWA] Gone offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Track install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
      console.log('[PWA] Install prompt available');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log('[PWA] App installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Track service worker updates
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        setSwRegistration(registration);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setIsUpdateAvailable(true);
                console.log('[PWA] Update available');
              }
            });
          }
        });
      });

      // Listen for controller change (new SW activated)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }, []);

  const installPrompt = useCallback(async () => {
    if (!deferredPrompt) {
      console.log('[PWA] No install prompt available');
      return;
    }

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log('[PWA] Install prompt outcome:', outcome);
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
    setIsInstallable(false);
  }, [deferredPrompt]);

  const updateApp = useCallback(() => {
    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [swRegistration]);

  const clearCache = useCallback(async () => {
    if (swRegistration) {
      swRegistration.active?.postMessage({ type: 'CLEAR_CACHE' });
    }
    
    // Also clear caches directly
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith('livechat-'))
        .map(name => caches.delete(name))
    );
    
    console.log('[PWA] Cache cleared');
  }, [swRegistration]);

  return (
    <PWAContext.Provider
      value={{
        isOnline,
        isInstallable,
        isInstalled,
        isUpdateAvailable,
        installPrompt,
        updateApp,
        clearCache,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

export function usePWA() {
  const context = useContext(PWAContext);
  if (!context) {
    // Return safe defaults if used outside provider
    return {
      isOnline: navigator.onLine,
      isInstallable: false,
      isInstalled: false,
      isUpdateAvailable: false,
      installPrompt: async () => {},
      updateApp: () => {},
      clearCache: async () => {},
    };
  }
  return context;
}
