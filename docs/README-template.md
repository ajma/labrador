# HomelabMan - README Template

Use this as the basis for the project's root README.md when the project is ready.

---

# HomelabMan

> Docker management made simple. A web-based application to manage Docker Compose stacks with intelligent exposure via Caddy, Cloudflare, and more.

## Features

- Docker Compose Management - Create, deploy, and manage compose stacks
- Flexible Exposure - Caddy, Cloudflare Tunnels, or custom providers
- Real-time Monitoring - Container stats, uptime, and update detection
- Version Control - Snapshot and restore compose configurations
- Responsive UI - Optimized for desktop and mobile
- Extensible - Plugin-based exposure provider system

## Quick Start

**Run with Docker:**
```bash
docker run -d \
  --name homelabman \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v homelabman-data:/data \
  -e JWT_SECRET=your-random-secret-here \
  homelabman:latest
```

**Or with Docker Compose:**
```yaml
services:
  homelabman:
    image: homelabman:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - homelabman-data:/data
    environment:
      JWT_SECRET: ${JWT_SECRET}
    restart: unless-stopped

volumes:
  homelabman-data:
```

Then open http://localhost:3000 in your browser.

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_PATH` | Path to SQLite database file | No | `/data/homelabman.db` |
| `JWT_SECRET` | Secret for JWT token signing | Yes | - |
| `PORT` | Application port | No | `3000` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | No | `info` |

## Requirements

- Docker Engine 20.10+
- Docker Compose 2.0+ (for managed projects)
- 512MB RAM minimum (1GB+ recommended)
- External Caddy server (if using Caddy exposure)
- Cloudflare account (if using Cloudflare Tunnel exposure)

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, shadcn/ui, TailwindCSS
- **Backend**: Node.js, Fastify, TypeScript
- **Database**: SQLite with better-sqlite3
- **Docker**: dockerode for Docker API integration
- **Real-time**: Socket.io for live container stats

## Development

```bash
git clone https://github.com/yourusername/homelabman.git
cd homelabman
pnpm install
pnpm dev
```

## License

MIT
