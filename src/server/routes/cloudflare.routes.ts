import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware.js';

const CF_API = 'https://api.cloudflare.com/client/v4';

export async function cloudflareRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // List accounts for a given API token
  app.post<{ Body: { apiToken: string } }>('/accounts', async (request, reply) => {
    const { apiToken } = request.body;
    if (!apiToken) return reply.code(400).send({ error: 'apiToken required' });

    const res = await fetch(`${CF_API}/accounts`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const data = await res.json();
    if (!data.success) {
      return reply.code(400).send({ error: data.errors?.[0]?.message ?? 'Failed to fetch accounts' });
    }
    return (data.result ?? []).map((a: any) => ({ id: a.id, name: a.name }));
  });

  // List tunnels for an account
  app.post<{ Body: { apiToken: string; accountId: string } }>('/tunnels', async (request, reply) => {
    const { apiToken, accountId } = request.body;
    if (!apiToken || !accountId) return reply.code(400).send({ error: 'apiToken and accountId required' });

    const res = await fetch(`${CF_API}/accounts/${accountId}/cfd_tunnel?per_page=50`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const data = await res.json();
    if (!data.success) {
      return reply.code(400).send({ error: data.errors?.[0]?.message ?? 'Failed to fetch tunnels' });
    }
    return (data.result ?? []).map((t: any) => ({ id: t.id, name: t.name }));
  });

  // Create a new tunnel
  app.post<{ Body: { apiToken: string; accountId: string; tunnelName: string } }>(
    '/tunnels/create',
    async (request, reply) => {
      const { apiToken, accountId, tunnelName } = request.body;
      if (!apiToken || !accountId || !tunnelName) {
        return reply.code(400).send({ error: 'apiToken, accountId, and tunnelName required' });
      }

      const secret = new Uint8Array(32);
      crypto.getRandomValues(secret);
      const tunnelSecret = btoa(String.fromCharCode(...secret));

      const res = await fetch(`${CF_API}/accounts/${accountId}/cfd_tunnel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tunnelName, tunnel_secret: tunnelSecret }),
      });
      const data = await res.json();
      if (!data.success) {
        return reply.code(400).send({ error: data.errors?.[0]?.message ?? 'Failed to create tunnel' });
      }
      return { tunnelId: data.result.id, tunnelToken: data.result.token };
    },
  );

  // Fetch token for an existing tunnel
  app.post<{ Body: { apiToken: string; accountId: string; tunnelId: string } }>(
    '/tunnels/token',
    async (request, reply) => {
      const { apiToken, accountId, tunnelId } = request.body;
      if (!apiToken || !accountId || !tunnelId) {
        return reply.code(400).send({ error: 'apiToken, accountId, and tunnelId required' });
      }

      const res = await fetch(`${CF_API}/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      const data = await res.json();
      if (!data.success) {
        return reply.code(400).send({ error: data.errors?.[0]?.message ?? 'Failed to fetch tunnel token' });
      }
      return { tunnelToken: data.result as string };
    },
  );
}
