import fs from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { projects } from "../db/schema.js";
import type { DockerService } from "./docker.service.js";
import type Dockerode from "dockerode";
import type { ExposureProvider } from "@shared/exposure/provider.interface.js";

const COMPOSE_LABEL = "com.docker.compose.project";
const COMPOSE_WORKDIR_LABEL = "com.docker.compose.project.working_dir";
const LABEL_LOGO = "labrador.logo_url";

export interface AdoptableStack {
  stackName: string;
  workingDir: string;
  containerCount: number;
}

export interface AdoptResult {
  adopted: string[];
  failed: { stackName: string; reason: string }[];
}

export class AdoptService {
  constructor(private dockerService: DockerService) {}

  async listAdoptable(userId: string): Promise<AdoptableStack[]> {
    const containers = await this.dockerService.listComposeContainers();
    const stackMap = new Map<string, { workingDir: string; count: number }>();

    for (const container of containers) {
      const stackName = container.Labels?.[COMPOSE_LABEL];
      if (!stackName) continue;
      if (!stackMap.has(stackName)) {
        stackMap.set(stackName, {
          workingDir: container.Labels?.[COMPOSE_WORKDIR_LABEL] ?? "",
          count: 0,
        });
      }
      stackMap.get(stackName)!.count++;
    }

    const db = getDatabase();
    const existingRows = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.userId, userId));
    const slugSet = new Set(existingRows.map((r) => r.slug));

    const result: AdoptableStack[] = [];
    for (const [stackName, info] of stackMap) {
      if (!slugSet.has(stackName)) {
        result.push({
          stackName,
          workingDir: info.workingDir,
          containerCount: info.count,
        });
      }
    }
    return result;
  }

  async findProviderStack(
    providers: ExposureProvider[],
    userId: string,
  ): Promise<{ detected: boolean; stackName?: string; providerType?: string }> {
    try {
      const containers = await this.dockerService.listComposeContainers();
      const db = getDatabase();
      const existingRows = await db
        .select({ slug: projects.slug })
        .from(projects)
        .where(eq(projects.userId, userId));
      const slugSet = new Set(existingRows.map((r) => r.slug));

      for (const container of containers) {
        const stackName = container.Labels?.[COMPOSE_LABEL];
        if (!stackName || slugSet.has(stackName)) continue;
        const image = container.Image ?? "";
        for (const provider of providers) {
          if (
            provider.containerImage &&
            image.includes(provider.containerImage)
          ) {
            return { detected: true, stackName, providerType: provider.type };
          }
        }
      }
      return { detected: false };
    } catch {
      return { detected: false };
    }
  }

  async adoptStacks(
    stackNames: string[],
    userId: string,
    options?: { isInfrastructure?: boolean },
  ): Promise<AdoptResult> {
    const containers = await this.dockerService.listComposeContainers();
    const stackMap = new Map<
      string,
      { workingDir: string; containerIds: string[]; logoUrl: string | null }
    >();

    for (const container of containers) {
      const stackName = container.Labels?.[COMPOSE_LABEL];
      if (!stackName || !stackNames.includes(stackName)) continue;
      if (!stackMap.has(stackName)) {
        stackMap.set(stackName, {
          workingDir: container.Labels?.[COMPOSE_WORKDIR_LABEL] ?? "",
          containerIds: [],
          logoUrl: container.Labels?.[LABEL_LOGO] ?? null,
        });
      }
      stackMap.get(stackName)!.containerIds.push(container.Id);
    }

    const db = getDatabase();
    const existingRows = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.userId, userId));
    const slugSet = new Set(existingRows.map((r) => r.slug));

    const adopted: string[] = [];
    const failed: { stackName: string; reason: string }[] = [];

    for (const stackName of stackNames) {
      if (slugSet.has(stackName)) {
        failed.push({ stackName, reason: "slug already exists" });
        continue;
      }

      const info = stackMap.get(stackName);
      if (!info) {
        failed.push({ stackName, reason: "stack not found in Docker" });
        continue;
      }

      let composeContent: string;
      try {
        composeContent = await this.readComposeFile(info.workingDir);
      } catch {
        const inspected = await Promise.all(
          info.containerIds.map((id) => this.dockerService.getContainer(id)),
        );
        composeContent = this.generateComposeFallback(
          stackName,
          info.workingDir,
          inspected,
        );
      }

      try {
        await db.insert(projects).values({
          userId,
          name: stackName,
          slug: stackName,
          logoUrl: info.logoUrl,
          composeContent,
          status: "running",
          isInfrastructure: options?.isInfrastructure ?? false,
          deployedAt: Date.now(),
        });
        adopted.push(stackName);
      } catch (err: any) {
        failed.push({ stackName, reason: err.message });
      }
    }

    return { adopted, failed };
  }

  private async readComposeFile(workingDir: string): Promise<string> {
    for (const name of [
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml",
    ]) {
      try {
        return await fs.readFile(path.join(workingDir, name), "utf-8");
      } catch {
        // try next filename
      }
    }
    throw new Error("Compose file not found");
  }

  private generateComposeFallback(
    stackName: string,
    workingDir: string,
    containers: Dockerode.ContainerInspectInfo[],
  ): string {
    const lines: string[] = [
      `# ⚠️ Original compose file not found at ${workingDir || "(unknown)"}`,
      `# Generated from running containers — review and uncomment before deploying.`,
      `#`,
      `# services:`,
    ];

    for (const container of containers) {
      const rawName = container.Name?.replace(/^\//, "") ?? "";
      const serviceName = extractServiceName(rawName, stackName);
      lines.push(`#   ${serviceName}:`);
      lines.push(`#     image: ${container.Config?.Image ?? "unknown"}`);

      const portBindings = (container.HostConfig?.PortBindings ?? {}) as Record<
        string,
        Array<{ HostIp?: string; HostPort?: string }> | undefined
      >;
      const ports = Object.entries(portBindings).flatMap(
        ([containerPort, hostBindings]) =>
          (hostBindings ?? []).map(
            (hb) => `${hb.HostPort}:${containerPort.split("/")[0]}`,
          ),
      );
      if (ports.length > 0) {
        lines.push(`#     ports:`);
        for (const p of ports) lines.push(`#       - "${p}"`);
      }

      const env = (container.Config?.Env ?? []).filter(
        (e) => !e.startsWith("PATH="),
      );
      if (env.length > 0) {
        lines.push(`#     environment:`);
        for (const e of env) lines.push(`#       - ${e}`);
      }

      const binds = container.HostConfig?.Binds ?? [];
      if (binds.length > 0) {
        lines.push(`#     volumes:`);
        for (const b of binds) lines.push(`#       - ${b}`);
      }

      const restart = container.HostConfig?.RestartPolicy?.Name;
      if (restart && restart !== "no") {
        lines.push(`#     restart: ${restart}`);
      }
    }

    return lines.join("\n") + "\n";
  }
}

function extractServiceName(containerName: string, stackName: string): string {
  for (const sep of ["-", "_"]) {
    const prefix = `${stackName}${sep}`;
    if (containerName.startsWith(prefix)) {
      return containerName
        .slice(prefix.length)
        .replace(new RegExp(`${sep}\\d+$`), "");
    }
  }
  return containerName;
}
