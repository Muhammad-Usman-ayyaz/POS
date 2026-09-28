import { expect, test } from '@playwright/test';

const OWNER = { email: process.env.E2E_OWNER_EMAIL ?? 'owner@pesticideclub.com', password: process.env.E2E_OWNER_PASSWORD ?? 'Owner-pass-123' };

const ROUTES = [
  '/dashboard', '/pos', '/products', '/inventory', '/stock-movement', '/suppliers', '/purchases',
  '/customers', '/customers/1', '/khata', '/payments', '/sales', '/invoices', '/invoices/1', '/reports',
  '/employees', '/audit-log', '/settings',
];

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.fill('#usernameInput', OWNER.email);
  await page.fill('#passwordInput', OWNER.password);
  await page.click('#signInBtn');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('every page renders without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('page actions raise the shared toast', async ({ page }) => {
  await page.goto('/products');
  await page.getByRole('button', { name: /Print Barcodes/i }).click();
  await expect(page.locator('[data-sonner-toast]')).toBeVisible();
});
