import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { MockDockerService } from './mocks/docker.mock.js';
import { MockCloudflareApiService } from './mocks/cloudflare-api.mock.js';
import { MockCaddyProvider } from './mocks/caddy.mock.js';
import { MockCloudflareProvider } from './mocks/cloudflare-provider.mock.js';
import { createTestServer } from '../src/server/test-server.js';
import { seedDatabase } from './helpers/seed.js';
import { setServer } from './server-singleton.js';

export default async function globalSetup() {
  const dbFilePath = join(tmpdir(), `labrador-test-${randomUUID()}.db`);

  const mocks = {
    dockerService: new MockDockerService(),
    cloudflareApiService: new MockCloudflareApiService(),
    caddyProvider: new MockCaddyProvider(),
    cloudflareProvider: new MockCloudflareProvider(),
  };

  const { app, db } = await createTestServer({
    port: 3001,
    dbUrl: `file:${dbFilePath}`,
    mocks,
  });
  await seedDatabase(db);
  setServer(app, dbFilePath);
}
