import { FastifyInstance } from 'fastify';
import { createProjectSchema, updateProjectSchema } from '../../shared/schemas.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ProjectService } from '../services/project.service.js';
import { ComposeValidatorService } from '../services/compose-validator.service.js';
import { DeployService } from '../services/deploy.service.js';
import { DockerService } from '../services/docker.service.js';

const projectService = new ProjectService();

export async function projectRoutes(app: FastifyInstance) {
  const dockerService = (app as any).dockerService as DockerService | null;
  const wsBroadcast = (app as any).wsBroadcast as
    | ((projectId: string, message: any) => void)
    | undefined;

  // Create DeployService only if Docker is available
  let deployService: DeployService | null = null;
  if (dockerService) {
    deployService = new DeployService(dockerService, projectService);
  }

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

  // POST /:id/deploy - Deploy a project
  app.post<{ Params: { id: string } }>('/:id/deploy', async (request, reply) => {
    const userId = (request.user as any).id;
    const { id } = request.params;

    if (!deployService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }

    try {
      await deployService.deploy(id, userId, {
        onProgress: (stage, message) => {
          wsBroadcast?.(id, { type: 'deploy:progress', projectId: id, stage, message });
        },
        onComplete: (status) => {
          wsBroadcast?.(id, { type: 'deploy:complete', projectId: id, status });
        },
        onError: (error) => {
          wsBroadcast?.(id, { type: 'deploy:error', projectId: id, error });
        },
      });
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // POST /:id/stop - Stop a project
  app.post<{ Params: { id: string } }>('/:id/stop', async (request, reply) => {
    const userId = (request.user as any).id;
    const { id } = request.params;

    if (!deployService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }

    try {
      await deployService.stop(id, userId);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // POST /:id/restart - Restart a project
  app.post<{ Params: { id: string } }>('/:id/restart', async (request, reply) => {
    const userId = (request.user as any).id;
    const { id } = request.params;

    if (!deployService) {
      return reply.code(503).send({ error: 'Docker is not available' });
    }

    try {
      await deployService.restart(id, userId);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // GET /:id/logs - Get project logs
  app.get<{ Params: { id: string }; Querystring: { tail?: string } }>(
    '/:id/logs',
    async (request, reply) => {
      const userId = (request.user as any).id;
      const { id } = request.params;
      const { tail } = request.query;

      const project = await projectService.getProject(id, userId);
      if (!project) {
        return reply.code(404).send({ error: 'Not found' });
      }

      if (!dockerService) {
        return { logs: [] };
      }

      const containers = await dockerService.listContainers(id);
      const logs: Array<{ container: string; output: string }> = [];

      for (const container of containers) {
        const output = await dockerService.getContainerLogs(
          container.Id,
          parseInt(tail || '100'),
        );
        logs.push({
          container: container.Names[0]?.replace(/^\//, '') || container.Id,
          output,
        });
      }

      return { logs };
    },
  );

  // POST /compose/validate - Validate compose YAML
  app.post('/compose/validate', async (request) => {
    const { content } = request.body as { content: string };
    if (!content || typeof content !== 'string') {
      return { valid: false, errors: [{ message: 'Content is required' }], warnings: [] };
    }
    if (content.length > 102400) {
      return { valid: false, errors: [{ message: 'Content exceeds maximum size (100KB)' }], warnings: [] };
    }
    const validator = new ComposeValidatorService();
    return validator.validate(content);
  });
}
