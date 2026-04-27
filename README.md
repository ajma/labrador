# Labrador

> Docker management made simple. A web-based application to manage Docker Compose stacks with intelligent exposure via Caddy, Cloudflare, and more.

## Features

- **Docker Compose Management** — Create, deploy, and manage compose stacks from a browser-based YAML editor
- **Flexible Exposure** — Caddy, Cloudflare Tunnels, or custom providers
- **Adopt Existing Stacks** — Import unmanaged Docker Compose stacks already running on the host
- **Real-time Monitoring** — Container stats, uptime, and image update detection
- **Responsive UI** — Optimized for desktop and mobile
- **Extensible** — Plugin-based exposure provider system

## Quick Start

**Run with Docker Compose** (recommended):

```yaml
services:
  labrador:
    image: labrador:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${DATA_DIR:-./data}:/data
    environment:
      DATABASE_PATH: /data/labrador.db
      HOST_PROJECTS_DIR: ${DATA_DIR:-${PWD}/data}/projects
      JWT_SECRET: ${JWT_SECRET}
    networks:
      - labrador
    restart: unless-stopped
networks:
  labrador:
    name: labrador
```

Then open http://localhost:3000 in your browser.

## Data Directory

Everything Labrador needs to persist is stored under the mounted data directory (`/data` inside the container, bound from the host via `DATA_DIR`). Labrador creates these subdirectories automatically on first use — no manual setup required.

```
/data/
├── labrador.db             # SQLite database (projects, settings, providers, stats)
└── projects/
    ├── my-stack/
    │   ├── docker-compose.yml
    │   ├── Caddyfile          # User-authored config files (if any)
    │   └── nginx.conf
    ├── another-project/
    │   └── docker-compose.yml
    └── …
```

| Path                                 | Purpose                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `labrador.db`                        | Single-file SQLite database. Contains all project definitions (including compose YAML), user accounts, exposure provider configuration, container stats history, and image update records. |
| `projects/<slug>/docker-compose.yml` | Generated compose file for each project, written before every deploy, stop, or restart. Re-generated from the database, so it can be recreated on the next operation.                      |
| `projects/<slug>/<config files>`     | User-authored config files (Caddyfile, nginx.conf, etc.) managed through the UI. These are stored **only on disk** — they are not in the database and cannot be recreated from it.         |

> **Backup**: back up the entire `/data` directory (or your `DATA_DIR` bind mount). The `labrador.db` database contains project definitions, but user-authored config files in `projects/<slug>/` live only on disk and must also be included in backups.

## Environment Variables

| Variable            | Description                                                   | Required | Default             |
| ------------------- | ------------------------------------------------------------- | -------- | ------------------- |
| `DATABASE_PATH`     | Path to SQLite database file                                  | No       | `/data/labrador.db` |
| `JWT_SECRET`        | Secret for JWT token signing                                  | Yes      | —                   |
| `HOST_PROJECTS_DIR` | Absolute host path to projects dir (for bind-mount rewriting) | No       | —                   |
| `DATA_DIR`          | Host path to data directory (used in docker-compose.yml)      | No       | `./data`            |
| `PORT`              | Application port                                              | No       | `3000`              |
| `LOG_LEVEL`         | Logging level (`debug`, `info`, `warn`, `error`)              | No       | `info`              |

### Upgrading from named volumes

If you previously used `labrador-data:/data` (named volume), migrate your data to the new bind-mount layout:

```bash
mkdir -p ./data
docker run --rm -v labrador-data:/from -v $PWD/data:/to alpine cp -a /from/. /to/
docker compose up -d
```

## Requirements

- Docker Engine 20.10+
- Docker Compose 2.0+ (for managed projects)
- 512 MB RAM minimum (1 GB+ recommended)
- External Caddy server (if using Caddy exposure)
- Cloudflare account (if using Cloudflare Tunnel exposure)

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Radix UI, TailwindCSS
- **Backend**: Node.js, Fastify, TypeScript
- **Database**: SQLite via libSQL + Drizzle ORM
- **Docker**: dockerode for Docker API integration
- **Real-time**: WebSockets via @fastify/websocket

## Development

The recommended way to develop is inside a Docker container, which mirrors the production environment and avoids local dependency issues:

```bash
git clone https://github.com/yourusername/labrador.git
cd labrador
pnpm dev:docker
```

This starts Vite (port 5173) and Fastify (port 3000) inside a container with live-reloading via bind mounts. Source changes on your host are reflected immediately.

To develop without Docker:

```bash
pnpm install
pnpm dev
```

## License

MIT
