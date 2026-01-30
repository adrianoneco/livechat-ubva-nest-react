import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from parent directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Trust proxy
  const trustProxyEnv = (process.env.TRUST_PROXY || 'true').toLowerCase();
  if (trustProxyEnv === 'false' || trustProxyEnv === '0') {
    console.warn('⚠️ Express `trust proxy` disabled via TRUST_PROXY=false');
  } else {
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    console.warn('ℹ️ Express `trust proxy` enabled');
  }

  // CORS - completely open for development
  app.enableCors({
    origin: true,
    methods: '*',
    credentials: true,
    allowedHeaders: '*',
    exposedHeaders: '*',
  });
  console.warn('🔓 CORS COMPLETELY DISABLED - all origins allowed');

  // Body parser
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: false,
    forbidNonWhitelisted: false,
  }));

  // Serve static files from storage directory
  const storageDir = process.env.NODE_ENV === 'production'
    ? '/app/storage'
    : path.resolve(process.cwd(), '..', 'storage');
  console.log(`📁 Serving static files from: ${storageDir}`);
  
  if (fs.existsSync(storageDir)) {
    app.use('/storage', express.static(storageDir, {
      maxAge: '1d',
      setHeaders: (res, filePath) => {
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
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    }));
  }

  // Global prefix for API
  app.setGlobalPrefix('api', {
    exclude: ['health', 'storage/(.*)'],
  });

  const PORT = process.env.PORT || 3000;
  const SOCKET_PATH = process.env.SOCKET_PATH;
  const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

  if (SOCKET_PATH && SOCKET_PATH.trim() !== '') {
    try {
      if (fs.existsSync(SOCKET_PATH)) {
        fs.unlinkSync(SOCKET_PATH);
      }
    } catch (err) {
      console.warn('Failed to remove existing socket file', err);
    }
    await app.listen(SOCKET_PATH);
    console.warn(`🚀 Server running on socket ${SOCKET_PATH}`);
  } else {
    await app.listen(PORT, BIND_HOST);
    console.warn(`🚀 Server running on ${BIND_HOST}:${PORT}`);
  }

  console.warn(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.warn(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.warn(`🔌 WebSocket enabled`);
}

bootstrap();
