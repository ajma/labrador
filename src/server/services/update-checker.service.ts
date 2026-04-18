import { DockerService } from './docker.service.js';
import { getDatabase } from '../db/index.js';
import { containerUpdates, projects } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export class UpdateCheckerService {
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(private dockerService: DockerService) {}

  /** Start periodic checks every 6 hours */
  startPeriodicChecks(): void {
    this.checkInterval = setInterval(() => this.checkAllProjects(), 6 * 60 * 60 * 1000);
    // Run initial check after 1 minute
    setTimeout(() => this.checkAllProjects(), 60000);
  }

  /** Stop periodic checks */
  stopPeriodicChecks(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
  }

  /** Check all managed containers for updates */
  async checkAllProjects(): Promise<void> {
    const db = getDatabase();
    const allProjects = await db.select().from(projects);

    for (const project of allProjects) {
      try {
        await this.checkProjectUpdates(project.id);
      } catch {
        // Continue checking other projects
      }
    }
  }

  /** Check a specific project for container image updates */
  async checkProjectUpdates(projectId: string): Promise<void> {
    const db = getDatabase();

    try {
      const containers = await this.dockerService.listContainers(projectId);

      for (const container of containers) {
        const imageName = container.Image;
        const currentDigest = container.ImageID;

        let updateAvailable = false;
        let latestDigest = currentDigest;

        // Try to check for updates via Docker Hub API
        try {
          const latest = await this.checkImageUpdate(imageName);
          if (latest && latest !== currentDigest) {
            updateAvailable = true;
            latestDigest = latest;
          }
        } catch {
          // Can't check - might be private registry, rate limited, etc.
        }

        // Upsert the update record
        const containerName = container.Names[0]?.replace(/^\//, '') || container.Id.slice(0, 12);
        const existing = await db.select().from(containerUpdates)
          .where(and(
            eq(containerUpdates.projectId, projectId),
            eq(containerUpdates.containerName, containerName),
          ));

        if (existing.length > 0) {
          await db.update(containerUpdates)
            .set({
              currentImage: imageName,
              latestImage: latestDigest,
              updateAvailable,
              checkedAt: Date.now(),
            })
            .where(eq(containerUpdates.id, existing[0].id));
        } else {
          await db.insert(containerUpdates).values({
            projectId,
            containerName,
            currentImage: imageName,
            latestImage: latestDigest,
            updateAvailable,
          });
        }
      }
    } catch {
      // Docker unavailable or project has no containers
    }
  }

  /**
   * Check Docker Hub API for latest image digest.
   * Uses the Docker Hub v2 API with rate-limit awareness.
   */
  private async checkImageUpdate(imageName: string): Promise<string | null> {
    // Parse image name into registry/repo:tag
    let repo = imageName;
    let tag = 'latest';

    if (repo.includes(':')) {
      const parts = repo.split(':');
      repo = parts[0];
      tag = parts[1];
    }

    // Only check Docker Hub images (no registry prefix or docker.io)
    if (repo.includes('/') && repo.split('/')[0].includes('.')) {
      // This is a custom registry, skip
      return null;
    }

    // Add library/ prefix for official images
    if (!repo.includes('/')) {
      repo = `library/${repo}`;
    }

    try {
      // Get auth token
      const tokenRes = await fetch(
        `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`,
      );
      if (!tokenRes.ok) return null;
      const { token } = await tokenRes.json() as { token: string };

      // Get manifest digest
      const manifestRes = await fetch(
        `https://registry-1.docker.io/v2/${repo}/manifests/${tag}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json',
          },
        },
      );
      if (!manifestRes.ok) return null;

      return manifestRes.headers.get('docker-content-digest');
    } catch {
      return null;
    }
  }

  /** Get update info for a specific project */
  async getProjectUpdates(projectId: string) {
    const db = getDatabase();
    return db.select().from(containerUpdates)
      .where(eq(containerUpdates.projectId, projectId));
  }

  /** Trigger a manual update check for a project */
  async triggerCheck(projectId: string): Promise<void> {
    await this.checkProjectUpdates(projectId);
  }
}
