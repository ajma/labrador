export interface SetupCheck {
  name: string;
  passed: boolean;
  message: string;
  resolution?: string;
}

export interface ProviderSetupResult {
  allPassed: boolean;
  checks: SetupCheck[];
}

export interface ExposureProvider {
  readonly type: string;
  readonly name: string;
  readonly containerImage?: string;

  initialize(config: Record<string, any>): Promise<void>;
  validateConfig(config: Record<string, any>): Promise<ValidationResult>;
  testConnection(): Promise<boolean>;

  addRoute(route: ExposureRoute): Promise<void>;
  updateRoute(route: ExposureRoute): Promise<void>;
  removeRoute(routeId: string): Promise<void>;
  getRouteStatus(routeId: string): Promise<RouteStatus>;

  getHealth(): Promise<ProviderHealth>;
  cleanup(): Promise<void>;

  listDomains?(): Promise<string[]>;
  checkSetup?(): Promise<ProviderSetupResult>;
  getComposeTemplate?(config: Record<string, any>): string | null;
}

export interface ExposureRoute {
  projectId: string;
  domain: string;
  targetPort: number;
  targetHost?: string;
  path?: string;
  tls?: boolean;
  additionalConfig?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface ProviderHealth {
  healthy: boolean;
  message?: string;
  lastChecked: Date;
}

export interface RouteStatus {
  active: boolean;
  domain: string;
  message?: string;
}
