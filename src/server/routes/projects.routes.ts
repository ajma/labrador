import { FastifyInstance } from 'fastify';
import { createProjectSchema, updateProjectSchema, reorderProjectsSchema } from '../../shared/schemas.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ProjectService } from '../services/project.service.js';
import { ComposeValidatorService } from '../services/compose-validator.service.js';
import { DeployService } from '../services/deploy.service.js';
import { AdoptService } from '../services/adopt.service.js';
import { DockerService } from '../services/docker.service.js';
import type { ExposureService } from '../services/exposure/exposure.service.js';
import type { UpdateCheckerService } from '../services/update-checker.service.js';
import type { StatsService } from '../services/stats.service.js';
import type { ExposureProviderRegistry } from '../services/exposure/provider-registry.js';
import fs from 'fs/promises';
import path from 'path';
import type { ProjectTemplateSummary, ProjectTemplate } from '../../shared/types.js';

const projectService = new ProjectService();

/** Parse a range string like '1h', '6h', '24h', '7d', '30d' into milliseconds */
function parseRange(range: string): number {
  const match = range.match(/^(\d+)(h|d)$/);
  if (!match) return 24 * 60 * 60 * 1000; // default 24h
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export async function projectRoutes(app: FastifyInstance) {
  const dockerService = (app as any).dockerService as DockerService | null;
  const exposureService = (app as any).exposureService as ExposureService | undefined;
  const updateCheckerService = (app as any).updateCheckerService as UpdateCheckerService | undefined;
  const statsService = (app as any).statsService as StatsService | undefined;
  const wsBroadcast = (app as any).wsBroadcast as
    | ((projectId: string, message: any) => void)
    | undefined;

  // Create DeployService only if Docker is available
  let deployService: DeployService | null = null;
  if (dockerService) {
    deployService = new DeployService(dockerService, projectService);
    if (exposureService) {
      deployService.setExposureService(exposureService);
    }
  }

  let adoptService: AdoptService | null = null;
  if (dockerService) {
    adoptService = new AdoptService(dockerService);
  }

  // All project routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /adoptable — list compose stacks not managed by labrador
  app.get('/adoptable', async (request, reply) => {
    if (!adoptService) return reply.code(503).send({ error: 'Docker not available' });
    const userId = (request.user as any).id;
    return adoptService.listAdoptable(userId);
  });

  // GET /detect-provider-stack — find an unmanaged stack belonging to a known exposure provider
  app.get('/detect-provider-stack', async (request) => {
    if (!adoptService) return { detected: false };
    const userId = (request.user as any).id;
    const registry = (app as any).providerRegistry as ExposureProviderRegistry;
    const providers = registry?.getAll() ?? [];
    return adoptService.findProviderStack(providers, userId);
  });

  // POST /adopt — adopt selected stacks into labrador projects
  app.post<{ Body: { stackNames: string[]; isInfrastructure?: boolean } }>('/adopt', async (request, reply) => {
    if (!adoptService) return reply.code(503).send({ error: 'Docker not available' });
    const { stackNames, isInfrastructure } = request.body;
    if (!Array.isArray(stackNames) || stackNames.length === 0) {
      return reply.code(400).send({ error: 'stackNames must be a non-empty array' });
    }
    const userId = (request.user as any).id;
    return adoptService.adoptStacks(stackNames, userId, { isInfrastructure });
  });

  const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

  // GET /templates - list all templates
  app.get('/templates', async (_request, reply) => {
    try {
      const raw = await fs.readFile(path.join(TEMPLATES_DIR, 'manifest.json'), 'utf-8');
      return JSON.parse(raw) as ProjectTemplateSummary[];
    } catch {
      return reply.code(500).send({ error: 'Failed to load templates' });
    }
  });

  // GET /templates/:id - get single template with compose content
  app.get<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    try {
      const raw = await fs.readFile(path.join(TEMPLATES_DIR, 'manifest.json'), 'utf-8');
      const manifest = JSON.parse(raw) as ProjectTemplateSummary[];
      const entry = manifest.find((t) => t.id === request.params.id);
      if (!entry) {
        return reply.code(404).send({ error: 'Template not found' });
      }
      const composeContent = await fs.readFile(
        path.join(TEMPLATES_DIR, `${entry.id}.yml`),
        'utf-8',
      );
      return { ...entry, composeContent } as ProjectTemplate;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return reply.code(500).send({ error: 'Template file missing' });
      }
      return reply.code(500).send({ error: 'Failed to load template' });
    }
  });

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

  // PUT /reorder — must be registered BEFORE PUT /:id
  app.put('/reorder', async (request, reply) => {
    const parsed = reorderProjectsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const userId = (request.user as any).id;
    await projectService.reorderProjects(userId, parsed.data.updates);
    return reply.code(204).send();
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
    const { id } = request.params;

    try {
      const project = await projectService.getProject(id, userId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      // Stop and clean up Docker containers if project is running
      if (deployService && (project.status === 'running' || project.status === 'starting')) {
        try {
          await deployService.stop(id, userId);
        } catch (err) {
          // Continue with deletion even if stop fails
          console.error('Failed to stop project during deletion:', err);
        }
      }

      // Clean up compose file directory
      const projectDir = path.join('/tmp/labrador', project.slug);
      try {
        await fs.rm(projectDir, { recursive: true, force: true });
      } catch (err) {
        // Continue with deletion even if directory cleanup fails
        console.error('Failed to remove project directory:', err);
      }

      // Delete from database
      await projectService.deleteProject(id, userId);

      return reply.code(204).send();
    } catch (err: any) {
      console.error('Delete project error:', err);
      return reply.code(500).send({ error: err.message || 'Failed to delete project' });
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

  // GET /:id/exposure-status - Get exposure route status for a project
  app.get<{ Params: { id: string } }>('/:id/exposure-status', async (request, reply) => {
    const userId = (request.user as any).id;
    const { id } = request.params;

    const project = await projectService.getProject(id, userId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    if (!exposureService) {
      return { active: false, domain: '', message: 'Exposure service not available' };
    }

    try {
      const status = await exposureService.getProjectExposureStatus(id);
      return status || { active: false, domain: '', message: 'Exposure not configured' };
    } catch (error: any) {
      return { active: false, domain: '', message: error.message };
    }
  });

  // GET /:id/updates - Get update info for a project
  app.get<{ Params: { id: string } }>('/:id/updates', async (request, reply) => {
    const userId = (request.user as any).id;
    const { id } = request.params;

    const project = await projectService.getProject(id, userId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    if (!updateCheckerService) {
      return [];
    }

    return updateCheckerService.getProjectUpdates(id);
  });

  // POST /:id/updates/check - Trigger manual update check
  app.post<{ Params: { id: string } }>('/:id/updates/check', async (request, reply) => {
    const userId = (request.user as any).id;
    const { id } = request.params;

    const project = await projectService.getProject(id, userId);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    if (!updateCheckerService) {
      return reply.code(503).send({ error: 'Update checker is not available' });
    }

    await updateCheckerService.triggerCheck(id);
    return updateCheckerService.getProjectUpdates(id);
  });

  // GET /:id/stats - Get historical stats for a project
  app.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    '/:id/stats',
    async (request, reply) => {
      const userId = (request.user as any).id;
      const { id } = request.params;
      const range = request.query.range || '24h';

      const project = await projectService.getProject(id, userId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      if (!statsService) {
        return [];
      }

      const rangeMs = parseRange(range);
      return statsService.getProjectStats(id, rangeMs);
    },
  );

  // GET /:id/uptime - Get uptime percentage for a project
  app.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    '/:id/uptime',
    async (request, reply) => {
      const userId = (request.user as any).id;
      const { id } = request.params;
      const range = request.query.range || '24h';

      const project = await projectService.getProject(id, userId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      if (!statsService) {
        return { uptime: 0 };
      }

      const rangeMs = parseRange(range);
      const uptime = await statsService.getProjectUptime(id, rangeMs);
      return { uptime };
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
