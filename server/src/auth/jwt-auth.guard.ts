import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import * as jwt from 'jsonwebtoken';

const GLOBAL_API_KEY = process.env.GLOBAL_API_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // Check for Global API Key first
    const apiKey = request.headers['x-api-key'] || request.query.apikey;
    if (apiKey && GLOBAL_API_KEY && apiKey === GLOBAL_API_KEY) {
      request.user = {
        userId: 'api-key-user',
        email: 'api@system.local',
        role: 'admin',
      };
      return true;
    }
    
    // Try JWT validation
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const payload = jwt.verify(token, JWT_SECRET) as any;
        request.user = payload;
        return true;
      } catch (error) {
        throw new UnauthorizedException('Invalid or expired token');
      }
    }
    
    throw new UnauthorizedException('No token provided');
  }
}
