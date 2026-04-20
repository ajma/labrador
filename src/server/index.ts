import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { initDatabase } from './db/index.js';
import { projects } from './db/schema.js';
import { authRoutes } from './routes/auth.routes.js';
import { projectRoutes } from './routes/projects.routes.js';
import { dockerRoutes } from './routes/docker.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { cloudflareRoutes } from './routes/cloudflare.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { DockerService } from './services/docker.service.js';
import { UpdateCheckerService } from './services/update-checker.service.js';
import { StatsService } from './services/stats.service.js';
import { setupWebSocket } from './websocket/stats.handler.js';
import { ExposureProviderRegistry } from './services/exposure/provider-registry.js';
import { ExposureService } from './services/exposure/exposure.service.js';
import { CaddyProvider, CloudflareProvider } from './services/exposure/providers/index.js';
import { CloudflareApiService } from './services/cloudflare-api.service.js';

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

  // Initialize Docker service
  let dockerService: DockerService | null = null;
  try {
    dockerService = new DockerService();
    const dockerAvailable = await dockerService.ping();
    if (dockerAvailable) {
      app.log.info('Docker connection established');

      // Reconcile project statuses on startup
      try {
        const statusMap = await dockerService.reconcileProjectStatuses();
        for (const [projectId, status] of statusMap) {
          await db
            .update(projects)
            .set({ status, updatedAt: Date.now() })
            .where(eq(projects.id, projectId));
        }
        if (statusMap.size > 0) {
          app.log.info(`Reconciled ${statusMap.size} project status(es) from Docker`);
        }
      } catch (reconcileErr) {
        app.log.warn({ err: reconcileErr }, 'Failed to reconcile project statuses');
      }
    } else {
      app.log.warn('Docker is not reachable; Docker features will be unavailable');
      dockerService = null;
    }
  } catch (dockerErr) {
    app.log.warn({ err: dockerErr }, 'Failed to initialize Docker service; starting without Docker');
    dockerService = null;
  }

  // Decorate app with dockerService (may be null if Docker is unavailable)
  app.decorate('dockerService', dockerService);

  // Initialize update checker service if Docker is available
  let updateCheckerService: UpdateCheckerService | null = null;
  if (dockerService) {
    updateCheckerService = new UpdateCheckerService(dockerService);
    updateCheckerService.startPeriodicChecks();
    app.log.info('Update checker service started (checks every 6 hours)');
  }
  app.decorate('updateCheckerService', updateCheckerService);

  // Set up WebSocket handler for real-time updates
  const { broadcast } = setupWebSocket(app);
  app.decorate('wsBroadcast', broadcast);

  // Initialize stats collection service if Docker is available
  let statsService: StatsService | null = null;
  if (dockerService) {
    statsService = new StatsService(dockerService, broadcast);
    statsService.startCollection();
    statsService.startRetention();
    app.log.info('Stats collection service started (collecting every 10s)');
  }
  app.decorate('statsService', statsService);

  // Initialize Cloudflare API service
  const cloudflareApiService = new CloudflareApiService();
  app.decorate('cloudflareApiService', cloudflareApiService);

  // Initialize exposure provider system
  const providerRegistry = new ExposureProviderRegistry();
  providerRegistry.register(new CaddyProvider());
  providerRegistry.register(new CloudflareProvider());
  const exposureService = new ExposureService(providerRegistry);
  app.decorate('exposureService', exposureService);
  app.decorate('providerRegistry', providerRegistry);

  // Health check
  app.get('/health', async () => ({ status: 'ok', docker: dockerService !== null }));

  // Register routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(dockerRoutes, { prefix: '/api/docker' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(cloudflareRoutes, { prefix: '/api/cloudflare' });

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
    statsService?.stopCollection();
    updateCheckerService?.stopPeriodicChecks();
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
