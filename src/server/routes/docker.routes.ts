import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware.js';
import { DockerService } from '../services/docker.service.js';

export async function dockerRoutes(app: FastifyInstance) {
  const dockerService = (app as any).dockerService as DockerService | undefined;

  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /networks - List all Docker networks
  app.get('/networks', async (_request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }
    const networks = await dockerService.listNetworks();
    return networks;
  });

  // POST /networks - Create a network
  app.post<{ Body: { name: string; driver?: string } }>('/networks', async (request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }
    const { name, driver } = request.body;
    if (!name || typeof name !== 'string') {
      return reply.code(400).send({ error: 'Network name is required' });
    }
    const network = await dockerService.createNetwork(name, driver);
    return { id: network.id, name };
  });

  // DELETE /networks/:id - Remove a network
  app.delete<{ Params: { id: string } }>('/networks/:id', async (request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }
    const { id } = request.params;
    await dockerService.removeNetwork(id);
    return { success: true };
  });

  // GET /images - List all Docker images
  app.get('/images', async (_request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }
    const images = await dockerService.listImages();
    return images;
  });

  // DELETE /images/:id - Remove an image
  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/images/:id',
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: 'Docker is not available' });
      }
      const { id } = request.params;
      const force = request.query.force === 'true';
      await dockerService.removeImage(id, force);
      return { success: true };
    },
  );

  // POST /images/:name/pull - Pull an image
  app.post<{ Params: { name: string } }>('/images/:name/pull', async (request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }
    const { name } = request.params;
    await dockerService.pullImage(name);
    return { success: true, image: name };
  });

  // POST /images/prune - Prune unused images
  app.post('/images/prune', async (_request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }
    const result = await dockerService.pruneImages();
    return result;
  });
}
