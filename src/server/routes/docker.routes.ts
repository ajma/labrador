import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.middleware.js";
import { DockerService } from "../services/docker.service.js";

export async function dockerRoutes(app: FastifyInstance) {
  const dockerService = (app as any).dockerService as DockerService | undefined;

  // All routes require authentication
  app.addHook("preHandler", authenticate);

  // GET /containers - List all Docker containers
  app.get("/containers", async (_request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: "Docker is not available" });
    }
    const containers = await dockerService.listContainers();
    return containers;
  });

  // POST /containers/:id/start
  app.post<{ Params: { id: string } }>(
    "/containers/:id/start",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      await dockerService.startContainer(request.params.id);
      return { success: true };
    },
  );

  // POST /containers/:id/stop
  app.post<{ Params: { id: string } }>(
    "/containers/:id/stop",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      await dockerService.stopContainer(request.params.id);
      return { success: true };
    },
  );

  // POST /containers/:id/restart
  app.post<{ Params: { id: string } }>(
    "/containers/:id/restart",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      await dockerService.restartContainer(request.params.id);
      return { success: true };
    },
  );

  // DELETE /containers/:id
  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    "/containers/:id",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      const force = request.query.force === "true";
      await dockerService.removeContainer(request.params.id, force);
      return { success: true };
    },
  );

  // GET /networks - List Docker networks for a page, with Containers populated only for that page
  app.get<{ Querystring: { page?: string; pageSize?: string } }>(
    "/networks",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const pageSize = Math.min(
        50,
        Math.max(1, parseInt(request.query.pageSize ?? "15", 10)),
      );
      const all = await dockerService.listNetworks();
      const pageIds = all
        .slice((page - 1) * pageSize, page * pageSize)
        .map((n) => n.Id);
      const data = await dockerService.inspectNetworks(pageIds);
      return { data, total: all.length };
    },
  );

  // POST /networks - Create a network
  app.post<{ Body: { name: string; driver?: string } }>(
    "/networks",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      const { name, driver } = request.body;
      if (!name || typeof name !== "string") {
        return reply.code(400).send({ error: "Network name is required" });
      }
      const network = await dockerService.createNetwork(name, driver);
      return { id: network.id, name };
    },
  );

  // DELETE /networks/:id - Remove a network
  app.delete<{ Params: { id: string } }>(
    "/networks/:id",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      const { id } = request.params;
      await dockerService.removeNetwork(id);
      return { success: true };
    },
  );

  // GET /images - List all Docker images
  app.get("/images", async (_request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: "Docker is not available" });
    }
    const images = await dockerService.listImages();
    return images;
  });

  // DELETE /images/:id - Remove an image
  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    "/images/:id",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      const { id } = request.params;

      const containers = await dockerService.listContainers();
      const inUse = containers.some((c) => c.ImageID === id || c.Image === id);
      if (inUse) {
        return reply
          .code(409)
          .send({ error: "Image is in use by a running container" });
      }

      const force = request.query.force === "true";
      await dockerService.removeImage(id, force);
      return { success: true };
    },
  );

  // POST /images/:name/pull - Pull an image
  app.post<{ Params: { name: string } }>(
    "/images/:name/pull",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      const { name } = request.params;
      await dockerService.pullImage(name);
      return { success: true, image: name };
    },
  );

  // POST /images/prune - Prune unused images
  app.post("/images/prune", async (_request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: "Docker is not available" });
    }
    const result = await dockerService.pruneImages();
    return result;
  });

  // GET /volumes - List Docker volumes with container counts
  app.get<{ Querystring: { page?: string; pageSize?: string } }>(
    "/volumes",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const pageSize = Math.min(
        50,
        Math.max(1, parseInt(request.query.pageSize ?? "15", 10)),
      );
      const allVolumes = await dockerService.listVolumes();
      const containers = await dockerService.listContainers();

      const volumeContainerCount = new Map<string, number>();
      for (const container of containers) {
        for (const mount of (container as any).Mounts || []) {
          if (mount.Type === "volume" && mount.Name) {
            volumeContainerCount.set(
              mount.Name,
              (volumeContainerCount.get(mount.Name) || 0) + 1,
            );
          }
        }
      }

      const paged = allVolumes.slice((page - 1) * pageSize, page * pageSize);
      const data = paged.map((v) => ({
        ...v,
        ContainerCount: volumeContainerCount.get(v.Name) || 0,
      }));
      return { data, total: allVolumes.length };
    },
  );

  // POST /volumes - Create a volume
  app.post<{ Body: { name: string; driver?: string } }>(
    "/volumes",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      const { name, driver } = request.body;
      if (!name || typeof name !== "string") {
        return reply.code(400).send({ error: "Volume name is required" });
      }
      const volume = await dockerService.createVolume(name, driver);
      return { name: volume.Name };
    },
  );

  // DELETE /volumes/:name - Remove a volume
  app.delete<{ Params: { name: string } }>(
    "/volumes/:name",
    async (request, reply) => {
      if (!dockerService) {
        return reply.code(503).send({ error: "Docker is not available" });
      }
      await dockerService.removeVolume(request.params.name);
      return { success: true };
    },
  );

  // POST /volumes/prune - Prune unused volumes
  app.post("/volumes/prune", async (_request, reply) => {
    if (!dockerService) {
      return reply.code(503).send({ error: "Docker is not available" });
    }
    const result = await dockerService.pruneVolumes();
    return result;
  });
}
