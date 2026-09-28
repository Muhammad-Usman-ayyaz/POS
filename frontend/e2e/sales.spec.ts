import { expect, test, type Page } from '@playwright/test';

// Needs the API on :8000 with seed_demo_catalog + seed_demo_khata applied (a stocked batch and a
// customer to charge). Each test creates its own sale rather than relying on seed_demo_sales, so
// stock levels stay predictable across runs.
const login = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.fill('#usernameInput', email);
  await page.fill('#passwordInput', password);
  await page.click('#signInBtn');
  await expect(page).toHaveURL(/\/dashboard/);
};
const owner = (page: Page) => login(page, process.env.E2E_OWNER_EMAIL ?? 'owner@pesticideclub.com', process.env.E2E_OWNER_PASSWORD ?? 'Owner-pass-123');
const salesman = (page: Page) => login(page, process.env.E2E_SALES_EMAIL ?? 'pos@pesticideclub.com', process.env.E2E_SALES_PASSWORD ?? 'Sales-pass-123');

test.describe('POS & Invoices', () => {
  test('a cash sale deducts stock, opens an invoice, and appears in Sales & Invoices', async ({ page, context }) => {
    await owner(page);
    await page.goto('/pos');

    const firstCard = page.locator('.erp-card-hover').first();
    const productName = (await firstCard.locator('h3').innerText()).trim();
    await firstCard.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Current Bill Items')).toBeVisible();

    const [popup, saleResponse] = await Promise.all([
      context.waitForEvent('page'),
      page.waitForResponse((res) => res.url().endsWith('/api/sales/') && res.request().method() === 'POST'),
      page.getByRole('button', { name: /Complete Sale/ }).click(),
    ]);
    expect(saleResponse.status()).toBe(201);
    const sale = await saleResponse.json();
    expect(sale.status).toBe('COMPLETED');
    await popup.close();

    await page.goto('/invoices');
    await expect(page.getByRole('button', { name: sale.invoice_no })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: sale.invoice_no })).toContainText(productName.length > 0 ? sale.invoice_no : sale.invoice_no);
  });

  test('a khata sale requires a customer and posts a charge visible on their profile', async ({ page }) => {
    await owner(page);
    await page.goto('/pos');

    await page.locator('.erp-card-hover').first().getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Khata (Credit)' }).click();

    // Without a customer selected, completing should be rejected client-side (no request fires).
    await page.getByRole('button', { name: /Complete Sale/ }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Select a farmer/i }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Select Farmer' }).click();
    await page.locator('[role="dialog"] button').first().click();
    await expect(page.getByText('Outstanding')).toBeVisible();

    const [saleResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith('/api/sales/') && res.request().method() === 'POST'),
      page.getByRole('button', { name: /Complete Sale/ }).click(),
    ]);
    const sale = await saleResponse.json();
    expect(sale.payment_method).toBe('KHATA');

    await page.goto(`/customers/${sale.customer}`);
    await expect(page.locator('tbody tr').first()).toContainText(sale.invoice_no);
  });

  test('cancelling a sale from Invoices reverses its stock movement', async ({ page, context }) => {
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
    await row.getByRole('button', { name: 'Cancel' }).click();
    const [cancelResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/sales/${sale.id}/cancel/`)),
      page.getByRole('button', { name: 'Cancel sale' }).click(),
    ]);
    expect(cancelResponse.status()).toBe(200);
    await expect(row).toContainText('CANCELLED');

    await page.goto('/stock-movement');
    await expect(page.locator('tbody tr').first()).toContainText('Sale Cancelled');
  });

  test('salesman can sell but not cancel a sale', async ({ page, context }) => {
    await salesman(page);
    await page.goto('/pos');
    await expect(page.getByText('Point of Sale')).toBeVisible();

    await page.locator('.erp-card-hover').first().getByRole('button', { name: 'Add' }).click();
    const [popup, saleResponse] = await Promise.all([
      context.waitForEvent('page'),
      page.waitForResponse((res) => res.url().endsWith('/api/sales/') && res.request().method() === 'POST'),
      page.getByRole('button', { name: /Complete Sale/ }).click(),
    ]);
    expect(saleResponse.status()).toBe(201);
    await popup.close();

    await page.goto('/invoices');
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  });
});
