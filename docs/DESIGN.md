# HomelabMan - Docker Management Web Application
## Design Document

---

## 1. Technology Stack Recommendations

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite (fast dev experience, optimized builds)
- **UI Library**: shadcn/ui (built on Radix UI + Tailwind CSS)
  - Modern, accessible components
  - Easy customization
  - Mobile-responsive by default
- **State Management**: TanStack Query (React Query) for server state + Zustand for client state
- **Form Handling**: React Hook Form + Zod for validation
- **Code Editor**: CodeMirror 6 + @codemirror/lang-yaml (lightweight YAML editing with syntax highlighting)
- **Icons**: Lucide React
- **Routing**: React Router v6

### Backend
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Fastify (faster than Express, built-in TypeScript support)
- **Static Files**: @fastify/static (serve frontend build from `dist/web/`)
- **Docker Integration**: dockerode (official Docker Engine API client)
- **Docker Compose**: spawn `docker compose` CLI via `execa`
- **Validation**: Zod (shared schemas between frontend/backend)
- **Authentication**: @fastify/jwt + bcrypt
- **WebSockets**: @fastify/websocket (real-time container stats, uses native ws library)

### Database
- **Primary**: SQLite with better-sqlite3 (simple, embedded, zero-config)
- **ORM**: Drizzle ORM (TypeScript-first, lightweight, excellent DX)
- **Migrations**: Drizzle Kit
- **File Location**: `data/homelabman.db` (persisted via volume mount)
- **Why SQLite**: Perfect for single-instance deployments, no separate database server needed, simple backups (just copy the file), excellent performance for this use case, built-in transactions and ACID compliance

### Infrastructure
- **Container**: Single Docker image with multi-stage build (frontend + backend only)
- **Reverse Proxy**: Caddy v2 (external, user-managed) - controlled via Caddy Admin API
- **Cloudflare**: Cloudflare API (remotely managed tunnels)
- **Deployment**: Single container with volume mounts for Docker socket and data

### DevOps & Tooling
- **Package Manager**: pnpm (single package, no workspaces)
- **Docker Compose Validation**: js-yaml + custom schema validation
- **Server Bundler**: tsup (single-file Node.js bundle for production)
- **Dev Utilities**: concurrently (parallel dev processes), tsx (server hot-reload)
- **Testing**: Vitest (frontend/backend unit tests)
- **E2E Testing**: Playwright (optional, for critical flows)

### Build Pipeline

The project has two separate build targets compiled by different tools:

- **Frontend**: Vite builds `src/web/` → `dist/web/` (static HTML/JS/CSS bundle)
- **Server**: tsup bundles `src/server/` → `dist/server/` (single Node.js bundle)

tsup is chosen over raw `tsc` because it produces a single bundled output file, handles path alias resolution, and tree-shakes unused code — resulting in a smaller Docker image.

**Scripts** (in `package.json`):
```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"tsx watch src/server/index.ts\"",
    "build": "vite build && tsup",
    "preview": "node dist/server/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "test": "vitest",
    "lint": "eslint src/"
  }
}
```

**tsup config** (`tsup.config.ts`):
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/index.ts'],
  outDir: 'dist/server',
  format: ['cjs'],
  target: 'node24',
  clean: true,
  noExternal: [/^@?src\/shared/],
});
```

**How it fits together**:
- `pnpm dev` — Vite dev server (port 5173) proxies `/api` and `/ws` to the Fastify backend (port 3000) via `vite.config.ts` `server.proxy`. `tsx watch` provides server hot-reload.
- `pnpm build` — Vite produces `dist/web/`, tsup produces `dist/server/index.js`. The shared code (`src/shared/`) is inlined into both bundles by their respective bundlers.
- **Production** — Fastify serves `dist/web/` as static files via `@fastify/static`, so the entire app runs on a single port (3000).

---

## 2. High-Level Architecture

```
┌───────────────────────────────────────────────────────────┐
│                         Frontend (React)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Dashboard │  │ Project  │  │ Networks │  │ Settings │   │
│  │   View   │  │  Editor  │  │  & Images│  │   View   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└───────────────────────────────────────────────────────────┘
                              ↕ REST + WebSocket
┌───────────────────────────────────────────────────────────┐
│                    Backend API (Fastify)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Auth    │  │ Projects │  │  Docker  │  │ Exposure │   │
│  │ Service  │  │ Service  │  │ Service  │  │ Service  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐                                             │
│  │  Stats   │                                             │
│  │ Service  │                                             │
│  └──────────┘                                             │
└───────────────────────────────────────────────────────────┘
         ↕                    ↕                    ↕
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ SQLite Database │  │  Docker Engine  │  │ Caddy/Cloudflare│
│   (Projects,    │  │   (via socket)  │  │   (Exposure)    │
│    Settings)    │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 3. Key Implementation Phases

### Phase 1–2: Foundation
- Project setup, CI/CD pipeline, database schema, authentication, onboarding

### Phase 3–6: Core Docker Workflow
- Docker service wrapper, project CRUD, compose editor & validation, deployment

### Phase 7: Dashboard
- Card layout, status indicators, project quick actions

### Phase 8: Exposure
- Provider interface & registry, Caddy + Cloudflare providers, auto-exposure on deploy

### Phase 9–10: Monitoring
- Real-time stats via WebSocket, uptime tracking, container update detection

### Phase 11: Network & Image Management
- Network CRUD, image browser, image pull & pruning

### Phase 12: Polish & Documentation
- Mobile refinement, E2E tests, user/deployment docs

---

## 4. Data Models

### Database Schema (Drizzle ORM)

**SQLite type conventions used below:**
- `uuid` → stored as `text`, generated with `crypto.randomUUID()` in application code
- `timestamp` → stored as `integer` (Unix epoch milliseconds), e.g. `Date.now()`. Integer storage is more compact and enables efficient range queries compared to ISO-8601 strings.
- `enum(...)` → stored as `text`, validated at the application layer via Zod
- `text (JSON, ...)` → stored as `text`, serialized/deserialized with `JSON.stringify`/`JSON.parse`
- `boolean` → stored as `integer` (0/1), Drizzle maps this automatically
- `bigint` → stored as `integer` (SQLite integers are 64-bit)
- `decimal` → stored as `real`

#### Users Table
```typescript
{
  id: uuid (primary key)
  username: string (unique)
  password_hash: string
  created_at: timestamp
  updated_at: timestamp
}
```

**Note**: Single-user application. The first admin account is created during the onboarding wizard on first launch.

### Onboarding Flow

On every page load, the frontend calls `GET /api/auth/status` (unauthenticated endpoint). The server checks if any user exists in the database:

- **No users exist** → returns `{ needsOnboarding: true, authenticated: false }`. The frontend redirects to `/onboarding`.
- **User exists, not logged in** → returns `{ needsOnboarding: false, authenticated: false }`. The frontend redirects to `/login`.
- **User exists, logged in** → returns `{ needsOnboarding: false, authenticated: true }`. Normal app access.

The onboarding wizard (`/onboarding`) walks through:
1. **Create admin account** — username and password (calls `POST /api/auth/register`)
2. **Configure exposure providers** (optional) — set up Caddy, Cloudflare, or skip
3. **Finalize** — calls `POST /api/settings/onboarding` to save settings and mark setup complete

`POST /api/auth/register` is disabled once a user exists, preventing additional account creation.

#### Settings Table
```typescript
{
  id: uuid (primary key)
  user_id: uuid (foreign key)
  onboarding_completed: boolean (default: false)
  default_exposure_provider_id: uuid (nullable, foreign key to exposure_providers)
  created_at: timestamp
  updated_at: timestamp
}
```

#### Exposure Providers Table
```typescript
{
  id: uuid (primary key)
  user_id: uuid (foreign key)
  provider_type: string (e.g., 'caddy', 'cloudflare')
  name: string (user-friendly name, e.g., "Main Caddy Server")
  enabled: boolean (default: true)
  configuration: text (JSON, provider-specific config, encrypted sensitive fields)
  created_at: timestamp
  updated_at: timestamp
}

// Example configurations:
// Caddy: { "api_url": "http://localhost:2019" }
// Cloudflare: { "api_token": "...", "account_id": "...", "tunnel_id": "..." }
```

#### Projects Table
```typescript
{
  id: uuid (primary key)
  user_id: uuid (foreign key)
  name: string
  slug: string (unique, url-safe identifier)
  logo_url: string (nullable, user-provided URL)
  domain_name: string (nullable)
  compose_content: text (YAML content)
  
  // Exposure configuration (per-project, extensible)
  exposure_enabled: boolean
  exposure_provider_id: uuid (nullable, foreign key to exposure_providers)
  exposure_config: text (JSON, provider-specific config, e.g., port mappings, paths)
  
  is_infrastructure: boolean (default: false)
  status: enum('stopped', 'starting', 'running', 'error')
  created_at: timestamp
  updated_at: timestamp
  deployed_at: timestamp (nullable)
}

// Example exposure_config:
// { "port": 8080, "path": "/", "tls": true }
```

#### Container Stats Table (Time-Series Data)
```typescript
{
  id: uuid (primary key)
  project_id: uuid (foreign key)
  container_name: string
  cpu_usage: decimal
  memory_usage: bigint
  network_rx: bigint
  network_tx: bigint
  uptime_status: enum('up', 'down')
  recorded_at: timestamp
}
```

**Stats Retention**: A background job runs hourly. Raw data points older than 24 hours are aggregated into hourly averages (stored back into the same table) and the raw rows are deleted. Hourly aggregates older than 30 days are deleted. This keeps the table bounded — roughly 720 hourly rows per container per month.

#### Container Updates Table
```typescript
{
  id: uuid (primary key)
  project_id: uuid (foreign key)
  container_name: string
  current_image: string
  latest_image: string
  update_available: boolean
  checked_at: timestamp
}
```

---

## 5. API Design

### REST Endpoints

#### Health
```
GET    /health                     # Returns 200 OK (used by Docker HEALTHCHECK)
```

#### Authentication
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/auth/status          # Returns { needsOnboarding: boolean, authenticated: boolean }
```

#### Projects
```
GET    /api/projects
GET    /api/projects/:id
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id
POST   /api/projects/:id/deploy
POST   /api/projects/:id/stop
POST   /api/projects/:id/restart
GET    /api/projects/:id/logs
POST   /api/compose/validate
```

#### Docker Resources
```
GET    /api/docker/networks
POST   /api/docker/networks
DELETE /api/docker/networks/:id
GET    /api/docker/images
DELETE /api/docker/images/:id
POST   /api/docker/images/:id/pull
```

#### Settings
```
GET    /api/settings
PUT    /api/settings
POST   /api/settings/onboarding
```

#### Stats
```
GET    /api/projects/:id/stats?range=24h
GET    /api/projects/:id/uptime
GET    /api/projects/:id/updates
```

### WebSocket Events (`@fastify/websocket`)

**Endpoint**: `GET /ws` (upgraded to WebSocket)

Messages are JSON with a `type` field. Client sends:
- `{ type: "subscribe", projectId }` — start receiving stats/events for a project
- `{ type: "unsubscribe", projectId }` — stop receiving

Server sends:
- `{ type: "stats:update", projectId, containers: [...] }`
- `{ type: "container:status", projectId, containerId, status }`
- `{ type: "deployment:progress", projectId, stage, message }`
- `{ type: "deployment:complete", projectId, status }`
- `{ type: "deployment:error", projectId, error }`

---

## 6. Integration Points

### Docker API Integration (dockerode)

**Location**: `src/server/services/docker.service.ts`

**Responsibilities**:
- Connect to Docker socket (`/var/run/docker.sock`)
- List containers with filters (project labels)
- Execute docker-compose up/down via spawn
- Stream logs with tail
- Collect container stats in real-time
- Monitor container events (start, stop, die, health_status)
- List/prune networks and images
- Pull images with progress tracking

**Startup Reconciliation**: On application boot, the Docker service scans for all containers with the `homelabman.managed=true` label, groups them by `homelabman.project_id`, and reconciles each project's `status` field in the database:
- All containers running → set status to `running`
- All containers stopped → set status to `stopped`
- Mixed or missing containers → set status to `error`
- Project in DB but no containers found → set status to `stopped`

This handles HomelabMan restarts, host reboots, and containers that were started/stopped externally. The reconciliation runs once at startup before the server begins accepting requests.

### Caddy Integration

**Location**: `src/server/services/exposure/providers/caddy.provider.ts`

**Implements**: `ExposureProvider` interface

**Responsibilities**:
- Connect to external Caddy instance via Admin API (user-provided URL)
- Generate Caddy JSON config for new routes
- Add/update routes via Caddy Admin API (POST /config/)
- Configure reverse proxy routes: domain → container:port
- Automatic HTTPS handled by Caddy's ACME support
- Remove routes when projects are deleted (DELETE /id/{route-id})
- Verify Caddy connectivity and health

**How it works**:
- Caddy provider is available by default (shown in onboarding)
- User provides Caddy Admin API URL (e.g., `http://localhost:2019`)
- HomelabMan connects to existing Caddy instance
- Routes are added/removed via Caddy's Admin API
- No Caddy binary included in HomelabMan container

**Example Caddy Config Generation**:
```json
{
  "apps": {
    "http": {
      "servers": {
        "srv0": {
          "routes": [
            {
              "match": [{"host": ["myapp.example.com"]}],
              "handle": [{
                "handler": "reverse_proxy",
                "upstreams": [{"dial": "localhost:8080"}]
              }]
            }
          ]
        }
      }
    }
  }
}
```

### Cloudflare Tunnel Integration (Remotely Managed)

**Location**: `src/server/services/exposure/providers/cloudflare.provider.ts`

**Implements**: `ExposureProvider` interface

**Approach**: Uses **remotely managed tunnels** exclusively. The user runs `cloudflared` on their own (as a Docker container, systemd service, etc.) and connects it to a Cloudflare tunnel. HomelabMan manages the tunnel's public hostnames via the Cloudflare API — it never starts, stops, or touches the `cloudflared` process.

**Responsibilities**:
- Add/update/remove public hostnames on an existing tunnel via Cloudflare API (`PUT /accounts/{account_id}/cfe/tunnel/{tunnel_id}/configurations`)
- Validate API token permissions and tunnel connectivity
- Monitor tunnel health via API (`GET /accounts/{account_id}/cfe/tunnel/{tunnel_id}`)
- Clean up public hostnames on project deletion

**Note**: DNS records (CNAME to `{tunnel_id}.cfargotunnel.com`) are created and deleted automatically by Cloudflare when public hostnames are added/removed from the tunnel config. No separate DNS API calls needed.

**What HomelabMan does NOT do**:
- Does not install, start, stop, or manage the `cloudflared` daemon
- Does not generate local config.yml files
- Does not store tunnel credentials files

**Example API flow** (adding a route):
1. Fetch current tunnel config: `GET /accounts/{account_id}/cfe/tunnel/{tunnel_id}/configurations`
2. Append new public hostname entry: `{ "hostname": "myapp.example.com", "service": "http://localhost:8080" }`
3. Update tunnel config: `PUT /accounts/{account_id}/cfe/tunnel/{tunnel_id}/configurations`
   Cloudflare automatically creates the CNAME DNS record for the hostname.

**Required user configuration** (stored in exposure_providers table):
```json
{
  "api_token": "...",
  "account_id": "...",
  "tunnel_id": "..."
}
```

**Optional: Deploy as infrastructure project** (via `ExposureProvider.getComposeTemplate()`):

During setup, if `getComposeTemplate()` returns a compose YAML, the UI offers to deploy the provider's service as a HomelabMan infrastructure project. This is the same project system used for user projects — it appears on the dashboard, can be stopped/started, and gets the same lifecycle management. For Cloudflare, this:
1. Creates a new tunnel via the Cloudflare API and retrieves its token
2. Calls `getComposeTemplate()` which returns compose YAML for `cloudflare/cloudflared`
3. Creates a project with `name: "cloudflared"` and a system flag to mark it as infrastructure
4. Deploys it like any other project

The user can skip this and point at an existing tunnel instead. The same pattern works for any provider — e.g., a Caddy provider's template deploys `caddy:latest`.

### Docker Compose Validation

**Location**: `src/server/services/compose-validator.service.ts`

**Responsibilities**:
- Parse YAML with js-yaml
- Validate against docker-compose schema
- Check for required fields (services, etc.)
- Validate port mappings, volume syntax, network references
- Return user-friendly error messages with line numbers
- Real-time validation via debounced API calls from CodeMirror editor

---

## 7. Exposure Provider Architecture

All exposure providers implement a common interface for code consistency. Adding a new provider requires modifying application code: implementing the interface, registering the provider at startup, and adding a frontend config form. See `docs/adding-new-provider.md` for a full walkthrough.

### Provider Interface

```typescript
// src/shared/exposure/provider.interface.ts

export interface ExposureProvider {
  // Provider metadata
  readonly type: string; // e.g., 'caddy', 'cloudflare', 'traefik'
  readonly name: string; // Human-readable name
  
  // Lifecycle methods
  initialize(config: Record<string, any>): Promise<void>;
  validateConfig(config: Record<string, any>): Promise<ValidationResult>;
  testConnection(): Promise<boolean>;
  
  // Route management
  addRoute(route: ExposureRoute): Promise<void>;
  updateRoute(route: ExposureRoute): Promise<void>;
  removeRoute(routeId: string): Promise<void>;
  getRouteStatus(routeId: string): Promise<RouteStatus>;
  
  // Health and monitoring
  getHealth(): Promise<ProviderHealth>;
  cleanup(): Promise<void>;
  
  // Optional: generate a compose YAML to deploy this provider's service
  // as a HomelabMan infrastructure project (e.g., cloudflared, caddy, traefik)
  getComposeTemplate?(config: Record<string, any>): string | null;
}

export interface ExposureRoute {
  projectId: string;
  domain: string;
  targetPort: number;
  targetHost?: string; // defaults to localhost
  path?: string; // defaults to /
  tls?: boolean; // defaults to true
  additionalConfig?: Record<string, any>; // provider-specific
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
```

### Built-in Providers

**Location**: `src/server/services/exposure/providers/`

```
providers/
├── index.ts                    # Provider exports
├── base.provider.ts            # Abstract base class
├── caddy.provider.ts           # Caddy implementation
├── cloudflare.provider.ts      # Cloudflare Tunnel implementation
└── README.md                   # Guide for adding new providers
```

### Provider Registry

```typescript
// src/server/services/exposure/provider-registry.ts

export class ExposureProviderRegistry {
  private providers: Map<string, ExposureProvider> = new Map();
  
  register(provider: ExposureProvider): void {
    this.providers.set(provider.type, provider);
  }
  
  get(type: string): ExposureProvider | undefined {
    return this.providers.get(type);
  }
  
  getAll(): ExposureProvider[] {
    return Array.from(this.providers.values());
  }
  
  getAvailableTypes(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Initialize in app startup (src/server/index.ts)
const registry = new ExposureProviderRegistry();

// Built-in providers - automatically registered, shown in onboarding
registry.register(new CaddyProvider());
registry.register(new CloudflareProvider());

// Additional providers can be registered here
// registry.register(new TraefikProvider());
// registry.register(new NginxProxyManagerProvider());
```

Caddy and Cloudflare are registered at startup and available during onboarding. Provider configuration (API URLs, tokens, etc.) is managed in the Settings page. To add a new provider, see `docs/adding-new-provider.md`.

### Exposure Service (Orchestrator)

```typescript
// src/server/services/exposure/exposure.service.ts

export class ExposureService {
  constructor(
    private registry: ExposureProviderRegistry,
    private db: Database
  ) {}
  
  async addProjectExposure(projectId: string): Promise<void> {
    const project = await this.db.getProject(projectId);
    if (!project.exposure_enabled || !project.exposure_provider_id) {
      return;
    }
    
    const providerConfig = await this.db.getExposureProvider(
      project.exposure_provider_id
    );
    
    // Get the appropriate provider from registry
    const provider = this.registry.get(providerConfig.provider_type);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerConfig.provider_type}`);
    }
    
    // Initialize and add route
    await provider.initialize(providerConfig.configuration);
    await provider.addRoute({
      projectId: project.id,
      domain: project.domain_name,
      ...project.exposure_config,
    });
  }
  
  async removeProjectExposure(projectId: string): Promise<void> {
    const project = await this.db.getProject(projectId);
    if (!project.exposure_provider_id) return;
    
    const providerConfig = await this.db.getExposureProvider(
      project.exposure_provider_id
    );
    const provider = this.registry.get(providerConfig.provider_type);
    if (!provider) return;
    
    await provider.initialize(providerConfig.configuration);
    await provider.removeRoute(projectId);
  }
}
```


---

## 8. Security and Deployment Considerations

### Security

#### 1. Authentication & Authorization
- JWT tokens with httpOnly cookies
- CSRF protection for state-changing operations
- Rate limiting on auth endpoints
- Password hashing with bcrypt (cost factor: 12)

#### 2. Docker Socket Security
- Run backend with minimal Docker permissions
- Label-based isolation (only manage homelabman-labeled containers)
- Validate compose files to prevent privilege escalation
- Sanitize container names and labels

#### 3. Secrets Management
- Store Cloudflare API tokens encrypted in database
- Use environment variables for sensitive config
- Never expose Docker socket directly to frontend
- Validate and sanitize all YAML input

#### 4. Network Isolation
- Backend API behind reverse proxy
- Separate Docker networks for managed projects
- Firewall rules to restrict access to Docker socket

#### 5. Input Validation
- Zod schemas for all API inputs
- Sanitize domain names and slugs
- Limit compose file size (e.g., 100KB max)

### Deployment Strategy

#### Single Docker Image (Recommended)

All components packaged in one Docker image for simple deployment:

**Multi-Stage Dockerfile:**
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build && pnpm prune --prod

# Stage 2: Final image
FROM node:20-alpine
WORKDIR /app

# Copy built output and production-only dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create data directory for SQLite
RUN mkdir -p /data

# Expose port for the application
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/server/index.js"]
```

**Running the container:**
```bash
docker run -d \
  --name homelabman \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v homelabman-data:/data \
  -e DATABASE_PATH=/data/homelabman.db \
  -e JWT_SECRET=your-secret-here \
  homelabman:latest
```

**Docker Compose:**
```yaml
services:
  homelabman:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - homelabman-data:/data
    environment:
      DATABASE_PATH: /data/homelabman.db
      JWT_SECRET: ${JWT_SECRET}
    restart: unless-stopped

volumes:
  homelabman-data:
```

**How Exposure Works**:
- During onboarding, user configures built-in providers (Caddy and/or Cloudflare) or skips
- Provider configuration is stored in the `exposure_providers` table and managed via the Settings page
- Each project selects which provider to use (or none) via a dropdown
- On deploy: `ExposureService` loads the provider from the registry, calls `provider.addRoute()`
- On delete: calls `provider.removeRoute()` to clean up
- The provider interface and registry are internal abstractions for code maintainability — not a user-facing plugin API
- See section 7 for the provider interface, registry, and service code

### Production Considerations

#### 1. Backups
- Automated SQLite backups (simple file copy with WAL mode, or `.backup` command)
- Use SQLite's backup API or `VACUUM INTO` for consistent backups
- Schedule regular backups (e.g., daily cron job)
- Export project configs
- Backup Caddy/Cloudflare configurations
- Consider using `litestream` for continuous SQLite replication (optional)

#### 2. Monitoring
- Health check endpoints for all services
- Logging with structured JSON (pino for Node.js)
- Error tracking (optional: Sentry integration)
- Metrics collection for container stats

#### 3. Updates & Maintenance
- Database migrations with rollback capability
- Zero-downtime deployments (blue/green or rolling)
- Automatic container image updates (watchtower optional)

#### 4. Resource Limits
- Set memory/CPU limits for managed containers
- Implement project limits (max containers per user)
- Disk space monitoring for volumes
- Enable SQLite WAL (Write-Ahead Logging) mode for better concurrency
- Configure appropriate SQLite busy timeout for concurrent writes

---

## 9. Implementation Roadmap

> **Testing philosophy**: Unit and integration tests are written alongside each phase, not deferred to the end. Each phase should include tests for the services and endpoints it introduces.
>
> **Commit discipline**: Create a git commit at the end of each phase before moving on. Do not include a co-author line.

### Phase 1: Project Setup & CI/CD

**Initialize single-package structure**:
```
homelabman/
├── src/
│   ├── web/                  # React + Vite frontend
│   ├── server/               # Fastify backend
│   └── shared/               # Shared types and schemas
├── package.json              # Single package.json
├── tsconfig.json             # Base TypeScript config
├── vite.config.ts            # Vite config (frontend build)
└── docker-compose.yml        # Dev environment
```

**Backend initialization**:
- Set up Fastify with TypeScript under `src/server/`
- Configure Drizzle ORM + SQLite connection (better-sqlite3)
- Create initial database schema
- Global error handling middleware and structured logging (pino)
- Configure environment variables

**Frontend initialization**:
- Set up Vite + React + TypeScript under `src/web/`
- Install shadcn/ui and Tailwind CSS
- Set up React Router
- Configure TanStack Query
- Create basic layout components
- Error boundaries and toast notification system

**CI/CD pipeline**:
- GitHub Actions workflow: lint, type-check, and test on every push/PR
- Docker image build and push on merge to main
- Dockerfile with multi-stage build (see Section 8)
- `.dockerignore` for clean builds

### Phase 2: Authentication & Onboarding

**Backend**:
- Implement user registration/login endpoints
- JWT token generation and validation with httpOnly cookies
- `GET /api/auth/status` endpoint for onboarding detection
- Settings CRUD operations
- Rate limiting on auth endpoints

**Frontend**:
- Login/register forms
- Protected routes with auth context
- Onboarding wizard (create admin account, optionally configure exposure providers)
- Settings page with exposure provider configuration

### Phase 3: Docker Service Foundation

**Backend**:
- Initialize dockerode connection
- Implement Docker service abstraction layer
- Create docker-compose execution wrapper (via execa)
- Label management system (`homelabman.managed=true`, `homelabman.project_id`)
- Container lifecycle operations (start, stop, restart)
- Log streaming implementation
- Startup reconciliation (scan labeled containers, sync project status)

### Phase 4: Project CRUD & Database

**Backend**:
- Project service implementation
- Project CRUD endpoints
- Slug generation (URL-safe names)
- Compose file storage and retrieval

**Frontend**:
- Project list view (basic table/cards)
- Create project form
- Edit project form
- Delete confirmation modal

### Phase 5: Docker Compose Editor & Validation

**Backend**:
- Compose validation service (js-yaml + custom schema)
- YAML parsing and schema validation
- Error message formatting with line numbers
- Real-time validation endpoint (debounced)

**Frontend**:
- CodeMirror editor integration with YAML syntax highlighting
- Real-time validation feedback in editor
- Auto-save functionality

### Phase 6: Project Deployment

**Backend**:
- Deploy endpoint implementation
- Inject homelabman labels into compose YAML
- Execute docker-compose up with project labels
- Update project status in database
- WebSocket deployment progress events

**Frontend**:
- Deploy button with loading states
- Real-time deployment progress via WebSocket
- Error handling and display
- Success confirmation

### Phase 7: Dashboard

**Backend**:
- Project summary endpoint (status, container count, basic resource info)

**Frontend**:
- Dashboard card layout (responsive grid)
- Status indicators (running, stopped, error)
- Project quick actions (start, stop, restart, open editor)
- Mobile-responsive layout (shadcn/ui defaults + breakpoint tuning)

### Phase 8: Exposure Provider System

**Backend**:
- `ExposureProvider` interface and `ExposureProviderRegistry`
- Abstract base provider class
- Caddy provider: config generation, route CRUD via Admin API, health checks
- Cloudflare provider: tunnel hostname CRUD via Cloudflare API, health monitoring
- `ExposureService` orchestrator: auto-configure on deploy, cleanup on delete
- Detect exposed ports from compose file, generate domain mappings

**Frontend**:
- Per-project exposure config: provider dropdown (None + enabled providers), domain input, port mapping
- Exposure status indicator on project cards
- Provider configuration in Settings page (Caddy API URL, Cloudflare credentials)

### Phase 9: Real-Time Stats & Monitoring

**Backend**:
- Container stats collection service (dockerode stats API)
- WebSocket stats streaming (2s interval)
- Stats aggregation, storage, and retention (hourly rollup, 30-day max)
- Uptime calculation logic
- Historical stats query endpoint

**Frontend**:
- Dashboard enhancement: real-time CPU/RAM display per project
- Uptime history visualization
- WebSocket connection management (subscribe/unsubscribe per project)

### Phase 10: Container Update Detection

**Backend**:
- Image update checking service
- Docker Hub API integration (with rate-limit awareness)
- Compare local vs. latest image digests
- Background job for periodic checks
- Update badge data in API responses

**Frontend**:
- Update badge on project cards
- Update details modal
- One-click update functionality

### Phase 11: Network & Image Management

**Backend**:
- Network CRUD endpoints (list, create, delete)
- Network inspection and filtering
- Image list with size/tags
- Image deletion and pruning
- Image pull with progress tracking

**Frontend**:
- Networks management page with creation form
- Image browser with search
- Image deletion confirmation
- Pull progress indicator

### Phase 12: Polish, Testing & Documentation

**Polish**:
- Mobile refinement (navigation drawer, touch controls, PWA manifest)
- Loading skeletons and empty states
- Keyboard shortcuts
- Graceful degradation for Docker socket disconnection

**Testing**:
- E2E tests for critical user flows (Playwright)
- Integration tests for Docker operations
- Fill any coverage gaps from earlier steps

**Documentation** (see project structure `docs/` tree):
- README.md (project overview, quick start)
- Getting started guide and installation guide
- Configuration reference (environment variables, settings)
- Deployment guide
- Architecture overview
- Exposure provider guides (overview, Caddy, Cloudflare, adding new providers)
- Contributing guide
- Database migration and backup/restore procedures
- Security hardening checklist

---

## 10. Critical Implementation Details

### Docker Compose Execution Pattern

```typescript
// Execute with proper error handling and logging
async deployProject(projectId: string): Promise<void> {
  const project = await this.getProject(projectId);
  
  // Inject homelabman labels into compose YAML before writing
  const labeledCompose = injectLabels(project.compose_content, {
    'homelabman.project_id': projectId,
    'homelabman.managed': 'true',
  });
  
  // Write compose file to temp location
  const composeFile = `/tmp/homelabman/${project.slug}/docker-compose.yml`;
  await fs.writeFile(composeFile, labeledCompose);
  
  // Execute docker compose up
  const result = await execa('docker', [
    'compose',
    '-f', composeFile,
    '-p', project.slug,
    'up', '-d',
  ]);
  
  // Update project status
  await this.updateProjectStatus(projectId, 'running');
}
```

### Real-Time Stats Collection

```typescript
// WebSocket stats streaming (@fastify/websocket)
async streamStats(socket: WebSocket, projectId: string): Promise<void> {
  const containers = await this.docker.listContainers({
    filters: { label: [`homelabman.project_id=${projectId}`] }
  });
  
  const interval = setInterval(async () => {
    const stats = await Promise.all(
      containers.map(c => this.docker.getContainer(c.Id).stats({ stream: false }))
    );
    
    socket.send(JSON.stringify({
      type: 'stats:update',
      projectId,
      containers: stats.map(this.formatStats),
    }));
  }, 2000);
  
  socket.on('close', () => clearInterval(interval));
}
```

### Exposure Cleanup Pattern (Extensible)

```typescript
// Ensure cleanup when deleting projects (works with any provider)
async deleteProject(projectId: string): Promise<void> {
  const project = await this.getProject(projectId);
  
  // Stop containers first
  await this.dockerService.stopProject(projectId);
  
  // Clean up exposure config using provider registry
  if (project.exposure_enabled && project.exposure_provider_id) {
    const providerConfig = await this.db.getExposureProvider(
      project.exposure_provider_id
    );
    
    // Get provider from registry - works for any provider type
    const provider = this.exposureRegistry.get(providerConfig.provider_type);
    if (provider) {
      await provider.initialize(providerConfig.configuration);
      await provider.removeRoute(projectId);
    }
  }
  
  // Remove from database
  await this.db.delete(projects).where(eq(projects.id, projectId));
}
```

---

## 11. Critical Files for Implementation

Based on this design, here are the most critical files for implementing this application:

### Server Core Services
- `src/server/services/docker.service.ts` - Docker API wrapper
- `src/server/services/exposure/exposure.service.ts` - Exposure orchestration service
- `src/server/services/exposure/provider-registry.ts` - Provider registry
- `src/server/services/exposure/providers/base.provider.ts` - Abstract base class
- `src/server/services/exposure/providers/caddy.provider.ts` - Caddy implementation
- `src/server/services/exposure/providers/cloudflare.provider.ts` - Cloudflare implementation
- `src/server/services/exposure/providers/index.ts` - Provider exports
- `src/server/services/project.service.ts` - Project management
- `src/server/services/compose-validator.service.ts` - YAML validation
- `src/server/db/schema.ts` - Database schema definitions

### Server Routes
- `src/server/routes/projects.routes.ts` - Project API endpoints
- `src/server/routes/auth.routes.ts` - Authentication endpoints
- `src/server/routes/docker.routes.ts` - Docker resources endpoints
- `src/server/routes/settings.routes.ts` - Settings and onboarding endpoints

### Web Core Components
- `src/web/pages/Onboarding.tsx` - First-launch setup wizard
- `src/web/pages/Login.tsx` - Authentication page
- `src/web/components/ProjectCard.tsx` - Dashboard cards
- `src/web/components/ComposeEditor.tsx` - CodeMirror editor wrapper
- `src/web/pages/Dashboard.tsx` - Main dashboard view
- `src/web/pages/ProjectEditor.tsx` - Project creation/editing

### Shared
- `src/shared/schemas.ts` - Zod validation schemas (shared between web/server)
- `src/shared/exposure/provider.interface.ts` - Exposure provider interface & types

### Deployment Files
- `Dockerfile` - Multi-stage build combining frontend + backend in single image
- `docker-compose.yml` - Production deployment configuration
- `.dockerignore` - Exclude unnecessary files from image

---

## 12. Project Structure

```
homelabman/
├── src/
│   ├── web/                      # React + Vite frontend
│   │   ├── components/
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── ComposeEditor.tsx
│   │   │   ├── StatsChart.tsx
│   │   │   └── ui/ (shadcn components)
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Onboarding.tsx
│   │   │   ├── ProjectEditor.tsx
│   │   │   ├── Networks.tsx
│   │   │   ├── Images.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   │   ├── useProjects.ts
│   │   │   ├── useStats.ts
│   │   │   └── useWebSocket.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── utils.ts
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── server/                   # Fastify backend
│   │   ├── services/
│   │   │   ├── docker.service.ts
│   │   │   ├── project.service.ts
│   │   │   ├── compose-validator.service.ts
│   │   │   ├── stats.service.ts
│   │   │   └── exposure/
│   │   │       ├── exposure.service.ts          # Orchestration service
│   │   │       ├── provider-registry.ts          # Registry
│   │   │       └── providers/
│   │   │           ├── index.ts                  # Provider exports
│   │   │           ├── base.provider.ts          # Abstract base
│   │   │           ├── caddy.provider.ts         # Caddy implementation
│   │   │           ├── cloudflare.provider.ts    # Cloudflare implementation
│   │   │           └── README.md                 # Guide for adding providers
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── projects.routes.ts
│   │   │   ├── docker.routes.ts
│   │   │   └── settings.routes.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   ├── migrations/
│   │   │   └── index.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── error.middleware.ts
│   │   ├── websocket/
│   │   │   └── stats.handler.ts
│   │   └── index.ts
│   └── shared/                   # Shared types, schemas, interfaces
│       ├── schemas.ts
│       ├── types.ts
│       └── exposure/
│           └── provider.interface.ts         # Provider interface & types
├── Dockerfile                # Multi-stage build for single image
├── docker-compose.yml        # Production deployment
├── docker-compose.dev.yml    # Development environment
├── .dockerignore
├── package.json              # Single package.json
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config (frontend build)
├── tsup.config.ts            # tsup config (server bundle)
├── tailwind.config.ts        # Tailwind CSS config
├── postcss.config.js         # PostCSS config (Tailwind)
├── drizzle.config.ts         # Drizzle Kit config (migrations)
├── .env.example              # Environment variable template
├── README.md
└── docs/
    ├── getting-started.md
    ├── installation.md
    ├── configuration.md
    ├── exposure-providers/
    │   ├── overview.md
    │   ├── adding-new-provider.md
    │   ├── caddy.md
    │   └── cloudflare.md
    ├── architecture.md
    ├── contributing.md
    └── deployment.md
```
