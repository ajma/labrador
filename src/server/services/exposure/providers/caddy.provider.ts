import type {
  ExposureRoute,
  ValidationResult,
  ProviderHealth,
  RouteStatus,
  SetupCheck,
  ProviderSetupResult,
} from "@shared/exposure/provider.interface.js";
import { BaseProvider } from "./base.provider.js";

export class CaddyProvider extends BaseProvider {
  readonly type = "caddy";
  readonly name = "Caddy";

  private get apiUrl(): string {
    return (this.config.apiUrl as string) || "http://localhost:2019";
  }

  private routeId(projectId: string): string {
    return `labrador-${projectId}`;
  }

  async validateConfig(config: Record<string, any>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.apiUrl) {
      warnings.push("No apiUrl set; defaulting to http://localhost:2019");
    } else if (typeof config.apiUrl !== "string") {
      errors.push("apiUrl must be a string");
    } else {
      try {
        new URL(config.apiUrl);
      } catch {
        errors.push("apiUrl is not a valid URL");
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

  private async ensureSrv0(): Promise<void> {
    const res = await fetch(`${this.apiUrl}/config/apps/http/servers/srv0`);
    if (res.ok) return;
    const putRes = await fetch(`${this.apiUrl}/config/apps/http/servers/srv0`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listen: [":443", ":80"], routes: [] }),
    });
    if (!putRes.ok) {
      const body = await putRes.text();
      throw new Error(
        `Failed to bootstrap Caddy srv0 (${putRes.status}): ${body}`,
      );
    }
  }

  async addRoute(route: ExposureRoute): Promise<void> {
    const id = this.routeId(route.projectId);
    const targetHost = route.targetHost || "localhost";

    await this.ensureSrv0();

    const caddyRoute = {
      "@id": id,
      match: [{ host: [route.domain] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: `${targetHost}:${route.targetPort}` }],
        },
      ],
    };

    const res = await fetch(
      `${this.apiUrl}/config/apps/http/servers/srv0/routes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(caddyRoute),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Caddy addRoute failed (${res.status}): ${body}`);
    }
  }

  async updateRoute(route: ExposureRoute): Promise<void> {
    const id = this.routeId(route.projectId);
    const targetHost = route.targetHost || "localhost";

    const caddyRoute = {
      "@id": id,
      match: [{ host: [route.domain] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: `${targetHost}:${route.targetPort}` }],
        },
      ],
    };

    const res = await fetch(`${this.apiUrl}/id/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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
      method: "DELETE",
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
        const domain = route?.match?.[0]?.host?.[0] || "unknown";
        return { active: true, domain, message: "Route is active" };
      }
      return { active: false, domain: "", message: "Route not found" };
    } catch {
      return { active: false, domain: "", message: "Unable to reach Caddy" };
    }
  }

  async checkSetup(): Promise<ProviderSetupResult> {
    const checks: SetupCheck[] = [];

    // Check 1: Admin API reachable
    let config: any;
    try {
      const res = await fetch(`${this.apiUrl}/config/`);
      if (!res.ok) {
        checks.push({
          name: "Admin API",
          passed: false,
          message: `Caddy returned ${res.status}`,
          resolution:
            "Ensure Caddy is running with 'caddy run --resume' and the admin API is enabled.",
        });
        return { allPassed: false, checks };
      }
      config = await res.json();
      checks.push({
        name: "Admin API",
        passed: true,
        message: "Caddy admin API is reachable",
      });
    } catch {
      checks.push({
        name: "Admin API",
        passed: false,
        message: "Could not connect to Caddy admin API",
        resolution: `Verify Caddy is running and accessible at ${this.apiUrl}. Both containers must be on the same Docker network.`,
      });
      return { allPassed: false, checks };
    }

    // Check 2: HTTP server (srv0) exists — bootstrap it if missing
    let srv0 = config?.apps?.http?.servers?.srv0;
    if (srv0) {
      checks.push({
        name: "HTTP Server",
        passed: true,
        message: "Server 'srv0' exists",
      });
    } else {
      try {
        await this.ensureSrv0();
        srv0 = true;
        checks.push({
          name: "HTTP Server",
          passed: true,
          message: "Server 'srv0' was created automatically",
        });
      } catch {
        checks.push({
          name: "HTTP Server",
          passed: false,
          message: "No 'srv0' HTTP server found and auto-creation failed",
          resolution:
            "Check that the Caddy admin API allows configuration changes.",
        });
      }
    }

    // Check 3: Config is writable (POST a test route then DELETE it)
    if (srv0) {
      try {
        // Clean up any leftover test route from a prior failed run
        await fetch(`${this.apiUrl}/id/labrador-setup-check`, {
          method: "DELETE",
        });

        const res = await fetch(
          `${this.apiUrl}/config/apps/http/servers/srv0/routes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              "@id": "labrador-setup-check",
              match: [{ host: ["labrador-setup-check.invalid"] }],
              handle: [{ handler: "static_response", body: "ok" }],
            }),
          },
        );
        if (res.ok) {
          const delRes = await fetch(`${this.apiUrl}/id/labrador-setup-check`, {
            method: "DELETE",
          });
          if (!delRes.ok) {
            console.warn(
              `Failed to clean up setup-check route: ${delRes.status}`,
            );
          }
          checks.push({
            name: "Config Writable",
            passed: true,
            message: "Can add and remove routes",
          });
        } else {
          const body = await res.text();
          checks.push({
            name: "Config Writable",
            passed: false,
            message: `Failed to write test route (${res.status}): ${body}`,
            resolution:
              "Check that the Caddy admin API allows configuration changes.",
          });
        }
      } catch (err: any) {
        checks.push({
          name: "Config Writable",
          passed: false,
          message: `Error testing config write: ${err.message}`,
          resolution: "Check network connectivity to the Caddy admin API.",
        });
      }
    } else {
      checks.push({
        name: "Config Writable",
        passed: false,
        message: "Skipped — srv0 is not available",
        resolution: "Resolve the HTTP Server check first.",
      });
    }

    return { allPassed: checks.every((c) => c.passed), checks };
  }

  async getHealth(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${this.apiUrl}/config/`);
      return {
        healthy: res.ok,
        message: res.ok ? "Caddy is reachable" : `Caddy returned ${res.status}`,
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
