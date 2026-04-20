import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { initDatabase } from './db/index.js';
import { authRoutes } from './routes/auth.routes.js';
import { projectRoutes } from './routes/projects.routes.js';
import { dockerRoutes } from './routes/docker.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { cloudflareRoutes } from './routes/cloudflare.routes.js';
import { testRoutes } from './routes/test.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { setupWebSocket } from './websocket/stats.handler.js';
import { ExposureProviderRegistry } from './services/exposure/provider-registry.js';
import { ExposureService } from './services/exposure/exposure.service.js';
import type { MockDockerService } from '../../e2e/mocks/docker.mock.js';
import type { MockCloudflareApiService } from '../../e2e/mocks/cloudflare-api.mock.js';
import type { MockCaddyProvider } from '../../e2e/mocks/caddy.mock.js';
import type { MockCloudflareProvider } from '../../e2e/mocks/cloudflare-provider.mock.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TestServerMocks {
  dockerService: MockDockerService;
  cloudflareApiService: MockCloudflareApiService;
  caddyProvider: MockCaddyProvider;
  cloudflareProvider: MockCloudflareProvider;
}

export async function createTestServer(opts: {
  port?: number;
  dbUrl: string;
  mocks: TestServerMocks;
}) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('createTestServer cannot be used in production');
  }

  const { port = 3001, dbUrl, mocks } = opts;

  process.env.NODE_ENV = 'test';

  const db = initDatabase(dbUrl);
  await migrate(db as any, { migrationsFolder: join(__dirname, 'db/migrations') });

  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: 'test-secret-do-not-use-in-production',
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(websocket);

  app.decorate('db', db);
  app.decorate('dockerService', mocks.dockerService);
  app.decorate('cloudflareApiService', mocks.cloudflareApiService);
  app.decorate('updateCheckerService', null);
  app.decorate('statsService', null);

  const { broadcast } = setupWebSocket(app);
  app.decorate('wsBroadcast', broadcast);

  const providerRegistry = new ExposureProviderRegistry();
  providerRegistry.register(mocks.cloudflareProvider);
  providerRegistry.register(mocks.caddyProvider);
  const exposureService = new ExposureService(providerRegistry);
  app.decorate('exposureService', exposureService);
  app.decorate('providerRegistry', providerRegistry);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(dockerRoutes, { prefix: '/api/docker' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(cloudflareRoutes, { prefix: '/api/cloudflare' });
  await app.register(testRoutes, { prefix: '/api/test' });

  app.setErrorHandler(errorHandler);

  await app.listen({ port, host: '127.0.0.1' });
  return { app, db };
}
