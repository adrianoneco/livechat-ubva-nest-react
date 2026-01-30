import type { ProxyOptions } from 'vite';

const API_TARGET = 'http://127.0.0.1:3231';

function createProxyConfig(target: string, rewrite?: (path: string) => string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: false,
    ws: true,
    ...(rewrite && { rewrite }),
    configure: (proxy) => {
      proxy.on('error', (err) => {
        console.log(`[vite proxy] Error:`, err.message);
      });
    },
  };
}

export function getProxyConfig() {
  const s3OverrideEnabled = process.env.S3_OVERRITE_URL === 'true';
  const s3Endpoint = process.env.S3_ENDPOINT || 'http://192.168.3.39:9000';

  const config: Record<string, ProxyOptions> = {
    '/api': createProxyConfig(API_TARGET),
    '/socket.io': createProxyConfig(API_TARGET),
    '/storage': createProxyConfig(API_TARGET),
  };

  // Add S3 proxy if enabled
  if (s3OverrideEnabled) {
    config['/s3'] = createProxyConfig(
      s3Endpoint,
      (path) => path.replace(/^\/s3/, '')
    );
  }

  return config;
}
