import { api } from './api';
import type { CloudflareProviderFormValue } from '../components/CloudflareProviderForm';

export function buildCloudflaredComposeContent(tunnelToken: string): string {
  return [
    'services:',
    '  cloudflared:',
    '    image: cloudflare/cloudflared:latest',
    '    restart: unless-stopped',
    '    command: tunnel run --token ${TUNNEL_TOKEN}',
    '    environment:',
    `      - TUNNEL_TOKEN=${tunnelToken}`,
    '    extra_hosts:',
    '      - "host.docker.internal:host-gateway"',
    '',
  ].join('\n');
}

/** Resolves the final tunnelId and optional tunnelToken before saving a Cloudflare provider.
 *  - If tunnelId === '__new__': creates the tunnel via CF API, returns new tunnelId + tunnelToken.
 *  - If deployContainer: fetches the token for the existing tunnel.
 *  - Otherwise returns the existing tunnelId with null token.
 *  Throws on CF API errors.
 */
export async function resolveCloudflareBeforeSave(cf: CloudflareProviderFormValue): Promise<{
  tunnelId: string;
  tunnelToken: string | null;
}> {
  let tunnelId = cf.tunnelId;
  let tunnelToken: string | null = null;

  if (tunnelId === '__new__') {
    const result = await api.post<{ tunnelId: string; tunnelToken: string }>('/cloudflare/tunnels/create', {
      apiToken: cf.apiToken,
      accountId: cf.accountId,
      tunnelName: cf.tunnelName,
    });
    tunnelId = result.tunnelId;
    tunnelToken = result.tunnelToken;
  } else if (cf.deployContainer) {
    const result = await api.post<{ tunnelToken: string }>('/cloudflare/tunnels/token', {
      apiToken: cf.apiToken,
      accountId: cf.accountId,
      tunnelId,
    });
    tunnelToken = result.tunnelToken;
  }

  return { tunnelId, tunnelToken };
}

export async function deployCloudflaredProject(tunnelToken: string): Promise<void> {
  await api.post('/projects', {
    name: 'Cloudflare Tunnel',
    composeContent: buildCloudflaredComposeContent(tunnelToken),
    isInfrastructure: true,
  });
}
