import { FastifyInstance } from 'fastify';
import { clearDatabase, seedDatabase } from '../../../e2e/helpers/seed.js';
import { getDatabase } from '../db/index.js';
import { users } from '../db/schema.js';
import type { MockDockerService } from '../../../e2e/mocks/docker.mock.js';
import type { MockCloudflareApiService } from '../../../e2e/mocks/cloudflare-api.mock.js';

export async function testRoutes(app: FastifyInstance) {
  const mockDocker = (app as any).dockerService as MockDockerService;
  const mockCloudflare = (app as any).cloudflareApiService as MockCloudflareApiService;

  // Reset DB and mock state.
  // Pass ?seed=false to skip seeding (leaves DB empty for onboarding tests).
  app.post<{ Querystring: { seed?: string } }>('/reset', async (request) => {
    const seed = request.query.seed !== 'false';
    const db = getDatabase();
    await clearDatabase(db);
    if (seed) await seedDatabase(db);
    mockDocker.reset();
    mockCloudflare.reset();
    return { ok: true };
  });

  // GET /session — sets auth cookie for the seeded admin user and redirects to /.
  // Tests call page.goto('/api/test/session') so the browser natively stores the cookie.
  app.get('/session', async (_request, reply) => {
    const db = getDatabase();
    const [user] = await db.select().from(users).limit(1);
    if (!user) return reply.code(404).send({ error: 'No user in DB' });
    const token = app.jwt.sign({ id: user.id, username: user.username });
    reply.setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax' });
    return reply.redirect('/');
  });

  app.post<{ Body: { containers?: any[]; images?: any[]; networks?: any[] } }>(
    '/mock/docker',
    async (request) => {
      if (request.body.containers !== undefined) mockDocker.containers = request.body.containers;
      if (request.body.images !== undefined) mockDocker.images = request.body.images;
      if (request.body.networks !== undefined) mockDocker.networks = request.body.networks;
      return { ok: true };
    },
  );

  app.post<{
    Body: {
      accounts?: { id: string; name: string }[];
      tunnels?: { id: string; name: string }[];
      nextTunnel?: { tunnelId: string; tunnelToken: string };
    };
  }>('/mock/cloudflare', async (request) => {
    if (request.body.accounts !== undefined) mockCloudflare.accounts = request.body.accounts;
    if (request.body.tunnels !== undefined) mockCloudflare.tunnels = request.body.tunnels;
    if (request.body.nextTunnel !== undefined) mockCloudflare.nextTunnel = request.body.nextTunnel;
    return { ok: true };
  });
}
