// Load environment variables FIRST before any other imports
import './env';

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { initWebSocket } from './lib/websocket';
// Normalize Groq key early so all routes use cleaned key
import { getGroqConfig } from './lib/groq';

// initialize and log Groq config (no secrets printed)
const _groq = getGroqConfig();

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import conversationRoutes from './routes/conversations';
import storageRoutes from './routes/storage';
import whatsappRoutes from './routes/whatsapp';
import aiRoutes from './routes/ai';
import campaignRoutes from './routes/campaigns';
import leadRoutes from './routes/leads';
import escalationRoutes from './routes/escalations';
import meetingRoutes from './routes/meetings';
import knowledgeRoutes from './routes/knowledge';
import adminRoutes from './routes/admin';
import teamRoutes from './routes/team';
import setupRoutes from './routes/setup';
import tablesRoutes from './routes/tables';
import ticketsRoutes from './routes/tickets';
import integrationsRoutes from './routes/integrations';
import audioRoutes from './routes/audio';
import functionsRoutes from './routes/functions';

const app = express();

// Configure Express `trust proxy` so that middleware like express-rate-limit
// can correctly use `X-Forwarded-For` when behind a reverse proxy/load balancer.
// Controlled by env var `TRUST_PROXY`. Set to 'false' to disable.
const trustProxyEnv = (process.env.TRUST_PROXY || 'true').toLowerCase();
if (trustProxyEnv === 'false' || trustProxyEnv === '0') {
  app.set('trust proxy', false);
  console.warn('⚠️ Express `trust proxy` disabled via TRUST_PROXY=false');
} else {
  app.set('trust proxy', true);
  console.warn('ℹ️ Express `trust proxy` enabled');
}
const PORT = process.env.PORT || 3000;

// CORS COMPLETELY DISABLED - allow everything
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

console.warn('🔓 CORS COMPLETELY DISABLED - all origins allowed');

// Helmet disabled for development
// app.use(helmet())

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 15 minutes
  max: 100000, // limit each IP to 100 requests per windowMs
  // Skip rate limiting for auth routes and all GET requests (frontend polling can be frequent).
  // In production you may want to tighten this rule or whitelist specific endpoints instead.
  // Also skip functions and webhook routes to avoid accidental 429 when frontend or external
  // systems call these frequently during development.
  // Note: when limiter is mounted on /api/, req.path is relative (e.g., /functions/... not /api/functions/...)
  skip: (req) => req.path.includes('/auth/') || req.method === 'GET' || req.path.startsWith('/functions') || req.path.includes('/webhooks/'),
});
app.use('/api/', limiter);

// Body parsing middleware - MUST come before routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging: only record requests with status >= 400 to reduce noise
app.use(morgan('combined', {
  skip: (_req, res) => {
    try {
      return res.statusCode < 400;
    } catch {
      return true;
    }
  }
}));

// Debug middleware: attach finish handler and only log warnings/errors (status >= 400)
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.warn(`${req.method} ${req.path} ${res.statusCode}`, {
        body: req.body,
        contentType: req.headers['content-type'],
      });
    }
  });
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from storage directory (for media files)
const storageDir = process.env.NODE_ENV === 'production' 
  ? '/app/storage' 
  : path.resolve(process.cwd(), '..', 'storage');
console.log(`📁 Serving static files from: ${storageDir}`);
app.use('/storage', express.static(storageDir, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // Set appropriate content type for media files
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.3gp': 'video/3gpp',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.pdf': 'application/pdf',
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    // Allow CORS for media files
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/functions', functionsRoutes);
// Generic lightweight table endpoints used by the local API client
app.use('/api', tablesRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  // Include stack trace in development for easier debugging
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({ 
    error: 'Internal server error',
    message: isDev ? (err.message || 'No message') : undefined,
    stack: isDev && (err as any).stack ? (err as any).stack.split('\n').slice(0,10) : undefined,
  });
});

// Create HTTP server and initialize WebSocket
const httpServer = createServer(app);
initWebSocket(httpServer);

// Start server
const SOCKET_PATH = process.env.SOCKET_PATH;
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

// If SOCKET_PATH is set and non-empty, bind to the Unix socket. Otherwise bind to host:port.
if (SOCKET_PATH && SOCKET_PATH.trim() !== '') {
  try {
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
    }
  } catch (err) {
    console.warn('Failed to remove existing socket file', err);
  }

  httpServer.listen(SOCKET_PATH, () => {
    console.warn(`🚀 Server running on socket ${SOCKET_PATH}`);
    console.warn(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.warn(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    console.warn(`🔌 WebSocket enabled`);
  });
} else {
  httpServer.listen(Number(PORT), BIND_HOST, () => {
    console.warn(`🚀 Server running on ${BIND_HOST}:${PORT}`);
    console.warn(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.warn(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    console.warn(`🔌 WebSocket enabled`);
  });
}

export default app;
