# E2E Tests

E2E tests use [Playwright](https://playwright.dev/) and live in `e2e/`. They run against both the Vite dev server (`http://127.0.0.1:5173`) and a real Fastify backend (`http://127.0.0.1:3001`). Only the three external dependencies — Docker daemon, Cloudflare API, and Caddy Admin API — are mocked. All internal server logic (auth, DB, routes, exposure service) runs for real.

## Running

```bash
pnpm exec playwright test          # run all e2e tests
pnpm exec playwright test --ui     # interactive UI mode
```

On CI, the runner uses 1 worker, retries up to 2 times, and reports via the GitHub reporter. Locally it runs fully parallel with no retries.

## Architecture

```
Playwright runner
  ├── globalSetup.ts        starts Fastify on :3001 with mock services + seeded DB
  ├── webServer             starts Vite on :5173 proxying /api → :3001
  └── test workers (×1)
        ├── request.post('/test/reset')         reset DB + mock state between tests
        ├── request.post('/test/mock/docker')   configure Docker fixtures per-test
        └── page.goto('/containers')            real Fastify handles the request
```

### What is mocked

| Dependency | Mock |
|------------|------|
| Docker daemon | `MockDockerService` — in-memory state, no socket |
| Cloudflare API | `MockCloudflareProvider` — configurable responses |
| Caddy Admin API | `MockCaddyProvider` — no-op, always succeeds |

Everything else runs for real: Fastify routing, JWT auth, Drizzle/SQLite, exposure service, WebSocket.

### Test server (`src/server/test-server.ts`)

`createTestServer({ port, dbPath, mocks })` starts Fastify with injected mock services. Only callable outside production. Registers `/test/*` control routes.

### Database seeding (`e2e/helpers/seed.ts`)

`seedDatabase(db)` inserts an admin user and sets `needsOnboarding: false`. Called at startup and on each `/test/reset`.

### Test control API

Registered only when `NODE_ENV=test`. Tests call these via `request` (Playwright's `APIRequestContext`) to set up state before navigating.

| Method | Path | Body | Effect |
|--------|------|------|--------|
| POST | `/test/reset` | `{ seed?: boolean }` | Truncate all tables, reset mock state. `seed` defaults to `true`; pass `false` for a fresh empty DB (needed by onboarding tests). |
| POST | `/test/mock/docker` | `{ containers, images, networks }` | Replace mock Docker state |
| POST | `/test/mock/cloudflare` | `{ accounts, tunnels }` | Replace mock Cloudflare state |

### Vite proxy

`vite.config.ts` reads `VITE_BACKEND_PORT` (defaults to `3000`). Playwright passes `VITE_BACKEND_PORT=3001` so Vite forwards `/api` to the test server.

### Server singleton (`e2e/server-singleton.ts`)

Module-level singleton (`setServer` / `getServer`) shared between `global-setup.ts` and `global-teardown.ts` so teardown can close the Fastify instance.

## Test pattern

```ts
test.beforeEach(async ({ request }) => {
  await request.post('/test/reset');
});

test('containers page renders rows', async ({ page, request }) => {
  await request.post('/test/mock/docker', {
    data: { containers: [{ Id: 'abc123', Names: ['/nginx'], Image: 'nginx:latest', State: 'running' }] },
  });
  await page.goto('/containers');
  await expect(page.getByText('nginx')).toBeVisible();
});
```

For onboarding tests, pass `{ seed: false }` to reset so the DB starts empty (`needsOnboarding: true`):

```ts
await request.post('/test/reset', { data: { seed: false } });
```

## Coverage

### Auth routing

| Test | What it verifies |
|------|-----------------|
| Unauthenticated redirect | `GET /` redirects to `/login` |
| Onboarding redirect | `GET /` redirects to `/onboarding` when DB has no user |
| Authenticated dashboard | `GET /` stays at `/` and renders Dashboard |

### Login form

| Test | What it verifies |
|------|-----------------|
| Empty-field validation | Submitting with no input shows Zod validation messages |
| Invalid credentials toast | A 401 from the real auth route surfaces the error in a toast |

### Onboarding happy path

Stateful multi-step test that:

1. Lands on `/onboarding` (empty DB, `needsOnboarding: true`).
2. Fills in username/password → real `POST /api/auth/register` creates the user.
3. Configures Cloudflare provider (mock Cloudflare returns accounts/tunnels).
4. Completes onboarding → real `POST /api/settings/onboarding` writes to DB.
5. Navigates to `/` → Dashboard is shown (real auth status from DB).

### Docker resources

| Test | What it verifies |
|------|-----------------|
| Containers page | Renders rows from mock Docker state |
| Images page | Renders rows with formatted size |
| Networks page | Renders rows with driver and scope |
