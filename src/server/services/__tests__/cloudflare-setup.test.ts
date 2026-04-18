import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudflareProvider } from '../exposure/providers/cloudflare.provider.js';

const mockConfig = {
  apiToken: 'test-token',
  accountId: 'test-account',
  tunnelId: 'test-tunnel',
};

function mockFetch(urlMap: Record<string, { ok: boolean; status: number }>) {
  return vi.fn((url: string) => {
    const urlPath = url.split('?')[0];
    for (const [pattern, resp] of Object.entries(urlMap)) {
      if (urlPath.endsWith(pattern)) {
        return Promise.resolve({
          ok: resp.ok,
          status: resp.status,
          json: () => Promise.resolve({ success: resp.ok, result: {} }),
          text: () => Promise.resolve(''),
        });
      }
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
  });
}

describe('CloudflareProvider.checkSetup()', () => {
  let provider: CloudflareProvider;

  beforeEach(async () => {
    provider = new CloudflareProvider();
    await provider.initialize(mockConfig);
  });

  it('returns allPassed=true when all checks succeed', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/user/tokens/verify': { ok: true, status: 200 },
      '/cfd_tunnel/test-tunnel': { ok: true, status: 200 },
      '/configurations': { ok: true, status: 200 },
      '/zones': { ok: true, status: 200 },
    }));

    const result = await provider.checkSetup!();

    expect(result.allPassed).toBe(true);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every((c) => c.passed)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('fails on check 1 when API token is invalid and short-circuits', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/user/tokens/verify': { ok: false, status: 403 },
    }));

    const result = await provider.checkSetup!();

    expect(result.allPassed).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].name).toBe('API Token');
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].resolution).toBeDefined();
    vi.unstubAllGlobals();
  });

  it('fails on check 2 when tunnel ID is invalid and short-circuits', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/user/tokens/verify': { ok: true, status: 200 },
      '/cfd_tunnel/test-tunnel': { ok: false, status: 404 },
    }));

    const result = await provider.checkSetup!();

    expect(result.allPassed).toBe(false);
    expect(result.checks).toHaveLength(2);
    expect(result.checks[1].name).toBe('Tunnel ID');
    expect(result.checks[1].passed).toBe(false);
    vi.unstubAllGlobals();
  });

  it('reports missing Tunnel:Edit permission in check 3', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/user/tokens/verify': { ok: true, status: 200 },
      '/cfd_tunnel/test-tunnel': { ok: true, status: 200 },
      '/configurations': { ok: false, status: 403 },
      '/zones': { ok: true, status: 200 },
    }));

    const result = await provider.checkSetup!();

    expect(result.allPassed).toBe(false);
    expect(result.checks[2].name).toBe('API Token Permissions');
    expect(result.checks[2].passed).toBe(false);
    expect(result.checks[2].message).toContain('Cloudflare Tunnel → Edit');
    expect(result.checks[2].message).not.toContain('Zone → Zone → Read');
    vi.unstubAllGlobals();
  });

  it('reports missing Zone:Read permission in check 3', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/user/tokens/verify': { ok: true, status: 200 },
      '/cfd_tunnel/test-tunnel': { ok: true, status: 200 },
      '/configurations': { ok: true, status: 200 },
      '/zones': { ok: false, status: 403 },
    }));

    const result = await provider.checkSetup!();

    expect(result.allPassed).toBe(false);
    expect(result.checks[2].passed).toBe(false);
    expect(result.checks[2].message).toContain('Zone → Zone → Read');
    expect(result.checks[2].message).not.toContain('Cloudflare Tunnel → Edit');
    vi.unstubAllGlobals();
  });

  it('reports both missing permissions in check 3', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/user/tokens/verify': { ok: true, status: 200 },
      '/cfd_tunnel/test-tunnel': { ok: true, status: 200 },
      '/configurations': { ok: false, status: 403 },
      '/zones': { ok: false, status: 403 },
    }));

    const result = await provider.checkSetup!();

    expect(result.allPassed).toBe(false);
    expect(result.checks[2].passed).toBe(false);
    expect(result.checks[2].message).toContain('Cloudflare Tunnel → Edit');
    expect(result.checks[2].message).toContain('Zone → Zone → Read');
    vi.unstubAllGlobals();
  });

  it('fails gracefully when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))));

    const result = await provider.checkSetup!();

    expect(result.allPassed).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].resolution).toBeDefined();
    vi.unstubAllGlobals();
  });
});
