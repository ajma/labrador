import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { projectRoutes } from '../projects.routes.js';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock('../../middleware/auth.middleware.js', () => ({
  authenticate: vi.fn(async () => {}),
}));

const fsMock = (await import('fs/promises')).default as unknown as { readFile: ReturnType<typeof vi.fn> };

const MANIFEST = JSON.stringify([
  {
    id: 'nginx',
    name: 'Nginx',
    description: 'High-performance web server.',
    categories: ['web'],
    stars: 24000,
    logoUrl: null,
  },
]);
const COMPOSE_YML = 'services:\n  nginx:\n    image: nginx:latest\n';

async function buildApp() {
  const app = Fastify();
  await app.register(fastifyJwt, { secret: 'test-secret' });
  await app.register(projectRoutes);
  await app.ready();
  return app;
}

describe('GET /templates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the manifest array', async () => {
    fsMock.readFile = vi.fn().mockResolvedValue(MANIFEST);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/templates' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe('nginx');
  });

  it('returns 500 when manifest is missing', async () => {
    fsMock.readFile = vi.fn().mockRejectedValue(Object.assign(new Error('no file'), { code: 'ENOENT' }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/templates' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /templates/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns merged template with composeContent', async () => {
    fsMock.readFile = vi.fn()
      .mockResolvedValueOnce(MANIFEST)
      .mockResolvedValueOnce(COMPOSE_YML);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/templates/nginx' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('nginx');
    expect(body.composeContent).toBe(COMPOSE_YML);
  });

  it('returns 404 for unknown id', async () => {
    fsMock.readFile = vi.fn().mockResolvedValue(MANIFEST);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/templates/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when yml file is missing for valid id', async () => {
    fsMock.readFile = vi.fn()
      .mockResolvedValueOnce(MANIFEST)
      .mockRejectedValueOnce(Object.assign(new Error('no file'), { code: 'ENOENT' }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/templates/nginx' });
    expect(res.statusCode).toBe(500);
  });
});
