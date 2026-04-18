export interface User {
  id: string;
  username: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuthStatus {
  needsOnboarding: boolean;
  authenticated: boolean;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  domainName: string | null;
  composeContent: string;
  exposureEnabled: boolean;
  exposureProviderId: string | null;
  exposureConfig: string;
  isInfrastructure: boolean;
  status: 'stopped' | 'starting' | 'running' | 'error';
  createdAt: number;
  updatedAt: number;
  deployedAt: number | null;
}

export interface ExposureProviderConfig {
  id: string;
  userId: string;
  providerType: string;
  name: string;
  enabled: boolean;
  configuration: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  id: string;
  userId: string;
  onboardingCompleted: boolean;
  defaultExposureProviderId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContainerStat {
  containerId: string;
  name: string;
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
  networkRx: number;
  networkTx: number;
  status: string;
}

export interface DeploymentProgress {
  stage: string;
  message: string;
  timestamp: number;
}

export interface ContainerUpdate {
  id: string;
  projectId: string;
  containerName: string;
  currentImage: string;
  latestImage: string;
  updateAvailable: boolean;
  checkedAt: number;
}
