import type Dockerode from 'dockerode';

export class MockDockerService {
  containers: Dockerode.ContainerInfo[] = [];
  images: Dockerode.ImageInfo[] = [];
  networks: Dockerode.NetworkInspectInfo[] = [];

  reset() {
    this.containers = [];
    this.images = [];
    this.networks = [];
  }

  async ping() { return true; }
  async listContainers(_projectId?: string) { return this.containers; }
  async listManagedContainers() {
    return this.containers.filter((c) => c.Labels?.['labrador.managed'] === 'true');
  }
  async listComposeContainers() {
    return this.containers.filter(
      (c) => c.Labels?.['com.docker.compose.project'] !== undefined,
    );
  }
  async getContainer(id: string) {
    const c = this.containers.find((c) => c.Id === id);
    if (!c) return {} as Dockerode.ContainerInspectInfo;
    return {
      Name: c.Names?.[0] ?? `/${id}`,
      Config: { Image: c.Image, Env: [] },
      HostConfig: {
        PortBindings: {},
        Binds: [],
        RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
      },
    } as unknown as Dockerode.ContainerInspectInfo;
  }
  async startContainer(_id: string) {}
  async stopContainer(_id: string) {}
  async restartContainer(_id: string) {}
  async getContainerLogs(_id: string) { return ''; }
  async getContainerStats(_id: string) { return {} as Dockerode.ContainerStats; }
  async composeUp(_file: string, _name: string) { return { exitCode: 0 } as any; }
  async composeDown(_file: string, _name: string) { return { exitCode: 0 } as any; }
  async composeRestart(_file: string, _name: string) { return { exitCode: 0 } as any; }
  async composePull(_file: string, _name: string) { return { exitCode: 0 } as any; }
  async listNetworks() { return this.networks; }
  async inspectNetworks(ids: string[]) {
    return this.networks.filter((n) => ids.includes(n.Id));
  }
  async createNetwork(name: string, _driver = 'bridge') {
    return { id: 'net-' + name } as any;
  }
  async removeNetwork(_id: string) {}
  async listImages() { return this.images; }
  async removeImage(_id: string, _force = false) {}
  async pullImage(_name: string) { return null as any; }
  async pruneImages() { return { ImagesDeleted: [], SpaceReclaimed: 0 }; }
  async reconcileProjectStatuses() {
    return new Map<string, 'running' | 'stopped' | 'error'>();
  }
}
