import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware.js';

export async function cloudflareRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  const svc = (app as any).cloudflareApiService;

  app.post<{ Body: { apiToken: string } }>('/accounts', async (request, reply) => {
    const { apiToken } = request.body;
    if (!apiToken) return reply.code(400).send({ error: 'apiToken required' });
    try {
      return await svc.listAccounts(apiToken);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post<{ Body: { apiToken: string; accountId: string } }>('/tunnels', async (request, reply) => {
    const { apiToken, accountId } = request.body;
    if (!apiToken || !accountId) return reply.code(400).send({ error: 'apiToken and accountId required' });
    try {
      return await svc.listTunnels(apiToken, accountId);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post<{ Body: { apiToken: string; accountId: string; tunnelName: string } }>(
    '/tunnels/create',
    async (request, reply) => {
      const { apiToken, accountId, tunnelName } = request.body;
      if (!apiToken || !accountId || !tunnelName) {
        return reply.code(400).send({ error: 'apiToken, accountId, and tunnelName required' });
      }
      try {
        return await svc.createTunnel(apiToken, accountId, tunnelName);
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

  app.post<{ Body: { apiToken: string; accountId: string; tunnelId: string } }>(
    '/tunnels/token',
    async (request, reply) => {
      const { apiToken, accountId, tunnelId } = request.body;
      if (!apiToken || !accountId || !tunnelId) {
        return reply.code(400).send({ error: 'apiToken, accountId, and tunnelId required' });
      }
      try {
        return await svc.getTunnelToken(apiToken, accountId, tunnelId);
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );
}
