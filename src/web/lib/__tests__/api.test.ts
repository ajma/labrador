import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';

function createJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('web api client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends GET requests with credentials and no forced content-type', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get<{ ok: boolean }>('/health');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      credentials: 'include',
      headers: {},
    });
  });

  it('serializes JSON body for POST and sets content-type header', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({ id: '123' }));
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/projects', { name: 'demo' });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ name: 'demo' }),
    });
  });

  it('returns undefined for 204 no-content responses', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.delete('/projects/abc');

    expect(result).toBeUndefined();
  });

  it('throws ApiError with server-provided message when request fails', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({ error: 'Not authorized' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/secret')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Not authorized',
    });
  });

  it('falls back to generic error message when error body is not JSON', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: vi.fn(async () => {
        throw new Error('invalid json');
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/broken')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Request failed',
    });
  });
});