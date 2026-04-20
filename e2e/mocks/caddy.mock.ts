import { BaseProvider } from '../../src/server/services/exposure/providers/base.provider.js';
import type {
  ExposureRoute,
  ValidationResult,
  ProviderHealth,
  RouteStatus,
} from '../../src/shared/exposure/provider.interface.js';

export class MockCaddyProvider extends BaseProvider {
  readonly type = 'caddy';
  readonly name = 'Caddy';

  async validateConfig(_config: Record<string, any>): Promise<ValidationResult> {
    return { valid: true, errors: [], warnings: [] };
  }
  async testConnection() { return true; }
  async addRoute(_route: ExposureRoute) {}
  async updateRoute(_route: ExposureRoute) {}
  async removeRoute(_routeId: string) {}
  async getRouteStatus(_routeId: string): Promise<RouteStatus> {
    return { active: false, domain: '', message: 'mock' };
  }
  async getHealth(): Promise<ProviderHealth> {
    return { healthy: true, message: 'mock', lastChecked: new Date() };
  }
}
