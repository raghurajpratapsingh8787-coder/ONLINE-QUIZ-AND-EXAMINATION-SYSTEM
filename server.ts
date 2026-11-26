import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { env } from './backend/config/env';
import { csrfProtection, verifyAccessToken } from './backend/middleware/auth';
import { apiRateLimiter, centralizedErrorHandler, noSqlSanitizer } from './backend/middleware/security';
import { store } from './backend/repositories/store';
import { buildSeedState } from './backend/seed/seedData';
import { registerSocketIO } from './backend/services/realtime';

import authRoutes from './backend/routes/auth';
import userRoutes from './backend/routes/users';
import questionRoutes from './backend/routes/questions';
import examRoutes from './backend/routes/exams';
import attemptRoutes from './backend/routes/attempts';
import resultRoutes from './backend/routes/results';
import notificationRoutes from './backend/routes/notifications';
import analyticsRoutes from './backend/routes/analytics';
import platformRoutes from './backend/routes/platform';

async function startServer() {
  await store.init();

  // Auto-seed realistic university dataset on first boot if database is empty
  if (store.getUsers().length === 0) {
    const seed = await buildSeedState();
    await store.resetAndSeed(seed);
    console.log('[Boot] Initialized ExamVault with university seed data.');
  }

  const app = express();
  app.set('trust proxy', 1);

  const server = http.createServer(app);

  // Explicit CORS allowlist (never wildcard on authenticated routes)
  const allowedOriginSet = new Set([
    ...env.allowedOrigins,
    env.appUrl,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  const isOriginAllowed = (origin: string | undefined, requestHost?: string): boolean => {
    if (!origin) return true;
    if (allowedOriginSet.has(origin)) return true;
    if (requestHost) {
      try {
        const parsed = new URL(origin);
        if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.host === requestHost) {
          return true;
        }
      } catch {
        return false;
      }
    }
    return false;
  };

  const corsDelegate: cors.CorsOptionsDelegate<express.Request> = (req, callback) => {
    const origin = req.headers.origin;
    const requestHost = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
    if (isOriginAllowed(origin, requestHost)) {
      callback(null, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      });
      return;
    }
    callback(new Error('Origin not permitted by CORS policy'));
  };

  // Socket.IO for live real-time notifications
  const io = new SocketIOServer(server, {
    path: '/socket.io',
    cors: {
      origin(origin, callback) {
        if (isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not permitted by CORS policy'));
      },
      credentials: true,
    },
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      const requestHost = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
      if (isOriginAllowed(origin, requestHost)) {
        callback(null, true);
        return;
      }
      callback('Origin not permitted by CORS policy', false);
    },
  });

  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || '';
    const cookiePair = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('ev_access_token='));
    const cookieToken = cookiePair ? decodeURIComponent(cookiePair.slice('ev_access_token='.length)) : undefined;
    const token = (socket.handshake.auth?.token as string | undefined) || cookieToken;

    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      next(new Error('Invalid token'));
      return;
    }
    const user = store.findUserById(payload.sub);
    if (!user || user.accountStatus !== 'active' || user.tokenVersion !== payload.tv) {
      next(new Error('Session invalidated or account inactive'));
      return;
    }
    socket.data.userId = user.id;
    socket.data.role = user.role;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const role = socket.data.role as string;
    socket.join(`user:${userId}`);
    socket.join(`role:${role}`);
  });

  registerSocketIO(io);

  // Security headers (frameguard disabled so AI Studio iframe preview works seamlessly)
  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(cors(corsDelegate));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(noSqlSanitizer);

  // Health & public non-sensitive platform metadata
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      dbMode: store.mode,
      serverTime: new Date().toISOString(),
    });
  });

  // Protect API endpoints with rate limiting and CSRF validation
  app.use('/api', apiRateLimiter, csrfProtection);

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/exams', examRoutes);
  app.use('/api/attempts', attemptRoutes);
  app.use('/api/results', resultRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/platform', platformRoutes);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use(centralizedErrorHandler);

  // Mount Vite middleware in development, or serve built dist/ in production
  if (!env.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`[ExamVault] Server running on http://localhost:${env.port} (DB: ${store.mode})`);
  });
}

startServer().catch((err) => {
  console.error('[ExamVault] Fatal startup error:', err);
  process.exit(1);
});
