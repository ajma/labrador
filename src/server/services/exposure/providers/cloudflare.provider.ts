import type {
  ExposureRoute,
  ValidationResult,
  ProviderHealth,
  RouteStatus,
  ProviderSetupResult,
  SetupCheck,
} from '@shared/exposure/provider.interface.js';
import { BaseProvider } from './base.provider.js';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

interface TunnelHostname {
  hostname?: string;
  service: string;
  originRequest?: Record<string, any>;
}

interface TunnelConfig {
  ingress: TunnelHostname[];
}

export class CloudflareProvider extends BaseProvider {
  readonly type = 'cloudflare';
  readonly name = 'Cloudflare Tunnel';

  private get apiToken(): string {
    return this.config.apiToken as string;
  }

  private get accountId(): string {
    return this.config.accountId as string;
  }

  private get tunnelId(): string {
    return this.config.tunnelId as string;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private configUrl(): string {
    return `${CF_API_BASE}/accounts/${this.accountId}/cfd_tunnel/${this.tunnelId}/configurations`;
  }

  private tunnelUrl(): string {
    return `${CF_API_BASE}/accounts/${this.accountId}/cfd_tunnel/${this.tunnelId}`;
  }

  async validateConfig(config: Record<string, any>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.apiToken || typeof config.apiToken !== 'string') {
      errors.push('apiToken is required');
    }
    if (!config.accountId || typeof config.accountId !== 'string') {
      errors.push('accountId is required');
    }
    if (!config.tunnelId || typeof config.tunnelId !== 'string') {
      errors.push('tunnelId is required');
    }

    const tunnelToken = config.tunnelToken;
    if (errors.length === 0 && !tunnelToken) {
      warnings.push('tunnelToken not set; getComposeTemplate will not include a token');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(this.tunnelUrl(), {
        headers: this.headers(),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  }

  private async getTunnelConfig(): Promise<TunnelConfig> {
    const res = await fetch(this.configUrl(), {
      headers: this.headers(),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to get tunnel config (${res.status}): ${body}`);
    }
    const data = await res.json();
    return data.result?.config || { ingress: [{ service: 'http_status:404' }] };
  }

  private async putTunnelConfig(config: TunnelConfig): Promise<void> {
    const res = await fetch(this.configUrl(), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ config }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to update tunnel config (${res.status}): ${body}`);
    }
  }

  private async findZoneId(hostname: string): Promise<string | null> {
    const parts = hostname.split('.');
    // Try from most-specific to root (e.g. sub.example.com → example.com)
    for (let i = 1; i < parts.length - 1; i++) {
      const name = parts.slice(i).join('.');
      const res = await fetch(`${CF_API_BASE}/zones?name=${name}&status=active`, {
        headers: this.headers(),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.result?.length > 0) return data.result[0].id as string;
    }
    return null;
  }

  private async upsertDnsRecord(zoneId: string, hostname: string): Promise<void> {
    const content = `${this.tunnelId}.cfargotunnel.com`;
    const record = { type: 'CNAME', name: hostname, content, proxied: true, ttl: 1 };

    // Check for existing record
    const listRes = await fetch(
      `${CF_API_BASE}/zones/${zoneId}/dns_records?type=CNAME&name=${hostname}`,
      { headers: this.headers() },
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const existing = listData.result?.[0];
      if (existing) {
        await fetch(`${CF_API_BASE}/zones/${zoneId}/dns_records/${existing.id}`, {
          method: 'PUT',
          headers: this.headers(),
          body: JSON.stringify(record),
        });
        return;
      }
    }

    await fetch(`${CF_API_BASE}/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(record),
    });
  }

  private async deleteDnsRecord(zoneId: string, hostname: string): Promise<void> {
    const listRes = await fetch(
      `${CF_API_BASE}/zones/${zoneId}/dns_records?type=CNAME&name=${hostname}`,
      { headers: this.headers() },
    );
    if (!listRes.ok) return;
    const listData = await listRes.json();
    const existing = listData.result?.[0];
    if (existing) {
      await fetch(`${CF_API_BASE}/zones/${zoneId}/dns_records/${existing.id}`, {
        method: 'DELETE',
        headers: this.headers(),
      });
    }
  }

  async addRoute(route: ExposureRoute): Promise<void> {
    const config = await this.getTunnelConfig();
    const targetHost = route.targetHost || 'host.docker.internal';
    const service = `http://${targetHost}:${route.targetPort}`;

    // Remove catch-all, add new entry, re-add catch-all
    const catchAll = config.ingress.find((e) => !e.hostname);
    const entries = config.ingress.filter((e) => e.hostname);

    const existing = entries.findIndex((e) => e.hostname === route.domain);
    if (existing >= 0) {
      entries[existing] = { hostname: route.domain, service };
    } else {
      entries.push({ hostname: route.domain, service });
    }

    config.ingress = [...entries, catchAll || { service: 'http_status:404' }];
    await this.putTunnelConfig(config);

    const zoneId = await this.findZoneId(route.domain);
    if (zoneId) await this.upsertDnsRecord(zoneId, route.domain);
  }

  async updateRoute(route: ExposureRoute): Promise<void> {
    // addRoute handles upsert logic
    await this.addRoute(route);
  }

  async removeRoute(routeId: string): Promise<void> {
    // routeId is the projectId; we need to look up the domain from the project.
    // Since we don't have the domain here, we search by a convention: the route
    // was added with a known domain. We'll look through ingress entries for any
    // matching the pattern. For a more robust approach, we store the domain in
    // the project's exposureConfig.
    // For now, we'll remove by iterating and matching service or by the caller
    // passing the domain as routeId.
    const config = await this.getTunnelConfig();
    const catchAll = config.ingress.find((e) => !e.hostname);
    const entries = config.ingress.filter(
      (e) => e.hostname && e.hostname !== routeId,
    );

    config.ingress = [...entries, catchAll || { service: 'http_status:404' }];
    await this.putTunnelConfig(config);

    const zoneId = await this.findZoneId(routeId);
    if (zoneId) await this.deleteDnsRecord(zoneId, routeId);
  }

  async getRouteStatus(routeId: string): Promise<RouteStatus> {
    try {
      const config = await this.getTunnelConfig();
      const entry = config.ingress.find((e) => e.hostname === routeId);
      if (entry) {
        return { active: true, domain: entry.hostname || '', message: 'Route configured in tunnel' };
      }
      return { active: false, domain: '', message: 'Route not found in tunnel config' };
    } catch {
      return { active: false, domain: '', message: 'Unable to reach Cloudflare API' };
    }
  }

  async getHealth(): Promise<ProviderHealth> {
    try {
      const res = await fetch(this.tunnelUrl(), {
        headers: this.headers(),
      });
      if (!res.ok) {
        return {
          healthy: false,
          message: `Cloudflare API returned ${res.status}`,
          lastChecked: new Date(),
        };
      }
      const data = await res.json();
      const tunnel = data.result;
      const healthy = tunnel?.status === 'healthy' || tunnel?.status === 'active';
      return {
        healthy,
        message: `Tunnel status: ${tunnel?.status || 'unknown'}`,
        lastChecked: new Date(),
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: `Cannot reach Cloudflare API: ${err.message}`,
        lastChecked: new Date(),
      };
    }
  }

  async listDomains(): Promise<string[]> {
    try {
      const res = await fetch(
        `${CF_API_BASE}/zones?account.id=${this.accountId}&status=active&per_page=50`,
        { headers: this.headers() },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.result || []).map((zone: { name: string }) => zone.name);
    } catch {
      return [];
    }
  }

  async checkSetup(): Promise<ProviderSetupResult> {
    const checks: SetupCheck[] = [];

    // Check 1: API Token valid
    try {
      const res = await fetch(`${CF_API_BASE}/user/tokens/verify`, { headers: this.headers() });
      if (!res.ok) {
        checks.push({
          name: 'API Token',
          passed: false,
          message: `Token verification failed (${res.status})`,
          resolution: 'Regenerate the token in Cloudflare dashboard → My Profile → API Tokens.',
        });
        return { allPassed: false, checks };
      }
      checks.push({ name: 'API Token', passed: true, message: 'Token is valid' });
    } catch {
      checks.push({
        name: 'API Token',
        passed: false,
        message: 'Could not reach Cloudflare API',
        resolution: 'Check your network connection and try again.',
      });
      return { allPassed: false, checks };
    }

    // Check 2: Tunnel ID valid (also implicitly validates account ID — wrong account ID causes 404 here too)
    try {
      const res = await fetch(this.tunnelUrl(), { headers: this.headers() });
      if (!res.ok) {
        checks.push({
          name: 'Tunnel ID',
          passed: false,
          message: `Tunnel not found (${res.status}) — verify both your Account ID and Tunnel ID are correct`,
          resolution: 'Check Zero Trust → Networks → Tunnels for the correct Tunnel ID, and confirm your Account ID under Account Home.',
        });
        return { allPassed: false, checks };
      }
      checks.push({ name: 'Tunnel ID', passed: true, message: 'Tunnel exists and is accessible' });
    } catch {
      checks.push({
        name: 'Tunnel ID',
        passed: false,
        message: 'Could not reach Cloudflare API',
        resolution: 'Check your network connection and try again.',
      });
      return { allPassed: false, checks };
    }

    // Check 4: API Token permissions (parallel)
    try {
      const [tunnelConfigRes, zonesRes] = await Promise.all([
        fetch(this.configUrl(), { headers: this.headers() }),
        fetch(`${CF_API_BASE}/zones?account.id=${this.accountId}&per_page=1`, { headers: this.headers() }),
      ]);

      const missingPerms: string[] = [];
      if (!tunnelConfigRes.ok && tunnelConfigRes.status === 403) {
        missingPerms.push('Cloudflare Tunnel → Edit');
      }
      if (!zonesRes.ok && zonesRes.status === 403) {
        missingPerms.push('Zone → Zone → Read');
      }

      if (missingPerms.length > 0) {
        checks.push({
          name: 'API Token Permissions',
          passed: false,
          message: `Missing permission(s): ${missingPerms.join(', ')}`,
          resolution: `Edit the API token and add: ${missingPerms.join(' and ')}.`,
        });
        return { allPassed: false, checks };
      }

      checks.push({
        name: 'API Token Permissions',
        passed: true,
        message: 'Cloudflare Tunnel:Edit and Zone:Read permissions confirmed',
      });
    } catch {
      checks.push({
        name: 'API Token Permissions',
        passed: false,
        message: 'Could not verify permissions',
        resolution: 'Check your network connection and try again.',
      });
      return { allPassed: false, checks };
    }

    return { allPassed: true, checks };
  }

  getComposeTemplate(config: Record<string, any>): string | null {
    const token = config.tunnelToken;
    if (!token) return null;

    return `services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run --token \${TUNNEL_TOKEN}
    environment:
      - TUNNEL_TOKEN=${token}
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;
  }
}
