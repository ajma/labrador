import { expect, test } from '@playwright/test';

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

const authenticated = { authenticated: true, needsOnboarding: false };

test('containers page renders container rows', async ({ page }) => {
  await page.route('**/api/auth/status', (route) =>
    route.fulfill(jsonResponse(authenticated)),
  );

  await page.route('**/api/docker/containers', (route) =>
    route.fulfill(jsonResponse([
      {
        Id: 'abc123def456',
        Names: ['/nginx-proxy'],
        Image: 'nginx:latest',
        State: 'running',
        Status: 'Up 2 hours',
        Created: 1700000000,
        Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }],
      },
    ])),
  );

  await page.goto('/containers');

  await expect(page.getByRole('heading', { name: 'Containers' })).toBeVisible();
  await expect(page.getByText('nginx-proxy')).toBeVisible();
  await expect(page.getByText('nginx:latest')).toBeVisible();
  await expect(page.getByText('running')).toBeVisible();
});

test('images page renders image rows', async ({ page }) => {
  await page.route('**/api/auth/status', (route) =>
    route.fulfill(jsonResponse(authenticated)),
  );

  await page.route('**/api/docker/containers', (route) =>
    route.fulfill(jsonResponse([])),
  );

  await page.route('**/api/docker/images', (route) =>
    route.fulfill(jsonResponse([
      {
        Id: 'sha256:deadbeef1234',
        RepoTags: ['nginx:latest'],
        Size: 187654321,
        Created: 1700000000,
      },
    ])),
  );

  await page.goto('/images');

  await expect(page.getByRole('heading', { name: 'Images' })).toBeVisible();
  await expect(page.getByText('nginx:latest')).toBeVisible();
  await expect(page.getByText('179 MB')).toBeVisible();
});

test('networks page renders network rows', async ({ page }) => {
  await page.route('**/api/auth/status', (route) =>
    route.fulfill(jsonResponse(authenticated)),
  );

  await page.route('**/api/docker/networks**', (route) =>
    route.fulfill(jsonResponse({
      data: [
        {
          Id: 'net123',
          Name: 'bridge',
          Driver: 'bridge',
          Scope: 'local',
          Created: '2024-01-01T00:00:00Z',
          Containers: {},
        },
      ],
      total: 1,
    })),
  );

  await page.goto('/networks');

  await expect(page.getByRole('heading', { name: 'Networks' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'bridge' }).first()).toBeVisible();
  await expect(page.getByText('local')).toBeVisible();
});
