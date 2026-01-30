import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Plugin } from 'vite';

const STORAGE_SECRET = process.env.STORAGE_SECRET || 'livechat-storage-secret-key-2026';

interface TokenData {
  path: string;
  expires: number;
  sig: string;
}

interface UploadData {
  base64Data: string;
  bucket?: string;
  instanceName?: string;
  contactId?: string;
  filename: string;
  mimetype?: string;
}

class TokenManager {
  private readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  generate(filePath: string, expiresIn: number = 3600): string {
    const expires = Date.now() + expiresIn * 1000;
    const data = `${filePath}:${expires}`;
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');

    const tokenData: TokenData = {
      path: filePath,
      expires,
      sig: signature,
    };

    return Buffer.from(JSON.stringify(tokenData)).toString('base64url');
  }

  validate(token: string, requestedPath: string): boolean {
    try {
      const decoded: TokenData = JSON.parse(
        Buffer.from(token, 'base64url').toString()
      );

      if (Date.now() > decoded.expires) return false;
      if (decoded.path !== requestedPath) return false;

      const data = `${decoded.path}:${decoded.expires}`;
      const expectedSig = crypto
        .createHmac('sha256', this.secret)
        .update(data)
        .digest('hex');

      return decoded.sig === expectedSig;
    } catch {
      return false;
    }
  }
}

class StorageManager {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  getStoragePath(uploadData: UploadData): { relativePath: string; dirPath: string } {
    const { bucket, instanceName, contactId, filename } = uploadData;

    if (bucket === 'whatsapp-media' && instanceName) {
      return {
        relativePath: `whatsapp-media/${instanceName}/${filename}`,
        dirPath: path.join(this.baseDir, 'whatsapp-media', instanceName),
      };
    }

    if (contactId) {
      return {
        relativePath: `contacts/${contactId}/${filename}`,
        dirPath: path.join(this.baseDir, 'contacts', contactId),
      };
    }

    const bucketName = bucket || 'uploads';
    return {
      relativePath: `${bucketName}/${filename}`,
      dirPath: path.join(this.baseDir, bucketName),
    };
  }

  saveFile(uploadData: UploadData): string {
    const { base64Data, filename } = uploadData;
    const { relativePath, dirPath } = this.getStoragePath(uploadData);

    fs.mkdirSync(dirPath, { recursive: true });

    const base64String = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;
    const buffer = Buffer.from(base64String, 'base64');

    const filePath = path.join(dirPath, filename);
    fs.writeFileSync(filePath, buffer);

    return `/storage/${relativePath}`;
  }
}

const MIME_TYPES: Record<string, string> = {
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

function setCorsHeaders(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function readRequestBody(req: any): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  return body;
}

export function storagePlugin(): Plugin {
  const tokenManager = new TokenManager(STORAGE_SECRET);
  const storageManager = new StorageManager(path.resolve(__dirname, '..', 'storage'));

  return {
    name: 'vite-plugin-storage',
    configureServer(server) {
      // Upload endpoint
      server.middlewares.use('/api/upload', async (req: any, res: any, next: any) => {
        if (req.method === 'OPTIONS') {
          setCorsHeaders(res);
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          return next();
        }

        try {
          const body = await readRequestBody(req);
          const uploadData: UploadData = JSON.parse(body);

          if (!uploadData.base64Data || !uploadData.filename) {
            setCorsHeaders(res);
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'base64Data and filename are required' }));
            return;
          }

          const publicUrl = storageManager.saveFile(uploadData);
          console.log('[storage-plugin] File saved:', publicUrl);

          setCorsHeaders(res);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, publicUrl }));
        } catch (error: any) {
          console.error('[storage-plugin] Upload error:', error);
          setCorsHeaders(res);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      // Signed URL generation endpoint
      server.middlewares.use('/api/storage/sign', async (req: any, res: any, next: any) => {
        if (req.method === 'OPTIONS') {
          setCorsHeaders(res);
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          return next();
        }

        try {
          const body = await readRequestBody(req);
          const { filePath, expiresIn = 3600 } = JSON.parse(body);

          if (!filePath) {
            setCorsHeaders(res);
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'filePath is required' }));
            return;
          }

          const token = tokenManager.generate(filePath, expiresIn);
          const signedUrl = `/storage${filePath}?token=${token}`;

          setCorsHeaders(res);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ signedUrl }));
        } catch (error: any) {
          setCorsHeaders(res);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      // File serving endpoint
      server.middlewares.use('/storage', (req: any, res: any, next: any) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const filePath = path.join(
          path.resolve(__dirname, '..', 'storage'),
          url.pathname
        );
        const token = url.searchParams.get('token');

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return next();
        }

        // Validate token if provided
        if (token && !tokenManager.validate(token, url.pathname)) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'Invalid or expired token' }));
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}
