import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/test/reset');
});

test('redirects to login when user is unauthenticated', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Sign in to manage your homelab')).toBeVisible();
});

test('redirects to onboarding when instance still needs onboarding', async ({ page }) => {
  await page.request.post('/api/test/reset?seed=false');
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("Let's get your instance set up.")).toBeVisible();
});

test('shows dashboard when authenticated', async ({ page }) => {
  await page.goto('/api/test/session');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('No projects yet. Create your first project to get started.')).toBeVisible();
});

test('shows validation messages when login is submitted with empty fields', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText('String must contain at least 3 character(s)')).toBeVisible();
  await expect(page.getByText('String must contain at least 8 character(s)')).toBeVisible();
});

test('shows API error toast when login credentials are rejected', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin_user');
  await page.getByLabel('Password').fill('wrongpassword');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText('Invalid username or password')).toBeVisible();
});

test('completes onboarding with Cloudflare provider and lands on dashboard', async ({ page }) => {
  await page.request.post('/api/test/reset?seed=false');
  await page.request.post('/api/test/mock/cloudflare', {
    data: {
      accounts: [{ id: 'acc-1', name: 'My Account' }],
      tunnels: [],
      nextTunnel: { tunnelId: 'tunnel-abc', tunnelToken: 'tok-xyz' },
    },
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);

  // Step 1: Create account
  await page.getByLabel('Username').fill('admin_user');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm Password').fill('password123');
  await page.getByRole('button', { name: 'Create Account' }).click();

  // Step 2: Configure Cloudflare provider
  await expect(page.getByRole('heading', { name: 'Configure Exposure Providers' })).toBeVisible();
  await page.getByRole('button', { name: 'Configure' }).last().click();

  await page.getByLabel('API Token').fill('cf-token-123');
  await page.getByRole('button', { name: 'Connect' }).click();

  await expect(page.locator('#cf-tunnel')).toBeVisible();
  await page.getByLabel(/Tunnel Name/).fill('homelab-tunnel');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3: Complete
  await expect(page.getByRole('heading', { name: 'Setup Complete' })).toBeVisible();
  await expect(page.getByText('Exposure providers configured: Cloudflare')).toBeVisible();
  await page.getByRole('button', { name: 'Get Started' }).click();

  await expect(page.getByText('Setup complete! Welcome to HomelabMan.')).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('completes onboarding happy path and lands on dashboard', async ({ page }) => {
  await page.request.post('/api/test/reset?seed=false');

  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Username').fill('admin_user');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm Password').fill('password123');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByRole('heading', { name: 'Configure Exposure Providers' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(page.getByRole('heading', { name: 'Setup Complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Get Started' }).click();

  await expect(page.getByText('Setup complete! Welcome to HomelabMan.')).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
