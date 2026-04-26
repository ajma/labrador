import { eq, and } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { projects, containerStats, containerUpdates } from "../db/schema.js";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../../shared/schemas.js";
import type { Project } from "../../shared/types.js";
import type { ConfigFile } from "../../shared/types.js";
import { ConfigFileService } from "./config-file.service.js";
import crypto from "crypto";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const PROJECTS_DIR = process.env.PROJECTS_DIR ?? "/data/projects";

export class ProjectService {
  private configFileService = new ConfigFileService(PROJECTS_DIR);
  async listProjects(userId: string): Promise<Project[]> {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId));
    return rows as Project[];
  }

  async getProject(
    projectId: string,
    userId: string,
  ): Promise<(Project & { configFiles: ConfigFile[] }) | null> {
    const db = getDatabase();
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!row) return null;
    const configFiles = await this.configFileService.readConfigFiles(row.slug);
    return { ...(row as Project), configFiles };
  }

  async createProject(
    userId: string,
    data: CreateProjectInput,
  ): Promise<Project> {
    const db = getDatabase();
    let slug = generateSlug(data.name);

    // Check if slug already exists, append random suffix if so
    const [existing] = await db
      .select()
      .from(projects)
      .where(eq(projects.slug, slug));
    if (existing) {
      slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
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
        exposureConfig: data.exposureConfig
          ? JSON.stringify(data.exposureConfig)
          : "{}",
        isInfrastructure: data.isInfrastructure ?? false,
        groupId: data.groupId ?? null,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();

    if (data.configFiles && data.configFiles.length > 0) {
      await this.configFileService.writeConfigFiles(slug, data.configFiles);
    }

    return row as Project;
  }

  async updateProject(
    projectId: string,
    userId: string,
    data: UpdateProjectInput,
  ): Promise<Project> {
    const db = getDatabase();

    // Verify ownership
    const existing = await this.getProject(projectId, userId);
    if (!existing) {
      throw new Error("Project not found");
    }

    if (data.configFiles !== undefined) {
      await this.configFileService.syncConfigFiles(
        existing.slug,
        data.configFiles,
      );
    }

    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.composeContent !== undefined)
      updateData.composeContent = data.composeContent;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl ?? null;
    if (data.domainName !== undefined)
      updateData.domainName = data.domainName ?? null;
    if (data.exposureEnabled !== undefined)
      updateData.exposureEnabled = data.exposureEnabled;
    if (data.exposureProviderId !== undefined)
      updateData.exposureProviderId = data.exposureProviderId ?? null;
    if (data.exposureConfig !== undefined)
      updateData.exposureConfig = JSON.stringify(data.exposureConfig);
    if (data.isInfrastructure !== undefined)
      updateData.isInfrastructure = data.isInfrastructure;
    if (data.groupId !== undefined) updateData.groupId = data.groupId ?? null;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

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
      throw new Error("Project not found");
    }

    // Delete related records first (foreign key constraints)
    await db
      .delete(containerStats)
      .where(eq(containerStats.projectId, projectId));
    await db
      .delete(containerUpdates)
      .where(eq(containerUpdates.projectId, projectId));

    // Now delete the project
    await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  }

  async reorderProjects(
    userId: string,
    updates: { id: string; groupId: string | null; sortOrder: number }[],
  ): Promise<void> {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      for (const u of updates) {
        await tx
          .update(projects)
          .set({
            groupId: u.groupId,
            sortOrder: u.sortOrder,
            updatedAt: Date.now(),
          })
          .where(and(eq(projects.id, u.id), eq(projects.userId, userId)));
      }
    });
  }

  async updateProjectStatus(projectId: string, status: string): Promise<void> {
    const db = getDatabase();
    await db
      .update(projects)
      .set({ status, updatedAt: Date.now() })
      .where(eq(projects.id, projectId));
  }
}
