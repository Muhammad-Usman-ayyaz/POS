import { expect, test, type Page } from '@playwright/test';

// Needs the API on :8000 with seed_demo_catalog applied (a stocked batch to sell, then return).
// Each test creates its own sale rather than relying on seed_demo_sales, so stock levels and
// already-returned quantities stay predictable across runs.
const login = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.fill('#usernameInput', email);
  await page.fill('#passwordInput', password);
  await page.click('#signInBtn');
  await expect(page).toHaveURL(/\/dashboard/);
};
const owner = (page: Page) => login(page, process.env.E2E_OWNER_EMAIL ?? 'owner@pesticideclub.com', process.env.E2E_OWNER_PASSWORD ?? 'Owner-pass-123');

test.describe('Returns & Claims', () => {
  test('returning part of a cash sale restocks the batch and appears in Returns & Claims', async ({ page, context }) => {
    await owner(page);
    await page.goto('/pos');
    await page.locator('.erp-card-hover').first().getByRole('button', { name: 'Add' }).click();
    const [popup, saleResponse] = await Promise.all([
      context.waitForEvent('page'),
      page.waitForResponse((res) => res.url().endsWith('/api/sales/') && res.request().method() === 'POST'),
      page.getByRole('button', { name: /Complete Sale/ }).click(),
    ]);
    const sale = await saleResponse.json();
    await popup.close();

    await page.goto('/invoices');
    const row = page.locator('tbody tr').filter({ hasText: sale.invoice_no });
    await row.getByRole('button', { name: 'Return' }).click();

    await expect(page.getByText(`Return Items — ${sale.invoice_no}`)).toBeVisible();
    await page.locator('[role="dialog"] input[type="number"]').first().fill('1');
    await page.getByLabel('Reason').fill('Customer changed mind');

    const [returnResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith('/api/returns/') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Process Return' }).click(),
    ]);
    expect(returnResponse.status()).toBe(201);
    const ret = await returnResponse.json();
    expect(ret.refund_method).toBe('CASH');

    await page.goto('/returns');
    await expect(page.locator('tbody tr').filter({ hasText: ret.return_no })).toContainText(sale.invoice_no);

    await page.goto('/stock-movement');
    await expect(page.locator('tbody tr').first()).toContainText('Customer Return');
  });

  test('a khata credit return reduces the customer balance', async ({ page }) => {
    await owner(page);
    await page.goto('/pos');
    await page.locator('.erp-card-hover').first().getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Khata (Credit)' }).click();
    await page.getByRole('button', { name: 'Select Farmer' }).click();
    await page.locator('[role="dialog"] button').first().click();

    const [saleResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith('/api/sales/') && res.request().method() === 'POST'),
      page.getByRole('button', { name: /Complete Sale/ }).click(),
    ]);
    const sale = await saleResponse.json();

    await page.goto('/invoices');
    const row = page.locator('tbody tr').filter({ hasText: sale.invoice_no });
    await row.getByRole('button', { name: 'Return' }).click();
    await page.locator('[role="dialog"] input[type="number"]').first().fill('1');
    await page.getByLabel('Refund Method').selectOption('KHATA_CREDIT');

    const [returnResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith('/api/returns/') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Process Return' }).click(),
    ]);
    expect(returnResponse.status()).toBe(201);

    await page.goto(`/customers/${sale.customer}`);
    await expect(page.locator('tbody tr').first()).toContainText('Return credit');
  });
});
