import { FastifyInstance } from 'fastify';
import { createProjectSchema, updateProjectSchema } from '../../shared/schemas.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ProjectService } from '../services/project.service.js';

const projectService = new ProjectService();

export async function projectRoutes(app: FastifyInstance) {
  // All project routes require authentication
  app.addHook('preHandler', authenticate);

  // GET / - List all projects for current user
  app.get('/', async (request) => {
    const userId = (request.user as any).id;
    return projectService.listProjects(userId);
  });

  // GET /:id - Get a single project
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request.user as any).id;
    const project = await projectService.getProject(request.params.id, userId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    return project;
  });

  // POST / - Create a project
  app.post('/', async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const userId = (request.user as any).id;
    const project = await projectService.createProject(userId, parsed.data);
    return reply.code(201).send(project);
  });

  // PUT /:id - Update a project
  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const userId = (request.user as any).id;
    try {
      const project = await projectService.updateProject(request.params.id, userId, parsed.data);
      return project;
    } catch {
      return reply.code(404).send({ error: 'Project not found' });
    }
  });

  // DELETE /:id - Delete a project
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request.user as any).id;
    try {
      await projectService.deleteProject(request.params.id, userId);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: 'Project not found' });
    }
  });

  // POST /:id/deploy - Deploy a project (stub - Phase 6)
  app.post<{ Params: { id: string } }>('/:id/deploy', async (request, reply) => {
    const userId = (request.user as any).id;
    const project = await projectService.getProject(request.params.id, userId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    await projectService.updateProjectStatus(project.id, 'starting');
    return { status: 'starting' };
  });

  // POST /:id/stop - Stop a project
  app.post<{ Params: { id: string } }>('/:id/stop', async (request, reply) => {
    const userId = (request.user as any).id;
    const project = await projectService.getProject(request.params.id, userId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    await projectService.updateProjectStatus(project.id, 'stopped');
    return { status: 'stopped' };
  });

  // POST /:id/restart - Restart a project
  app.post<{ Params: { id: string } }>('/:id/restart', async (request, reply) => {
    const userId = (request.user as any).id;
    const project = await projectService.getProject(request.params.id, userId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    await projectService.updateProjectStatus(project.id, 'running');
    return { status: 'running' };
  });

  // GET /:id/logs - Get project logs (stub)
  app.get<{ Params: { id: string } }>('/:id/logs', async (request, reply) => {
    const userId = (request.user as any).id;
    const project = await projectService.getProject(request.params.id, userId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    return [];
  });

  // POST /compose/validate - Validate compose YAML (stub)
  app.post('/compose/validate', async () => {
    return { valid: true };
  });
}
