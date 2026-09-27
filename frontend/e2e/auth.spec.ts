import { expect, test } from '@playwright/test';

// Requires seeded users: an OWNER and a SALESMAN (override via env).
const OWNER = { email: process.env.E2E_OWNER_EMAIL ?? 'owner@pesticideclub.com', password: process.env.E2E_OWNER_PASSWORD ?? 'Owner-pass-123' };
const SALES = { email: process.env.E2E_SALES_EMAIL ?? 'pos@pesticideclub.com', password: process.env.E2E_SALES_PASSWORD ?? 'Sales-pass-123' };

const signIn = async (page: import('@playwright/test').Page, creds: { email: string; password: string }) => {
  await page.goto('/login');
  await page.fill('#usernameInput', creds.email);
  await page.fill('#passwordInput', creds.password);
  await page.click('#signInBtn');
};

test('unauthenticated visit redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('login form has no prefilled credentials or role chips', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#usernameInput')).toHaveValue('');
  await expect(page.locator('#passwordInput')).toHaveValue('');
  await expect(page.getByText('Operating Role')).toHaveCount(0);
});

test('wrong password shows an error and stays on login', async ({ page }) => {
  await signIn(page, { email: OWNER.email, password: 'wrong-password' });
  await expect(page.getByRole('alert').filter({ hasText: 'Incorrect email or password' })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('empty submit shows validation errors', async ({ page }) => {
  await page.goto('/login');
  await page.click('#signInBtn');
  await expect(page.getByText('Email is required')).toBeVisible();
  await expect(page.getByText('Password is required')).toBeVisible();
});

test('owner signs in with real JWT, sees all nav, and can sign out', async ({ page }) => {
  await signIn(page, OWNER);
  await expect(page).toHaveURL(/\/dashboard/);
  const token = await page.evaluate(() => localStorage.getItem('pesticide_erp_token'));
  expect(token).toBeTruthy();
  expect(token).not.toContain('mock_');
  await expect(page.locator('a[href="/employees"]')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('button', { name: /Shop Owner/ }).click();
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem('pesticide_erp_token'))).toBeNull();
});

test('salesman only gets permitted modules and is blocked from restricted routes', async ({ page }) => {
  await signIn(page, SALES);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('a[href="/employees"]')).toHaveCount(0);
  await expect(page.locator('a[href="/reports"]')).toHaveCount(0);
  await expect(page.locator('a[href="/pos"]')).toBeVisible();
  await page.goto('/reports');
  await expect(page.getByText('Access Restricted')).toBeVisible();
});

test('tampered token is rejected and session ends', async ({ page }) => {
  await signIn(page, OWNER);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.evaluate(() => {
    localStorage.setItem('pesticide_erp_token', 'garbage');
    localStorage.setItem('pesticide_erp_refresh_token', 'garbage');
  });
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});
