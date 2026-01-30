import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-this';
const JWT_EXPIRES_IN: string | number = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN: string | number = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const GLOBAL_API_KEY = process.env.GLOBAL_API_KEY || '';

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'admin' | 'supervisor' | 'agent';
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyToken(token: string, isRefresh = false): TokenPayload | null {
  try {
    const secret = isRefresh ? JWT_REFRESH_SECRET : JWT_SECRET;
    const decoded = jwt.verify(token, secret) as TokenPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Check for Global API Key first (via X-API-Key header or apikey query param)
    const apiKey = req.headers['x-api-key'] as string || req.query.apikey as string;
    
    if (apiKey && GLOBAL_API_KEY && apiKey === GLOBAL_API_KEY) {
      // Global API key valid - create synthetic admin user
      req.user = {
        userId: 'api-key-user',
        email: 'api@system.local',
        role: 'admin',
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

export function requireRole(roles: Array<'admin' | 'supervisor' | 'agent'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}
