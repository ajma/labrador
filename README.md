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

**Run with Docker:**

```bash
docker run -d \
  --name labrador \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v labrador-data:/data \
  -e JWT_SECRET=your-random-secret-here \
  labrador:latest
```

**Or with Docker Compose:**

```yaml
services:
  labrador:
    image: labrador:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - labrador-data:/data
    environment:
      DATABASE_PATH: /data/labrador.db
      JWT_SECRET: ${JWT_SECRET}
    restart: unless-stopped

volumes:
  labrador-data:
```

Then open http://localhost:3000 in your browser.

## Environment Variables

| Variable        | Description                                      | Required | Default             |
| --------------- | ------------------------------------------------ | -------- | ------------------- |
| `DATABASE_PATH` | Path to SQLite database file                     | No       | `/data/labrador.db` |
| `JWT_SECRET`    | Secret for JWT token signing                     | Yes      | —                   |
| `PORT`          | Application port                                 | No       | `3000`              |
| `LOG_LEVEL`     | Logging level (`debug`, `info`, `warn`, `error`) | No       | `info`              |

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
