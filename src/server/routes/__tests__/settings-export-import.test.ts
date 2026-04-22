import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { settingsRoutes } from '../settings.routes.js';

vi.mock('../../db/index.js', () => ({ getDatabase: vi.fn() }));
vi.mock('../../middleware/auth.middleware.js', () => ({
  authenticate: vi.fn(async (request: any) => {
    request.user = { id: 'user-123', username: 'testuser' };
  }),
}));

const USER_ID = 'user-123';

const MOCK_SETTINGS = {
  id: 'settings-1', userId: USER_ID, onboardingCompleted: true,
  defaultExposureProviderId: 'provider-1', createdAt: 1000, updatedAt: 1000,
};

const MOCK_PROVIDERS = [{
  id: 'provider-1', userId: USER_ID, providerType: 'caddy', name: 'My Caddy',
  enabled: true, configuration: JSON.stringify({ apiUrl: 'http://localhost:2019' }),
}];

const MOCK_PROJECTS = [{
  id: 'project-1', userId: USER_ID, name: 'Nextcloud', slug: 'nextcloud',
  logoUrl: null, domainName: null,
  composeContent: 'services:\n  nextcloud:\n    image: nextcloud\n',
  exposureEnabled: false, exposureProviderId: 'provider-1',
  exposureConfig: '{}', isInfrastructure: false, status: 'stopped',
  createdAt: 1000, updatedAt: 1000, deployedAt: null,
}];

function makeSelectChain(settingsRow: any, providers: any[], projectList: any[]) {
  // This mock uses call counting to return different data per sequential select() call
  let callCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      callCount++;
      const count = callCount;
      return {
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            if (count === 1) return Promise.resolve([settingsRow]);
            if (count === 2) return Promise.resolve(providers);
            return Promise.resolve(projectList);
          }),
        })),
      };
    }),
  };
}

async function buildApp(db: any) {
  const { getDatabase } = await import('../../db/index.js');
  vi.mocked(getDatabase).mockReturnValue(db);
  const app = Fastify({ logger: false });
  await app.register(fastifyJwt, { secret: 'test-secret' });
  app.decorate('providerRegistry', { get: vi.fn().mockReturnValue({ checkSetup: undefined }) });
  await app.register(settingsRoutes);
  await app.ready();
  return app;
}

describe('GET /export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a JSON backup with version, settings, providers, projects', async () => {
    const db = makeSelectChain(MOCK_SETTINGS, MOCK_PROVIDERS, MOCK_PROJECTS);
    const app = await buildApp(db);
    const res = await app.inject({ method: 'GET', url: '/export' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');

    const body = res.json();
    expect(body.version).toBe(1);
    expect(body.exportedAt).toBeTruthy();
    expect(body.settings.defaultExposureProviderName).toBe('My Caddy');
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0]).toMatchObject({ providerType: 'caddy', name: 'My Caddy', enabled: true });
    expect(body.providers[0].id).toBeUndefined();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({ name: 'Nextcloud', exposureProviderName: 'My Caddy' });
    expect(body.projects[0].id).toBeUndefined();
  });

  it('sets defaultExposureProviderName to null when no default is set', async () => {
    const db = makeSelectChain(
      { ...MOCK_SETTINGS, defaultExposureProviderId: null },
      MOCK_PROVIDERS,
      MOCK_PROJECTS,
    );
    const app = await buildApp(db);
    const res = await app.inject({ method: 'GET', url: '/export' });
    expect(res.json().settings.defaultExposureProviderName).toBeNull();
  });
});
