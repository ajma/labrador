import Dockerode from "dockerode";
import { execa } from "execa";

const LABEL_MANAGED = "labrador.managed";
const LABEL_PROJECT_ID = "labrador.project_id";

export class DockerService {
  private docker: Dockerode;

  constructor() {
    this.docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
  }

  /** Test Docker connection */
  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /** List all containers, optionally filtered by project */
  async listContainers(projectId?: string): Promise<Dockerode.ContainerInfo[]> {
    const filters: Record<string, string[]> = {};
    if (projectId) {
      filters["label"] = [`${LABEL_PROJECT_ID}=${projectId}`];
    }
    return this.docker.listContainers({ all: true, filters });
  }

  /** List only labrador-managed containers */
  async listManagedContainers(): Promise<Dockerode.ContainerInfo[]> {
    return this.docker.listContainers({
      all: true,
      filters: { label: [`${LABEL_MANAGED}=true`] },
    });
  }

  /** List containers that belong to any Docker Compose stack */
  async listComposeContainers(): Promise<Dockerode.ContainerInfo[]> {
    return this.docker.listContainers({
      all: true,
      filters: { label: ["com.docker.compose.project"] },
    });
  }

  /** Get container by ID */
  async getContainer(
    containerId: string,
  ): Promise<Dockerode.ContainerInspectInfo> {
    const container = this.docker.getContainer(containerId);
    return container.inspect();
  }

  /** Start a container */
  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.start();
  }

  /** Stop a container */
  async stopContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop();
  }

  /** Restart a container */
  async restartContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.restart();
  }

  /** Remove a container (must be stopped first unless force=true) */
  async removeContainer(containerId: string, force = false): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.remove({ force });
  }

  /** Get container logs (last N lines) */
  async getContainerLogs(containerId: string, tail = 100): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const logBuffer = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      follow: false,
    });

    // Logs come back as a Buffer with Docker multiplexed stream headers.
    // Each frame has an 8-byte header: [stream_type(1), 0, 0, 0, size(4)].
    // For simplicity, strip the headers and return the text content.
    if (Buffer.isBuffer(logBuffer)) {
      return stripDockerStreamHeaders(logBuffer);
    }
    return String(logBuffer);
  }

  /** Get real-time stats for a container (one-shot, not streaming) */
  async getContainerStats(
    containerId: string,
  ): Promise<Dockerode.ContainerStats> {
    const container = this.docker.getContainer(containerId);
    return container.stats({
      stream: false,
    }) as Promise<Dockerode.ContainerStats>;
  }

  /** Deploy a project using docker compose */
  async composeUp(composeFilePath: string, projectName: string) {
    return execa("docker", [
      "compose",
      "-f",
      composeFilePath,
      "-p",
      projectName,
      "up",
      "-d",
    ]);
  }

  /** Stop a project using docker compose */
  async composeDown(composeFilePath: string, projectName: string) {
    return execa("docker", [
      "compose",
      "-f",
      composeFilePath,
      "-p",
      projectName,
      "down",
    ]);
  }

  /** Restart project containers */
  async composeRestart(composeFilePath: string, projectName: string) {
    return execa("docker", [
      "compose",
      "-f",
      composeFilePath,
      "-p",
      projectName,
      "restart",
    ]);
  }

  /** Pull images for a project */
  async composePull(composeFilePath: string, projectName: string) {
    return execa("docker", [
      "compose",
      "-f",
      composeFilePath,
      "-p",
      projectName,
      "pull",
    ]);
  }

  /** List all Docker networks (no Containers field) */
  async listNetworks(): Promise<Dockerode.NetworkInspectInfo[]> {
    return this.docker.listNetworks();
  }

  /** Inspect a specific subset of networks to populate the Containers field */
  async inspectNetworks(
    ids: string[],
  ): Promise<Dockerode.NetworkInspectInfo[]> {
    return Promise.all(ids.map((id) => this.docker.getNetwork(id).inspect()));
  }

  /** Create a Docker network */
  async createNetwork(
    name: string,
    driver = "bridge",
  ): Promise<Dockerode.Network> {
    return this.docker.createNetwork({ Name: name, Driver: driver });
  }

  /** Remove a Docker network */
  async removeNetwork(networkId: string): Promise<void> {
    const network = this.docker.getNetwork(networkId);
    await network.remove();
  }

  /** List all Docker images */
  async listImages(): Promise<Dockerode.ImageInfo[]> {
    return this.docker.listImages({ all: true });
  }

  /** Remove a Docker image */
  async removeImage(imageId: string, force = false): Promise<void> {
    const image = this.docker.getImage(imageId);
    await image.remove({ force });
  }

  /** Pull an image */
  async pullImage(imageName: string): Promise<NodeJS.ReadableStream> {
    return this.docker.pull(imageName);
  }

  /** Prune unused images */
  async pruneImages(): Promise<Dockerode.PruneImagesInfo> {
    return this.docker.pruneImages();
  }

  /** List all Docker volumes */
  async listVolumes(): Promise<Dockerode.VolumeInspectInfo[]> {
    const result = await this.docker.listVolumes();
    return result.Volumes || [];
  }

  /** Create a Docker volume */
  async createVolume(
    name: string,
    driver = "local",
  ): Promise<Dockerode.VolumeCreateResponse> {
    return this.docker.createVolume({ Name: name, Driver: driver });
  }

  /** Remove a Docker volume */
  async removeVolume(name: string): Promise<void> {
    const volume = this.docker.getVolume(name);
    await volume.remove();
  }

  /** Prune unused volumes */
  async pruneVolumes(): Promise<Dockerode.PruneVolumesInfo> {
    return this.docker.pruneVolumes();
  }

  /**
   * Reconcile project statuses on startup.
   * Scans for containers with labrador.managed=true label,
   * groups by labrador.project_id, and returns a map of projectId -> status.
   */
  async reconcileProjectStatuses(): Promise<
    Map<string, "running" | "stopped" | "error">
  > {
    const containers = await this.listManagedContainers();
    const projectMap = new Map<string, Dockerode.ContainerInfo[]>();

    for (const container of containers) {
      const projectId = container.Labels[LABEL_PROJECT_ID];
      if (projectId) {
        if (!projectMap.has(projectId)) projectMap.set(projectId, []);
        projectMap.get(projectId)!.push(container);
      }
    }

    const statusMap = new Map<string, "running" | "stopped" | "error">();
    for (const [projectId, projectContainers] of projectMap) {
      const allRunning = projectContainers.every((c) => c.State === "running");
      const allStopped = projectContainers.every(
        (c) => c.State === "exited" || c.State === "created",
      );

      if (allRunning) statusMap.set(projectId, "running");
      else if (allStopped) statusMap.set(projectId, "stopped");
      else statusMap.set(projectId, "error");
    }

    return statusMap;
  }
}

/**
 * Strip Docker multiplexed stream headers from log output.
 * Each frame has an 8-byte header: [stream_type(1), 0(3), size(4 big-endian)].
 */
function stripDockerStreamHeaders(buffer: Buffer): string {
  const lines: Buffer[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      // Not enough bytes for a header; take whatever is left as raw text
      lines.push(buffer.subarray(offset));
      break;
    }

    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;

    if (end > buffer.length) {
      // Partial frame - take what we can
      lines.push(buffer.subarray(start));
      break;
    }

    lines.push(buffer.subarray(start, end));
    offset = end;
  }

  return Buffer.concat(lines).toString("utf-8");
}
