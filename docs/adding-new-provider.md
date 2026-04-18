# Adding a New Exposure Provider

This guide walks you through creating a custom exposure provider for HomelabMan.

## Overview

Exposure providers are plugins that handle exposing Docker services to the internet or local network. HomelabMan uses a standardized interface that makes adding new providers straightforward.

**Examples of providers:**
- Caddy - Reverse proxy with automatic HTTPS
- Cloudflare Tunnel - Zero-trust tunnel
- Traefik - Dynamic reverse proxy
- Nginx Proxy Manager - Web UI proxy manager
- HAProxy - High-performance load balancer
- Tailscale Funnel - Tailscale network exposure

## Prerequisites

- TypeScript knowledge
- Understanding of your target proxy/tunnel system
- Familiarity with its API or configuration method

## Steps

### 1. Create provider class

Create a new file in `src/server/services/exposure/providers/`:

```typescript
// src/server/services/exposure/providers/traefik.provider.ts

import { ExposureProvider, ExposureRoute, ValidationResult, ProviderHealth, RouteStatus } from '../../../../shared/exposure/provider.interface';

export class TraefikProvider implements ExposureProvider {
  readonly type = 'traefik';
  readonly name = 'Traefik';

  private apiUrl: string = '';
  private provider: 'docker' | 'file' = 'docker';

  async initialize(config: Record<string, any>): Promise<void> {
    this.apiUrl = config.api_url;
    this.provider = config.provider || 'docker';
    const healthy = await this.testConnection();
    if (!healthy) throw new Error('Cannot connect to Traefik API');
  }

  async validateConfig(config: Record<string, any>): Promise<ValidationResult> {
    const errors: string[] = [];
    if (!config.api_url) errors.push('API URL is required');
    if (config.api_url && !config.api_url.startsWith('http')) {
      errors.push('API URL must start with http:// or https://');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/api/version`, { signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch { return false; }
  }

  async addRoute(route: ExposureRoute): Promise<void> {
    if (this.provider === 'docker') {
      // Docker provider: labels are injected into the compose YAML via injectLabels()
      // The labels are stored in exposure_config and merged at deploy time
    } else {
      // File provider: update Traefik dynamic config file
    }
  }

  async updateRoute(route: ExposureRoute): Promise<void> {
    await this.removeRoute(route.projectId);
    await this.addRoute(route);
  }

  async removeRoute(routeId: string): Promise<void> {
    if (this.provider === 'docker') {
      // Labels are removed when container is stopped
    } else {
      // Remove from config file
    }
  }

  async getRouteStatus(routeId: string): Promise<RouteStatus> {
    try {
      const response = await fetch(`${this.apiUrl}/api/http/routers`);
      const routers = await response.json();
      const router = routers.find((r: any) => r.name.includes(routeId));
      return { active: !!router, domain: router?.rule || '', message: router?.status || 'Unknown' };
    } catch {
      return { active: false, domain: '', message: 'Error checking status' };
    }
  }

  async getHealth(): Promise<ProviderHealth> {
    const healthy = await this.testConnection();
    return { healthy, message: healthy ? 'Traefik is responding' : 'Cannot connect to Traefik', lastChecked: new Date() };
  }

  async cleanup(): Promise<void> {
    // Remove all routes managed by this provider
  }

  // Optional: return compose YAML to deploy Traefik as an infrastructure project
  getComposeTemplate(config: Record<string, any>): string | null {
    return `
services:
  traefik:
    image: traefik:v3
    command:
      - --api.insecure=true
      - --providers.docker=true
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
`.trim();
  }
}
```

### 2. Register the provider

```typescript
// src/server/index.ts
import { TraefikProvider } from './services/exposure/providers/traefik.provider';
registry.register(new TraefikProvider());
```

### 3. Implement compose template (optional)

If your provider's service can run as a Docker container, implement `getComposeTemplate()`. During setup, if this returns a compose YAML string, the UI offers to deploy it as a HomelabMan infrastructure project. The project is created with `is_infrastructure: true` and managed like any other project on the dashboard.

If the user already runs the service externally, they skip deployment and just provide the connection details (API URL, etc.).

### 4. Add frontend configuration form

```typescript
// src/web/components/exposure-providers/TraefikConfigForm.tsx
// Form fields: api_url (URL input), provider ('docker' | 'file' select)
```

### 5. Update provider type list (optional)

```typescript
// src/shared/schemas.ts
export const EXPOSURE_PROVIDER_TYPES = ['caddy', 'cloudflare', 'traefik'] as const;
```

## Testing checklist

- [ ] Config validation works
- [ ] Connection test succeeds
- [ ] Routes are added correctly
- [ ] Routes are updated correctly
- [ ] Routes are removed on cleanup
- [ ] Health check works
- [ ] `getComposeTemplate()` returns valid compose YAML (if implemented)
- [ ] Infrastructure project deploys and runs correctly
- [ ] Frontend form works
