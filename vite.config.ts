import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import crypto from "crypto";

// Simple token validation for protected storage access
const STORAGE_SECRET = process.env.STORAGE_SECRET || 'livechat-storage-secret-key-2026';

function generateAccessToken(filePath: string, expiresIn: number = 3600): string {
  const expires = Date.now() + (expiresIn * 1000);
  const data = `${filePath}:${expires}`;
  const signature = crypto.createHmac('sha256', STORAGE_SECRET).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ path: filePath, expires, sig: signature })).toString('base64url');
}

function validateAccessToken(token: string, requestedPath: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    const { path: tokenPath, expires, sig } = decoded;
    
    // Check expiration
    if (Date.now() > expires) return false;
    
    // Check path matches
    if (tokenPath !== requestedPath) return false;
    
    // Verify signature
    const data = `${tokenPath}:${expires}`;
    const expectedSig = crypto.createHmac('sha256', STORAGE_SECRET).update(data).digest('hex');
    return sig === expectedSig;
  } catch {
    return false;
  }
}

// Custom plugin to serve and upload to storage directory
function storagePlugin() {
  return {
    name: 'storage-plugin',
    configureServer(server: any) {
      // Handle file uploads to /api/upload
      server.middlewares.use('/api/upload', async (req: any, res: any, next: any) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          return next();
        }

        try {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }
          
          const data = JSON.parse(body);
          const { base64Data, bucket, instanceName, contactId, filename, mimetype } = data;

          if (!base64Data || !filename) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'base64Data and filename are required' }));
            return;
          }

          // Determine storage path based on bucket structure
          let relativePath: string;
          let dirPath: string;

          if (bucket === 'whatsapp-media' && instanceName) {
            // WhatsApp media: /storage/whatsapp-media/{instance}/{filename}
            relativePath = `whatsapp-media/${instanceName}/${filename}`;
            dirPath = path.join(__dirname, 'storage', 'whatsapp-media', instanceName);
          } else if (contactId) {
            // Contact-based storage: /storage/contacts/{contactId}/{filename}
            relativePath = `contacts/${contactId}/${filename}`;
            dirPath = path.join(__dirname, 'storage', 'contacts', contactId);
          } else {
            // Default bucket storage
            const bucketName = bucket || 'uploads';
            relativePath = `${bucketName}/${filename}`;
            dirPath = path.join(__dirname, 'storage', bucketName);
          }

          // Create directory
          fs.mkdirSync(dirPath, { recursive: true });

          // Convert base64 to buffer
          const base64String = base64Data.split(',')[1] || base64Data;
          const buffer = Buffer.from(base64String, 'base64');

          // Write file
          const filePath = path.join(dirPath, filename);
          fs.writeFileSync(filePath, buffer);

          const publicUrl = `/storage/${relativePath}`;
          
          console.log('[storage-plugin] File saved:', publicUrl);

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, publicUrl }));
        } catch (error: any) {
          console.error('[storage-plugin] Upload error:', error);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      // Generate signed URL for protected access
      server.middlewares.use('/api/storage/sign', async (req: any, res: any, next: any) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          return next();
        }

        try {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }
          
          const { filePath, expiresIn = 3600 } = JSON.parse(body);

          if (!filePath) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'filePath is required' }));
            return;
          }

          const token = generateAccessToken(filePath, expiresIn);
          const signedUrl = `/storage${filePath}?token=${token}`;

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ signedUrl }));
        } catch (error: any) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      // Serve files from /storage (with optional token protection)
      server.middlewares.use('/storage', (req: any, res: any, next: any) => {
        // Parse URL and query params
        const url = new URL(req.url, `http://${req.headers.host}`);
        const filePath = path.join(__dirname, 'storage', url.pathname);
        const token = url.searchParams.get('token');
        
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return next();
        }

        // For whatsapp-media bucket, allow access with or without token
        // (backwards compatibility - can be tightened later)
        const isWhatsAppMedia = url.pathname.startsWith('/whatsapp-media/');
        const isContacts = url.pathname.startsWith('/contacts/');
        
        // If token is provided, validate it
        if (token && !validateAccessToken(token, url.pathname)) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'Invalid or expired token' }));
          return;
        }

        // For protected buckets (future use), require token
        // Currently allowing all access for backwards compatibility
        
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.ogg': 'audio/ogg',
          '.opus': 'audio/opus',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.pdf': 'application/pdf',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xls': 'application/vnd.ms-excel',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.zip': 'application/zip',
          '.rar': 'application/x-rar-compressed',
        };
        
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

// Check if S3 URL override is enabled
const s3OverrideEnabled = process.env.S3_OVERRITE_URL === 'true';
const s3Endpoint = process.env.S3_ENDPOINT || 'http://192.168.3.39:9000';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: false,
    // CORS completely disabled - allow all origins
    cors: false,
    // Proxy API requests to the backend so frontend can be opened via network IP
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3231',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('[vite proxy /api] Error:', err.message);
          });
        },
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3231',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/storage': {
        target: 'http://127.0.0.1:3231',
        changeOrigin: true,
        secure: false,
      },
      '/evolution': {
        target: 'http://192.168.3.39:9002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/evolution/, ''),
      },
      // Proxy /s3/* to S3/MinIO when S3_OVERRITE_URL=true
      ...(s3OverrideEnabled ? {
        '/s3': {
          target: s3Endpoint,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/s3/, ''),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('[vite proxy /s3] Error:', err.message);
            });
          },
        },
      } : {}),
    },
    allowedHosts: true,
    // HMR configuration: disable when accessed via HTTPS proxy (cannot use WSS without SSL certs)
    // For local development, HMR works normally on ws://localhost:8080
    hmr: (() => {
      try {
        const appOrigin = process.env.APP_ORIGIN || process.env.FRONTEND_URL || '';
        if (appOrigin) {
          const parsed = new URL(appOrigin);
          // If origin is HTTPS, disable HMR (Vite dev server doesn't have SSL)
          // Hot reload won't work, but the site will load without errors
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
        }
      } catch (e) {
        // fallthrough to defaults
      }
      return {
        protocol: 'ws',
        host: 'localhost',
        port: 8080,
        clientPort: 8080,
      };
    })(),
    // Serve static files from ./storage directory
    fs: {
      allow: ['..', './storage'],
    },
  },
  // Serve /storage as static files in dev mode
  publicDir: 'public',
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    storagePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png', 'notification.mp3'],
      manifest: false, // Use existing manifest.json in public/
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^\/storage\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'storage-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^\/s3\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 's3-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            urlPattern: /\.(woff|woff2|ttf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/, /^\/storage/, /^\/s3/],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
    },
  },
  // Make storage available as static assets
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
}));
