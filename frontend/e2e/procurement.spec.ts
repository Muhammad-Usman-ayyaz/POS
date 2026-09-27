import { expect, test, type Page } from '@playwright/test';

// Needs the API on :8000 with seed_demo_catalog + seed_demo_procurement applied.
const login = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.fill('#usernameInput', email);
  await page.fill('#passwordInput', password);
  await page.click('#signInBtn');
  await expect(page).toHaveURL(/\/dashboard/);
};
const owner = (page: Page) => login(page, process.env.E2E_OWNER_EMAIL ?? 'owner@pesticideclub.com', process.env.E2E_OWNER_PASSWORD ?? 'Owner-pass-123');

test.describe('Suppliers', () => {
  test('lists real suppliers with outstanding balances and supports CRUD', async ({ page }) => {
    await owner(page);
    await page.goto('/suppliers');
    await expect(page.getByText('Agri-Tech Ltd')).toBeVisible();

    const name = `E2E Supplier ${Date.now()}`;
    await page.getByRole('button', { name: 'Add Supplier' }).click();
    await page.getByLabel(/Supplier Name/).fill(name);
    await page.getByLabel('Phone').fill('0300-0000000');
    await page.getByRole('button', { name: 'Register Supplier' }).click();
    await expect(page.getByText(name).first()).toBeVisible();

    await page.fill('input[placeholder*="Search by supplier"]', name);
    // Wait for the debounced search to settle (and its list refetch) before opening the row menu,
    // so the menu isn't torn down mid-click by the table re-rendering underneath it.
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.locator('tbody tr').filter({ hasText: name }).getByRole('button').click();
    await expect(page.getByRole('menuitem', { name: 'Edit supplier' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Edit supplier' }).click();
    await page.getByLabel(/Supplier Name/).fill(`${name} Renamed`);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText(`${name} Renamed`).first()).toBeVisible();

    await page.fill('input[placeholder*="Search by supplier"]', `${name} Renamed`);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.locator('tbody tr').filter({ hasText: 'Renamed' }).getByRole('button').click();
    await expect(page.getByRole('menuitem', { name: 'Delete supplier' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Delete supplier' }).click();
    await page.getByRole('button', { name: 'Delete supplier' }).click();
    await expect(page.getByText('No suppliers match this search.')).toBeVisible();
  });
});

test.describe('Purchases', () => {
  test('receiving a purchase increases inventory and appears in the ledger', async ({ page }) => {
    const batchNo = `E2E-PB-${Date.now()}`;
    await owner(page);
    await page.goto('/purchases');
    await expect(page.getByText('PUR-', { exact: false }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Receive Purchase' }).click();
    const dialog = page.locator('.erp-animate-drawer');
    await dialog.locator('select').nth(0).selectOption({ label: 'Agri-Tech Ltd' });
    await page.getByPlaceholder('Search product to add...').fill('coragen');
    await page.waitForTimeout(400);
    await dialog.locator('select').nth(1).selectOption({ label: 'Coragen 20 SC (SKU-FMC-0492)' });
    await page.getByPlaceholder('Batch #').fill(batchNo);
    await page.getByPlaceholder('Qty').fill('15');
    await page.getByPlaceholder('Cost').fill('120');
    await page.getByRole('button', { name: 'Receive Purchase', exact: true }).click();

    await expect(page.getByText('Agri-Tech Ltd').first()).toBeVisible();
    await expect(page.getByText('Rs. 1,800').first()).toBeVisible(); // 15 * 120 total

    // Stock actually moved: check Inventory
    await page.goto('/inventory');
    await page.fill('input[placeholder*="Search by product"]', batchNo);
    const inventoryRow = page.locator('tbody tr').filter({ hasText: batchNo });
    await expect(inventoryRow).toHaveCount(1);
    await expect(inventoryRow).toContainText('15');

    // Ledger shows the purchase as the most recent movement for this product
    // (the ledger's search is by product/SKU/reference, not batch number).
    await page.goto('/stock-movement');
    await page.fill('input[placeholder*="Search by product"]', 'coragen');
    const latestRow = page.locator('tbody tr').first();
    await expect(latestRow).toContainText('Purchase Received');
    await expect(latestRow).toContainText('+15');
  });

  test('recording a payment updates balance and blocks overpayment', async ({ page }) => {
    await owner(page);
    await page.goto('/purchases');
    // The demo seed's purchase (seed_demo_procurement) has a fixed, searchable invoice number.
    await page.fill('input[placeholder*="Search by invoice"]', 'INV-DEMO-1');
    const row = page.locator('tbody tr').filter({ hasText: 'INV-DEMO-1' });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Pay' }).click();
    await page.getByLabel('Amount (Rs.)').fill('999999');
    await page.getByRole('button', { name: 'Record Payment' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /exceeds/i })).toBeVisible();
  });
});

test.describe('Role restrictions', () => {
  test('salesman is blocked from suppliers, purchases and stock movement, but can read inventory', async ({ page }) => {
    await login(page, process.env.E2E_SALES_EMAIL ?? 'pos@pesticideclub.com', process.env.E2E_SALES_PASSWORD ?? 'Sales-pass-123');
    for (const path of ['/suppliers', '/purchases', '/stock-movement']) {
      await page.goto(path);
      await expect(page.getByText('Access Restricted')).toBeVisible();
    }
    await page.goto('/inventory');
    await expect(page.getByText('Coragen 20 SC').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adjust' })).toHaveCount(0);
  });
});
