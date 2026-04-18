import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { DockerService } from './docker.service.js';
import { ProjectService } from './project.service.js';
import { getDatabase } from '../db/index.js';
import { projects } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const COMPOSE_DIR = '/tmp/homelabman';

interface DeploymentListener {
  onProgress: (stage: string, message: string) => void;
  onComplete: (status: 'success' | 'error') => void;
  onError: (error: string) => void;
}

export class DeployService {
  constructor(
    private dockerService: DockerService,
    private projectService: ProjectService,
  ) {}

  /** Inject homelabman labels into compose YAML so containers are trackable */
  private injectLabels(composeContent: string, projectId: string): string {
    const parsed = yaml.load(composeContent) as any;
    if (parsed?.services) {
      for (const serviceName of Object.keys(parsed.services)) {
        if (!parsed.services[serviceName].labels) {
          parsed.services[serviceName].labels = {};
        }
        // Handle both array and object label formats
        if (Array.isArray(parsed.services[serviceName].labels)) {
          parsed.services[serviceName].labels.push(
            `homelabman.managed=true`,
            `homelabman.project_id=${projectId}`,
          );
        } else {
          parsed.services[serviceName].labels['homelabman.managed'] = 'true';
          parsed.services[serviceName].labels['homelabman.project_id'] = projectId;
        }
      }
    }
    return yaml.dump(parsed);
  }

  async deploy(projectId: string, userId: string, listener?: DeploymentListener): Promise<void> {
    const db = getDatabase();
    const project = await this.projectService.getProject(projectId, userId);
    if (!project) throw new Error('Project not found');

    listener?.onProgress('preparing', 'Preparing deployment...');

    // Update status to starting
    await db
      .update(projects)
      .set({ status: 'starting', updatedAt: Date.now() })
      .where(eq(projects.id, projectId));

    try {
      // Inject labels
      listener?.onProgress('labels', 'Injecting management labels...');
      const labeledCompose = this.injectLabels(project.composeContent, projectId);

      // Write compose file
      const projectDir = path.join(COMPOSE_DIR, project.slug);
      await fs.mkdir(projectDir, { recursive: true });
      const composeFile = path.join(projectDir, 'docker-compose.yml');
      await fs.writeFile(composeFile, labeledCompose);

      // Run docker compose up
      listener?.onProgress('deploying', 'Running docker compose up...');
      const result = await this.dockerService.composeUp(composeFile, project.slug);

      if (
        result.stderr &&
        !result.stderr.includes('Started') &&
        !result.stderr.includes('Running') &&
        !result.stderr.includes('Created')
      ) {
        // docker compose often writes progress to stderr, so only treat as error if it looks like one
        listener?.onProgress('deploying', result.stderr);
      }

      // Update status to running
      await db
        .update(projects)
        .set({ status: 'running', deployedAt: Date.now(), updatedAt: Date.now() })
        .where(eq(projects.id, projectId));

      listener?.onProgress('complete', 'Deployment successful');
      listener?.onComplete('success');
    } catch (error: any) {
      await db
        .update(projects)
        .set({ status: 'error', updatedAt: Date.now() })
        .where(eq(projects.id, projectId));

      listener?.onError(error.message);
      listener?.onComplete('error');
      throw error;
    }
  }

  async stop(projectId: string, userId: string): Promise<void> {
    const db = getDatabase();
    const project = await this.projectService.getProject(projectId, userId);
    if (!project) throw new Error('Project not found');

    const projectDir = path.join(COMPOSE_DIR, project.slug);
    const composeFile = path.join(projectDir, 'docker-compose.yml');

    try {
      await this.dockerService.composeDown(composeFile, project.slug);
    } catch {
      // If compose file doesn't exist, try stopping containers by label
    }

    await db
      .update(projects)
      .set({ status: 'stopped', updatedAt: Date.now() })
      .where(eq(projects.id, projectId));
  }

  async restart(projectId: string, userId: string): Promise<void> {
    const db = getDatabase();
    const project = await this.projectService.getProject(projectId, userId);
    if (!project) throw new Error('Project not found');

    const projectDir = path.join(COMPOSE_DIR, project.slug);
    const composeFile = path.join(projectDir, 'docker-compose.yml');

    await this.dockerService.composeRestart(composeFile, project.slug);

    await db
      .update(projects)
      .set({ status: 'running', updatedAt: Date.now() })
      .where(eq(projects.id, projectId));
  }
}
