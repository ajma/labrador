import type {
  ExposureRoute,
  ValidationResult,
  ProviderHealth,
  RouteStatus,
} from '@shared/exposure/provider.interface.js';
import { BaseProvider } from './base.provider.js';

export class CaddyProvider extends BaseProvider {
  readonly type = 'caddy';
  readonly name = 'Caddy';

  private get apiUrl(): string {
    return (this.config.apiUrl as string) || 'http://localhost:2019';
  }

  private routeId(projectId: string): string {
    return `labrador-${projectId}`;
  }

  async validateConfig(config: Record<string, any>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.apiUrl) {
      warnings.push('No apiUrl set; defaulting to http://localhost:2019');
    } else if (typeof config.apiUrl !== 'string') {
      errors.push('apiUrl must be a string');
    } else {
      try {
        new URL(config.apiUrl);
      } catch {
        errors.push('apiUrl is not a valid URL');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/config/`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async addRoute(route: ExposureRoute): Promise<void> {
    const id = this.routeId(route.projectId);
    const targetHost = route.targetHost || 'localhost';

    const caddyRoute = {
      '@id': id,
      match: [{ host: [route.domain] }],
      handle: [
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: `${targetHost}:${route.targetPort}` }],
        },
      ],
    };

    const res = await fetch(`${this.apiUrl}/config/apps/http/servers/srv0/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(caddyRoute),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Caddy addRoute failed (${res.status}): ${body}`);
    }
  }

  async updateRoute(route: ExposureRoute): Promise<void> {
    const id = this.routeId(route.projectId);
    const targetHost = route.targetHost || 'localhost';

    const caddyRoute = {
      '@id': id,
      match: [{ host: [route.domain] }],
      handle: [
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: `${targetHost}:${route.targetPort}` }],
        },
      ],
    };

    const res = await fetch(`${this.apiUrl}/id/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(caddyRoute),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Caddy updateRoute failed (${res.status}): ${body}`);
    }
  }

  async removeRoute(routeId: string): Promise<void> {
    const id = this.routeId(routeId);

    const res = await fetch(`${this.apiUrl}/id/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      throw new Error(`Caddy removeRoute failed (${res.status}): ${body}`);
    }
  }

  async getRouteStatus(routeId: string): Promise<RouteStatus> {
    const id = this.routeId(routeId);

    try {
      const res = await fetch(`${this.apiUrl}/id/${id}`);
      if (res.ok) {
        const route = await res.json();
        const domain = route?.match?.[0]?.host?.[0] || 'unknown';
        return { active: true, domain, message: 'Route is active' };
      }
      return { active: false, domain: '', message: 'Route not found' };
    } catch {
      return { active: false, domain: '', message: 'Unable to reach Caddy' };
    }
  }

  async getHealth(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${this.apiUrl}/config/`);
      return {
        healthy: res.ok,
        message: res.ok ? 'Caddy is reachable' : `Caddy returned ${res.status}`,
        lastChecked: new Date(),
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: `Cannot reach Caddy: ${err.message}`,
        lastChecked: new Date(),
      };
    }
  }
}
