import { expect, test } from '@playwright/test';

const unmanaged = (stackName: string, workingDir = '/srv/myapp') => ({
  Id: `${stackName}-web-1-id`,
  Names: [`/${stackName}-web-1`],
  Image: 'nginx:latest',
  State: 'running',
  Status: 'Up 2 hours',
  Created: 1700000000,
  Ports: [],
  Labels: {
    'com.docker.compose.project': stackName,
    'com.docker.compose.project.working_dir': workingDir,
  },
  ImageID: 'sha256:abc',
  Command: 'nginx',
  HostConfig: { NetworkMode: 'bridge' },
  NetworkSettings: { Networks: {} },
  Mounts: [],
});

const orphaned = (stackName: string, projectId: string) => ({
  ...unmanaged(stackName),
  Labels: {
    'com.docker.compose.project': stackName,
    'com.docker.compose.project.working_dir': '/srv/myapp',
    'labrador.managed': 'true',
    'labrador.project_id': projectId,
  },
});

const withLogo = (stackName: string, logoUrl: string) => ({
  ...unmanaged(stackName),
  Labels: {
    ...unmanaged(stackName).Labels,
    'labrador.logo_url': logoUrl,
  },
});

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/test/reset');
  await page.goto('/api/test/session');
});

// --- Zero-state dashboard ---

test('zero-state dashboard shows adoptable checklist when unmanaged stacks exist', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: { containers: [unmanaged('myapp')] },
  });

  await page.goto('/');

  await expect(page.getByText('myapp', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /adopt selected/i })).toBeVisible();
});

test('zero-state dashboard hides checklist when no adoptable stacks', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', { data: { containers: [] } });

  await page.goto('/');

  await expect(page.getByRole('button', { name: /adopt selected/i })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /create project/i })).toBeVisible();
});

test('adopting from dashboard zero-state creates a project', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: { containers: [unmanaged('myapp')] },
  });

  await page.goto('/');
  await page.getByRole('button', { name: /adopt selected/i }).click();

  await expect(page.getByText('Adopted 1 stack')).toBeVisible();
  await expect(page.getByText('Nothing deployed yet')).not.toBeVisible();
});

// --- New project page banner ---

test('new project page shows banner when adoptable stacks exist', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: { containers: [unmanaged('myapp')] },
  });

  await page.goto('/projects/new');

  await expect(page.getByText(/1 existing stack can be adopted/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adopt' })).toBeVisible();
});

test('new project page hides banner when no adoptable stacks', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', { data: { containers: [] } });

  await page.goto('/projects/new');

  await expect(page.getByText(/existing stack/i)).not.toBeVisible();
});

test('adopt button on new project page opens dialog', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: { containers: [unmanaged('myapp')] },
  });

  await page.goto('/projects/new');
  await page.getByRole('button', { name: 'Adopt' }).click();

  await expect(page.getByRole('heading', { name: 'Adopt stacks' })).toBeVisible();
  await expect(page.getByText('myapp', { exact: true })).toBeVisible();
});

test('adopting from dialog closes it and shows success toast', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: { containers: [unmanaged('myapp')] },
  });

  await page.goto('/projects/new');
  await page.getByRole('button', { name: 'Adopt' }).click();
  await page.getByRole('button', { name: /adopt selected/i }).click();

  await expect(page.getByText('Adopted 1 stack')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Adopt stacks' })).not.toBeVisible();
});

// --- Adopt variations ---

test('orphaned stack (has labrador label but no matching project) is adoptable', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: { containers: [orphaned('myapp', 'deleted-uuid-1234')] },
  });

  await page.goto('/');

  await expect(page.getByText('myapp', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /adopt selected/i })).toBeVisible();
});

test('slug conflict shows warning toast with reason', async ({ page }) => {
  // Adopt myapp first so the slug exists
  await page.request.post('/api/test/mock/docker', {
    data: { containers: [unmanaged('myapp')] },
  });
  await page.goto('/');
  await page.getByRole('button', { name: /adopt selected/i }).click();
  await page.waitForSelector('text=Adopted 1 stack');

  // Now try to adopt myapp again via API — mock still has the container
  const res = await page.request.post('/api/projects/adopt', {
    data: { stackNames: ['myapp'] },
  });
  const body = await res.json();
  expect(body.failed).toEqual([{ stackName: 'myapp', reason: 'slug already exists' }]);
});

test('adopting stack with logo label restores logo on project', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: { containers: [withLogo('myapp', 'https://example.com/logo.png')] },
  });

  await page.goto('/');
  await page.getByRole('button', { name: /adopt selected/i }).click();
  await page.waitForSelector('text=Adopted 1 stack');

  const projects = await page.request.get('/api/projects');
  const list = await projects.json();
  expect(list[0].logoUrl).toBe('https://example.com/logo.png');
});

test('partial batch adoption returns correct adopted and failed arrays', async ({ page }) => {
  await page.request.post('/api/test/mock/docker', {
    data: {
      containers: [
        unmanaged('goodapp', '/srv/goodapp'),
        { ...unmanaged('badapp', '/srv/badapp'), Id: 'badapp-id' },
      ],
    },
  });

  // Pre-create badapp so it conflicts
  await page.request.post('/api/projects/adopt', { data: { stackNames: ['badapp'] } });

  // Now try to adopt both
  const res = await page.request.post('/api/projects/adopt', {
    data: { stackNames: ['goodapp', 'badapp'] },
  });
  const body = await res.json();
  expect(body.adopted).toEqual(['goodapp']);
  expect(body.failed[0].stackName).toBe('badapp');
  expect(body.failed[0].reason).toBe('slug already exists');
});
