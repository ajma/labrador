import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({ getDatabase: vi.fn() }));
vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn() },
  readFile: vi.fn(),
}));

import { getDatabase } from '../../db/index.js';
import { AdoptService } from '../adopt.service.js';
import * as fsModule from 'fs/promises';

function makeDockerMock(containers: any[] = []) {
  return {
    listComposeContainers: vi.fn().mockResolvedValue(containers),
    getContainer: vi.fn().mockImplementation((id: string) => {
      const container = containers.find((c) => c.Id === id) ?? containers[0];
      const rawName = container?.Names?.[0] ?? '/myapp-web-1';
      return Promise.resolve({
        Name: rawName,
        Config: { Image: 'nginx:latest', Env: ['PORT=80'] },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '8080' }] },
          Binds: ['/data:/app/data'],
          RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
        },
      });
    }),
  };
}

function makeDbMock(slugs: string[] = []) {
  const whereMock = vi.fn().mockResolvedValue(slugs.map((slug) => ({ slug })));
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  const valuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
  return { select: selectMock, insert: insertMock, _valuesMock: valuesMock };
}

const composeContainer = (stackName: string, workingDir = '/srv/myapp', id = 'abc123') => ({
  Id: id,
  Names: [`/${stackName}-web-1`],
  Image: 'nginx:latest',
  State: 'running',
  Labels: {
    'com.docker.compose.project': stackName,
    'com.docker.compose.project.working_dir': workingDir,
  },
});

describe('AdoptService.listAdoptable', () => {
  let service: AdoptService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stack with no matching slug', async () => {
    const docker = makeDockerMock([composeContainer('myapp')]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    service = new AdoptService(docker as any);

    const result = await service.listAdoptable('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].stackName).toBe('myapp');
    expect(result[0].containerCount).toBe(1);
    expect(result[0].workingDir).toBe('/srv/myapp');
  });

  it('excludes stack whose name matches an existing project slug', async () => {
    const docker = makeDockerMock([composeContainer('myapp')]);
    const db = makeDbMock(['myapp']);
    (getDatabase as any).mockReturnValue(db);
    service = new AdoptService(docker as any);

    const result = await service.listAdoptable('user-1');

    expect(result).toHaveLength(0);
  });

  it('returns orphaned stack (has labrador.project_id label but slug not in DB)', async () => {
    const container = {
      ...composeContainer('myapp'),
      Labels: {
        'com.docker.compose.project': 'myapp',
        'com.docker.compose.project.working_dir': '/srv/myapp',
        'labrador.project_id': 'old-deleted-uuid',
        'labrador.managed': 'true',
      },
    };
    const docker = makeDockerMock([container]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    service = new AdoptService(docker as any);

    const result = await service.listAdoptable('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].stackName).toBe('myapp');
  });

  it('excludes fully managed stack (has labrador labels and slug exists in DB)', async () => {
    const container = {
      ...composeContainer('myapp'),
      Labels: {
        'com.docker.compose.project': 'myapp',
        'com.docker.compose.project.working_dir': '/srv/myapp',
        'labrador.project_id': 'existing-uuid',
        'labrador.managed': 'true',
      },
    };
    const docker = makeDockerMock([container]);
    const db = makeDbMock(['myapp']);
    (getDatabase as any).mockReturnValue(db);
    service = new AdoptService(docker as any);

    const result = await service.listAdoptable('user-1');

    expect(result).toHaveLength(0);
  });

  it('returns empty array when no compose containers are running', async () => {
    const docker = makeDockerMock([]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    service = new AdoptService(docker as any);

    const result = await service.listAdoptable('user-1');

    expect(result).toHaveLength(0);
  });

  it('counts containers per stack correctly', async () => {
    const docker = makeDockerMock([
      composeContainer('myapp', '/srv/myapp', 'id1'),
      { ...composeContainer('myapp', '/srv/myapp', 'id2'), Names: ['/myapp-db-1'] },
    ]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    service = new AdoptService(docker as any);

    const result = await service.listAdoptable('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].containerCount).toBe(2);
  });
});

describe('AdoptService.adoptStacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates project with compose content read from disk', async () => {
    const docker = makeDockerMock([composeContainer('myapp')]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    (fsModule.default.readFile as any).mockResolvedValue('services:\n  web:\n    image: nginx\n');
    const service = new AdoptService(docker as any);

    const result = await service.adoptStacks(['myapp'], 'user-1');

    expect(result.adopted).toEqual(['myapp']);
    expect(result.failed).toHaveLength(0);
    expect(db.insert).toHaveBeenCalledOnce();
    const insertedValues = db._valuesMock.mock.calls[0][0];
    expect(insertedValues.slug).toBe('myapp');
    expect(insertedValues.name).toBe('myapp');
    expect(insertedValues.status).toBe('running');
    expect(insertedValues.composeContent).toBe('services:\n  web:\n    image: nginx\n');
    expect(insertedValues.deployedAt).toBeTypeOf('number');
  });

  it('creates project with commented fallback YAML when compose file not found', async () => {
    const docker = makeDockerMock([composeContainer('myapp')]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    (fsModule.default.readFile as any).mockRejectedValue(new Error('ENOENT'));
    const service = new AdoptService(docker as any);

    const result = await service.adoptStacks(['myapp'], 'user-1');

    expect(result.adopted).toEqual(['myapp']);
    const insertedValues = db._valuesMock.mock.calls[0][0];
    expect(insertedValues.composeContent).toContain('# ⚠️ Original compose file not found');
    expect(insertedValues.composeContent).toContain('# services:');
    expect(insertedValues.composeContent).toContain('#   web:');
    expect(insertedValues.composeContent).toContain('#     image: nginx:latest');
  });

  it('adds warning comment with workingDir path in fallback', async () => {
    const docker = makeDockerMock([composeContainer('myapp', '/srv/myapp')]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    (fsModule.default.readFile as any).mockRejectedValue(new Error('ENOENT'));
    const service = new AdoptService(docker as any);

    await service.adoptStacks(['myapp'], 'user-1');

    const insertedValues = db._valuesMock.mock.calls[0][0];
    expect(insertedValues.composeContent).toContain('/srv/myapp');
  });

  it('adds to failed with "slug already exists" when stack name collides with existing slug', async () => {
    const docker = makeDockerMock([composeContainer('myapp')]);
    const db = makeDbMock(['myapp']);
    (getDatabase as any).mockReturnValue(db);
    const service = new AdoptService(docker as any);

    const result = await service.adoptStacks(['myapp'], 'user-1');

    expect(result.adopted).toHaveLength(0);
    expect(result.failed).toEqual([{ stackName: 'myapp', reason: 'slug already exists' }]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('handles mixed batch — some adopted, some failed', async () => {
    const docker = makeDockerMock([
      composeContainer('myapp', '/srv/myapp', 'id1'),
      composeContainer('otherapp', '/srv/otherapp', 'id2'),
    ]);
    const db = makeDbMock(['otherapp']);
    (getDatabase as any).mockReturnValue(db);
    (fsModule.default.readFile as any).mockResolvedValue('services:\n  web:\n    image: nginx\n');
    const service = new AdoptService(docker as any);

    const result = await service.adoptStacks(['myapp', 'otherapp'], 'user-1');

    expect(result.adopted).toEqual(['myapp']);
    expect(result.failed).toEqual([{ stackName: 'otherapp', reason: 'slug already exists' }]);
  });

  it('restores logo from labrador.logo_url container label', async () => {
    const container = {
      ...composeContainer('myapp'),
      Labels: {
        'com.docker.compose.project': 'myapp',
        'com.docker.compose.project.working_dir': '/srv/myapp',
        'labrador.logo_url': 'https://example.com/logo.png',
      },
    };
    const docker = makeDockerMock([container]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    (fsModule.default.readFile as any).mockResolvedValue('services:\n  web:\n    image: nginx\n');
    const service = new AdoptService(docker as any);

    await service.adoptStacks(['myapp'], 'user-1');

    const insertedValues = db._valuesMock.mock.calls[0][0];
    expect(insertedValues.logoUrl).toBe('https://example.com/logo.png');
  });

  it('sets logoUrl to null when no logo label present', async () => {
    const docker = makeDockerMock([composeContainer('myapp')]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    (fsModule.default.readFile as any).mockResolvedValue('services:\n  web:\n    image: nginx\n');
    const service = new AdoptService(docker as any);

    await service.adoptStacks(['myapp'], 'user-1');

    const insertedValues = db._valuesMock.mock.calls[0][0];
    expect(insertedValues.logoUrl).toBeNull();
  });

  it('sets isInfrastructure: true on inserted project when option is passed', async () => {
    const docker = makeDockerMock([composeContainer('cloudflared')]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    (fsModule.default.readFile as any).mockResolvedValue('services:\n  cloudflared:\n    image: cloudflare/cloudflared\n');
    const service = new AdoptService(docker as any);

    await service.adoptStacks(['cloudflared'], 'user-1', { isInfrastructure: true });

    const insertedValues = db._valuesMock.mock.calls[0][0];
    expect(insertedValues.isInfrastructure).toBe(true);
  });

  it('defaults isInfrastructure to false when option is omitted', async () => {
    const docker = makeDockerMock([composeContainer('myapp')]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    (fsModule.default.readFile as any).mockResolvedValue('services:\n  web:\n    image: nginx\n');
    const service = new AdoptService(docker as any);

    await service.adoptStacks(['myapp'], 'user-1');

    const insertedValues = db._valuesMock.mock.calls[0][0];
    expect(insertedValues.isInfrastructure).toBe(false);
  });
});

describe('AdoptService.findProviderStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns detected=true with stackName and providerType when a provider image matches', async () => {
    const cfContainer = { ...composeContainer('cloudflared'), Image: 'cloudflare/cloudflared:latest' };
    const docker = makeDockerMock([cfContainer]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    const service = new AdoptService(docker as any);
    const providers = [{ type: 'cloudflare', containerImage: 'cloudflare/cloudflared' }];

    const result = await service.findProviderStack(providers as any, 'user-1');

    expect(result.detected).toBe(true);
    expect(result.stackName).toBe('cloudflared');
    expect(result.providerType).toBe('cloudflare');
  });

  it('returns detected=false when the matching stack is already managed', async () => {
    const cfContainer = { ...composeContainer('cloudflared'), Image: 'cloudflare/cloudflared:latest' };
    const docker = makeDockerMock([cfContainer]);
    const db = makeDbMock(['cloudflared']);
    (getDatabase as any).mockReturnValue(db);
    const service = new AdoptService(docker as any);
    const providers = [{ type: 'cloudflare', containerImage: 'cloudflare/cloudflared' }];

    const result = await service.findProviderStack(providers as any, 'user-1');

    expect(result.detected).toBe(false);
  });

  it('returns detected=false when no provider has a matching image', async () => {
    const docker = makeDockerMock([composeContainer('myapp')]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    const service = new AdoptService(docker as any);
    const providers = [{ type: 'cloudflare', containerImage: 'cloudflare/cloudflared' }];

    const result = await service.findProviderStack(providers as any, 'user-1');

    expect(result.detected).toBe(false);
  });

  it('skips providers without containerImage', async () => {
    const cfContainer = { ...composeContainer('cloudflared'), Image: 'cloudflare/cloudflared:latest' };
    const docker = makeDockerMock([cfContainer]);
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    const service = new AdoptService(docker as any);
    const providers = [{ type: 'caddy' }]; // no containerImage

    const result = await service.findProviderStack(providers as any, 'user-1');

    expect(result.detected).toBe(false);
  });

  it('returns detected=false when docker throws', async () => {
    const docker = { listComposeContainers: vi.fn().mockRejectedValue(new Error('docker offline')) };
    const db = makeDbMock([]);
    (getDatabase as any).mockReturnValue(db);
    const service = new AdoptService(docker as any);

    const result = await service.findProviderStack([{ type: 'cloudflare', containerImage: 'cloudflare/cloudflared' }] as any, 'user-1');

    expect(result.detected).toBe(false);
  });
});
