const CF_API = 'https://api.cloudflare.com/client/v4';

export class CloudflareApiService {
  async listAccounts(apiToken: string): Promise<{ id: string; name: string }[]> {
    const res = await fetch(`${CF_API}/accounts`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message ?? 'Failed to fetch accounts');
    return (data.result ?? []).map((a: any) => ({ id: a.id, name: a.name }));
  }

  async listTunnels(apiToken: string, accountId: string): Promise<{ id: string; name: string }[]> {
    const res = await fetch(`${CF_API}/accounts/${accountId}/cfd_tunnel?per_page=50`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message ?? 'Failed to fetch tunnels');
    return (data.result ?? []).map((t: any) => ({ id: t.id, name: t.name }));
  }

  async createTunnel(
    apiToken: string,
    accountId: string,
    tunnelName: string,
  ): Promise<{ tunnelId: string; tunnelToken: string }> {
    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    const tunnelSecret = btoa(String.fromCharCode(...secret));

    const res = await fetch(`${CF_API}/accounts/${accountId}/cfd_tunnel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tunnelName, tunnel_secret: tunnelSecret, config_src: 'cloudflare' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message ?? 'Failed to create tunnel');
    return { tunnelId: data.result.id, tunnelToken: data.result.token };
  }

  async getTunnelToken(
    apiToken: string,
    accountId: string,
    tunnelId: string,
  ): Promise<{ tunnelToken: string }> {
    const res = await fetch(`${CF_API}/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message ?? 'Failed to fetch tunnel token');
    return { tunnelToken: data.result as string };
  }
}
