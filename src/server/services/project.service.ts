import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { projects } from '../db/schema.js';
import type { CreateProjectInput, UpdateProjectInput } from '../../shared/schemas.js';
import type { Project } from '../../shared/types.js';
import crypto from 'crypto';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class ProjectService {
  async listProjects(userId: string): Promise<Project[]> {
    const db = getDatabase();
    const rows = await db.select().from(projects).where(eq(projects.userId, userId));
    return rows as Project[];
  }

  async getProject(projectId: string, userId: string): Promise<Project | null> {
    const db = getDatabase();
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    return (row as Project) ?? null;
  }

  async createProject(userId: string, data: CreateProjectInput): Promise<Project> {
    const db = getDatabase();
    let slug = generateSlug(data.name);

    // Check if slug already exists, append random suffix if so
    const [existing] = await db.select().from(projects).where(eq(projects.slug, slug));
    if (existing) {
      slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    const [row] = await db
      .insert(projects)
      .values({
        userId,
        name: data.name,
        slug,
        composeContent: data.composeContent,
        logoUrl: data.logoUrl ?? null,
        domainName: data.domainName ?? null,
        exposureEnabled: data.exposureEnabled ?? false,
        exposureProviderId: data.exposureProviderId ?? null,
        exposureConfig: data.exposureConfig ? JSON.stringify(data.exposureConfig) : '{}',
        isInfrastructure: data.isInfrastructure ?? false,
      })
      .returning();

    return row as Project;
  }

  async updateProject(projectId: string, userId: string, data: UpdateProjectInput): Promise<Project> {
    const db = getDatabase();

    // Verify ownership
    const existing = await this.getProject(projectId, userId);
    if (!existing) {
      throw new Error('Project not found');
    }

    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.composeContent !== undefined) updateData.composeContent = data.composeContent;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl ?? null;
    if (data.domainName !== undefined) updateData.domainName = data.domainName ?? null;
    if (data.exposureEnabled !== undefined) updateData.exposureEnabled = data.exposureEnabled;
    if (data.exposureProviderId !== undefined) updateData.exposureProviderId = data.exposureProviderId ?? null;
    if (data.exposureConfig !== undefined) updateData.exposureConfig = JSON.stringify(data.exposureConfig);
    if (data.isInfrastructure !== undefined) updateData.isInfrastructure = data.isInfrastructure;

    const [row] = await db
      .update(projects)
      .set(updateData)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .returning();

    return row as Project;
  }

  async deleteProject(projectId: string, userId: string): Promise<void> {
    const db = getDatabase();

    // Verify ownership
    const existing = await this.getProject(projectId, userId);
    if (!existing) {
      throw new Error('Project not found');
    }

    await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  }

  async updateProjectStatus(projectId: string, status: string): Promise<void> {
    const db = getDatabase();
    await db
      .update(projects)
      .set({ status, updatedAt: Date.now() })
      .where(eq(projects.id, projectId));
  }
}
