import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/test/reset');
  await page.goto('/api/test/session');
});

test('containers page renders container rows', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: {
      containers: [
        {
          Id: 'abc123def456',
          Names: ['/nginx-proxy'],
          Image: 'nginx:latest',
          State: 'running',
          Status: 'Up 2 hours',
          Created: 1700000000,
          Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }],
          Labels: {},
          ImageID: 'sha256:abc',
          Command: 'nginx',
          HostConfig: { NetworkMode: 'bridge' },
          NetworkSettings: { Networks: {} },
          Mounts: [],
        },
      ],
    },
  });

  await page.goto('/containers');

  await expect(page.getByRole('heading', { name: 'Containers' })).toBeVisible();
  await expect(page.getByText('nginx-proxy')).toBeVisible();
  await expect(page.getByText('nginx:latest')).toBeVisible();
  await expect(page.getByText('running')).toBeVisible();
});

test('images page renders image rows', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: {
      images: [
        {
          Id: 'sha256:deadbeef1234',
          RepoTags: ['nginx:latest'],
          Size: 187654321,
          Created: 1700000000,
          ParentId: '',
          RepoDigests: [],
          VirtualSize: 187654321,
          Labels: {},
          SharedSize: 0,
          Containers: 0,
        },
      ],
    },
  });

  await page.goto('/images');

  await expect(page.getByRole('heading', { name: 'Images' })).toBeVisible();
  await expect(page.getByText('nginx:latest')).toBeVisible();
  await expect(page.getByText('179 MB')).toBeVisible();
});

test('networks page renders network rows', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: {
      networks: [
        {
          Id: 'net123',
          Name: 'bridge',
          Driver: 'bridge',
          Scope: 'local',
          Created: '2024-01-01T00:00:00Z',
          Containers: {},
          Options: {},
          Labels: {},
          Internal: false,
          Attachable: false,
          Ingress: false,
          EnableIPv6: false,
          IPAM: { Driver: 'default', Config: [], Options: {} },
        },
      ],
    },
  });

  await page.goto('/networks');

  await expect(page.getByRole('heading', { name: 'Networks' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'bridge' }).first()).toBeVisible();
  await expect(page.getByText('local')).toBeVisible();
});
