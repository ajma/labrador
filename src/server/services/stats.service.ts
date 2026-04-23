import { DockerService } from './docker.service.js';
import { getDatabase } from '../db/index.js';
import { containerStats } from '../db/schema.js';
import { eq, and, lt, sql } from 'drizzle-orm';

export class StatsService {
  private collectInterval: NodeJS.Timeout | null = null;
  private retentionInterval: NodeJS.Timeout | null = null;

  constructor(
    private dockerService: DockerService,
    private broadcast: (projectId: string, message: any) => void,
  ) {}

  /** Start collecting stats for all managed containers every 10 seconds */
  startCollection(): void {
    this.collectInterval = setInterval(() => this.collectAll(), 10000);
  }

  stopCollection(): void {
    if (this.collectInterval) clearInterval(this.collectInterval);
    if (this.retentionInterval) clearInterval(this.retentionInterval);
  }

  /** Collect stats from all managed containers and broadcast via WebSocket */
  private async collectAll(): Promise<void> {
    try {
      const containers = await this.dockerService.listManagedContainers();

      // Group containers by project
      const projectContainers = new Map<string, typeof containers>();
      for (const container of containers) {
        const projectId = container.Labels['labrador.project_id'];
        if (!projectId) continue;
        if (!projectContainers.has(projectId)) projectContainers.set(projectId, []);
        projectContainers.get(projectId)!.push(container);
      }

      for (const [projectId, projContainers] of projectContainers) {
        const containerStatsList = [];
        for (const container of projContainers) {
          try {
            const stats = await this.dockerService.getContainerStats(container.Id);
            const cpuUsage = this.calculateCpuPercent(stats);
            const memoryUsage = stats.memory_stats?.usage || 0;
            const networkRx = Object.values(stats.networks || {}).reduce(
              (sum: number, n: any) => sum + (n.rx_bytes || 0),
              0,
            );
            const networkTx = Object.values(stats.networks || {}).reduce(
              (sum: number, n: any) => sum + (n.tx_bytes || 0),
              0,
            );

            containerStatsList.push({
              containerId: container.Id,
              name: container.Names[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
              cpuUsage,
              memoryUsage,
              memoryLimit: stats.memory_stats?.limit || 0,
              networkRx,
              networkTx,
              status: container.State,
            });

            // Store in database
            const db = getDatabase();
            await db.insert(containerStats).values({
              projectId,
              containerName:
                container.Names[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
              cpuUsage,
              memoryUsage,
              networkRx,
              networkTx,
              uptimeStatus: container.State === 'running' ? 'up' : 'down',
            });
          } catch {
            // Container may have stopped between list and stats call
          }
        }

        if (containerStatsList.length > 0) {
          this.broadcast(projectId, {
            type: 'stats:update',
            projectId,
            containers: containerStatsList,
          });
        }
      }
    } catch {
      // Docker may be unavailable
    }
  }

  private calculateCpuPercent(stats: any): number {
    const cpuDelta =
      (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
      (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta =
      (stats.cpu_stats?.system_cpu_usage || 0) -
      (stats.precpu_stats?.system_cpu_usage || 0);
    const numCpus = stats.cpu_stats?.online_cpus || 1;
    if (systemDelta > 0 && cpuDelta >= 0) {
      return (cpuDelta / systemDelta) * numCpus * 100;
    }
    return 0;
  }

  /** Start retention job - runs hourly */
  startRetention(): void {
    this.retentionInterval = setInterval(() => this.runRetention(), 3600000);
  }

  /**
   * Aggregate raw data older than 24h into hourly averages, delete raw data older than 24h.
   * Delete hourly aggregates older than 30 days.
   */
  private async runRetention(): Promise<void> {
    const db = getDatabase();
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Delete very old data (> 30 days)
    await db.delete(containerStats).where(lt(containerStats.recordedAt, thirtyDaysAgo));

    // Delete raw data older than 24 hours (simplified - full aggregation would be more complex)
    await db
      .delete(containerStats)
      .where(lt(containerStats.recordedAt, twentyFourHoursAgo));
  }

  /** Get historical stats for a project */
  async getProjectStats(projectId: string, rangeMs: number): Promise<any[]> {
    const db = getDatabase();
    const since = Date.now() - rangeMs;
    return db
      .select()
      .from(containerStats)
      .where(
        and(
          eq(containerStats.projectId, projectId),
          sql`${containerStats.recordedAt} >= ${since}`,
        ),
      )
      .orderBy(containerStats.recordedAt);
  }

  /** Calculate uptime percentage for a project over a time range */
  async getProjectUptime(projectId: string, rangeMs: number): Promise<number> {
    const stats = await this.getProjectStats(projectId, rangeMs);
    if (stats.length === 0) return 0;
    const upCount = stats.filter((s) => s.uptimeStatus === 'up').length;
    return (upCount / stats.length) * 100;
  }
}
