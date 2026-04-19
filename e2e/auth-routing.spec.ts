import { expect, test } from '@playwright/test';

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

test('redirects to login when user is unauthenticated', async ({ page }) => {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill(jsonResponse({ authenticated: false, needsOnboarding: false }));
  });

  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Sign in to manage your homelab')).toBeVisible();
});

test('redirects to onboarding when instance still needs onboarding', async ({ page }) => {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, needsOnboarding: true }),
    });
  });

  await page.goto('/');

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("Let's get your instance set up.")).toBeVisible();
});

test('shows dashboard when authenticated', async ({ page }) => {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill(jsonResponse({ authenticated: true, needsOnboarding: false }));
  });

  await page.route('**/api/projects', async (route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.goto('/');

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
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill(jsonResponse({ error: 'Invalid credentials' }, 401));
  });

  await page.goto('/login');
  await page.getByLabel('Username').fill('demo-user');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText('Invalid credentials')).toBeVisible();
});

test('completes onboarding happy path and lands on dashboard', async ({ page }) => {
  let onboardingComplete = false;
  let onboardingPayload: unknown;

  await page.route('**/api/auth/status', async (route) => {
    if (onboardingComplete) {
      await route.fulfill(jsonResponse({ authenticated: true, needsOnboarding: false }));
      return;
    }

    await route.fulfill(jsonResponse({ authenticated: false, needsOnboarding: true }));
  });

  await page.route('**/api/auth/register', async (route) => {
    await route.fulfill(jsonResponse({ id: 'user-1' }, 201));
  });

  await page.route('**/api/settings/onboarding', async (route) => {
    onboardingPayload = route.request().postDataJSON();
    onboardingComplete = true;
    await route.fulfill(jsonResponse({ ok: true }));
  });

  await page.route('**/api/projects', async (route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Username').fill('admin_user');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByRole('heading', { name: 'Configure Exposure Providers' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(page.getByRole('heading', { name: 'Setup Complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Get Started' }).click();

  await expect(page.getByText('Setup complete! Welcome to HomelabMan.')).toBeVisible();
  expect(onboardingPayload).toEqual({ exposureProviders: [] });

  // Re-enter protected route after onboarding API completion to validate authenticated state.
  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});