import { expect, test, type Page } from '@playwright/test';

// Needs the API on :8000 with `manage.py seed_demo_catalog` applied plus the users below.
const login = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.fill('#usernameInput', email);
  await page.fill('#passwordInput', password);
  await page.click('#signInBtn');
  await expect(page).toHaveURL(/\/dashboard/);
};
const owner = (page: Page) => login(page, process.env.E2E_OWNER_EMAIL ?? 'owner@pesticideclub.com', process.env.E2E_OWNER_PASSWORD ?? 'Owner-pass-123');
const rows = (page: Page) => page.locator('tbody tr.table-row-enter');

test('catalog lists real products with live summary and search/filter', async ({ page }) => {
  await owner(page);
  await page.goto('/products');
  await expect(page.getByText('Coragen 20 SC')).toBeVisible();
  await expect(page.getByText('Rs. 4,892,400')).toHaveCount(0); // old hardcoded figure is gone

  await page.fill('#productSearchInput', 'nativo');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Nativo 75 WG');

  await page.fill('#productSearchInput', '');
  await page.locator('select').nth(2).selectOption('out'); // stock filter
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Karate 2.5 EC');
});

test('pagination follows the page size', async ({ page }) => {
  await owner(page);
  await page.goto('/products');
  await page.getByLabel('Rows per page').selectOption('10');
  await expect(page.getByText('to 10 of')).toBeVisible();
});

test('create, edit and delete a product end to end', async ({ page }) => {
  const sku = `E2E-${Date.now()}`;
  await owner(page);
  await page.goto('/products');

  await page.click('#openNewProductBtn');
  await page.getByPlaceholder('e.g. Belt Expert 480 SC').fill('E2E Test Product');
  await page.getByPlaceholder('e.g. SKU-BAY-2024-X').fill(sku);
  await page.getByPlaceholder('e.g. 1500').fill('100');
  await page.getByPlaceholder('e.g. 1950').fill('150');
  await page.getByPlaceholder('e.g. 50').fill('40');
  await page.getByPlaceholder('e.g. B24-889').fill('E2E-B1');
  await page.locator('input[type="date"]').fill('2027-06-15');
  await page.click('button[type="submit"]');

  await page.fill('#productSearchInput', sku);
  const row = rows(page).first();
  await expect(row).toContainText('E2E Test Product');
  await expect(row).toContainText('+50%'); // margin computed by the server
  await expect(row).toContainText('40 Units');
  await expect(row).toContainText('Batch #E2E-B1');

  // duplicate SKU is rejected inside the drawer
  await page.click('#openNewProductBtn');
  await page.getByPlaceholder('e.g. Belt Expert 480 SC').fill('Dupe');
  await page.getByPlaceholder('e.g. SKU-BAY-2024-X').fill(sku);
  await page.click('button[type="submit"]');
  await expect(page.getByRole('alert').filter({ hasText: /already exists/i })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // edit
  await row.getByTitle('Edit Formulation').click();
  await page.locator('input[value="E2E Test Product"]').fill('E2E Renamed');
  await page.click('button[type="submit"]');
  await expect(rows(page).first()).toContainText('E2E Renamed');

  // delete (soft)
  await rows(page).first().getByTitle('More Options').click();
  await page.getByRole('menuitem', { name: 'Delete product' }).click();
  await page.getByRole('button', { name: 'Delete product' }).click();
  await expect(page.getByText('No products match these filters.')).toBeVisible();
});

test('salesman sees products without cost or edit controls', async ({ page }) => {
  await login(page, process.env.E2E_SALES_EMAIL ?? 'pos@pesticideclub.com', process.env.E2E_SALES_PASSWORD ?? 'Sales-pass-123');
  await page.goto('/products');
  await expect(page.getByText('Coragen 20 SC')).toBeVisible();
  await expect(page.locator('#openNewProductBtn')).toHaveCount(0);
  await expect(page.getByTitle('Edit Formulation')).toHaveCount(0);
  await expect(page.getByText('Rs. 1,450')).toHaveCount(0); // Coragen cost price
  await expect(page.getByText('Rs. 1,850').first()).toBeVisible(); // selling price
});
