interface HMRConfig {
  protocol: string;
  host: string;
  port: number;
  clientPort: number;
}

export function getHMRConfig(): HMRConfig | false {
  try {
    const appOrigin = process.env.APP_ORIGIN || process.env.FRONTEND_URL || '';
    
    if (!appOrigin) {
      return {
        protocol: 'ws',
        host: 'localhost',
        port: 8080,
        clientPort: 8080,
      };
    }

    const parsed = new URL(appOrigin);

    // Disable HMR for HTTPS origins (Vite dev server doesn't have SSL)
    if (parsed.protocol === 'https:') {
      console.log('[vite] HMR disabled: HTTPS origin detected, use manual refresh');
      return false;
    }

    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 80;

    return {
      protocol: 'ws',
      host,
      port,
      clientPort: port,
    };
  } catch (error) {
    console.warn('[vite] Failed to parse APP_ORIGIN, using defaults');
    return {
      protocol: 'ws',
      host: 'localhost',
      port: 8080,
      clientPort: 8080,
    };
  }
}
