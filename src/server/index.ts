import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './db/index.js';
import { authRoutes } from './routes/auth.routes.js';
import { projectRoutes } from './routes/projects.routes.js';
import { dockerRoutes } from './routes/docker.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });
  await app.register(websocket);

  // Serve frontend in production
  if (process.env.NODE_ENV === 'production') {
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '../web'),
      prefix: '/',
    });
  }

  // Initialize database
  const db = initDatabase();

  // Decorate app with db
  app.decorate('db', db);

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // Rate limiting for auth routes
  await app.register(import('@fastify/rate-limit'), {
    max: 10,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (request) => request.ip,
  });

  // Register routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(dockerRoutes, { prefix: '/api/docker' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  // Error handler
  app.setErrorHandler(errorHandler);

  // SPA fallback for frontend routing (production only)
  if (process.env.NODE_ENV === 'production') {
    app.setNotFoundHandler(async (request, reply) => {
      if (!request.url.startsWith('/api/') && !request.url.startsWith('/ws')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
