import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import {
  buildCloudflaredComposeContent,
  deployCloudflaredProject,
  resolveCloudflareBeforeSave,
} from '../cloudflare';

vi.mock('../api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('cloudflare web helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds compose content with tunnel token command', () => {
    const content = buildCloudflaredComposeContent('token-123');

    expect(content).toContain('cloudflare/cloudflared:latest');
    expect(content).toContain('command: tunnel run --token token-123');
  });

  it('creates a new tunnel when tunnelId is __new__', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      tunnelId: 'new-tunnel-id',
      tunnelToken: 'new-tunnel-token',
    });

    const result = await resolveCloudflareBeforeSave({
      apiToken: 'api-token',
      accountId: 'account-id',
      tunnelId: '__new__',
      tunnelName: 'homelabman',
      deployContainer: true,
    });

    expect(api.post).toHaveBeenCalledWith('/cloudflare/tunnels/create', {
      apiToken: 'api-token',
      accountId: 'account-id',
      tunnelName: 'homelabman',
    });
    expect(result).toEqual({
      tunnelId: 'new-tunnel-id',
      tunnelToken: 'new-tunnel-token',
    });
  });

  it('fetches token for existing tunnel when deployContainer is true', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      tunnelToken: 'existing-token',
    });

    const result = await resolveCloudflareBeforeSave({
      apiToken: 'api-token',
      accountId: 'account-id',
      tunnelId: 'existing-id',
      tunnelName: '',
      deployContainer: true,
    });

    expect(api.post).toHaveBeenCalledWith('/cloudflare/tunnels/token', {
      apiToken: 'api-token',
      accountId: 'account-id',
      tunnelId: 'existing-id',
    });
    expect(result).toEqual({
      tunnelId: 'existing-id',
      tunnelToken: 'existing-token',
    });
  });

  it('does not fetch token when deployContainer is false', async () => {
    const result = await resolveCloudflareBeforeSave({
      apiToken: 'api-token',
      accountId: 'account-id',
      tunnelId: 'existing-id',
      tunnelName: '',
      deployContainer: false,
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(result).toEqual({
      tunnelId: 'existing-id',
      tunnelToken: null,
    });
  });

  it('creates infrastructure project for cloudflared deployment', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(undefined);

    await deployCloudflaredProject('infra-token');

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/projects', {
      name: 'Cloudflare Tunnel',
      composeContent: expect.stringContaining('command: tunnel run --token infra-token'),
      isInfrastructure: true,
    });
  });
});