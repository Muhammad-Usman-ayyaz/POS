import { expect, test, type Page } from '@playwright/test';

const login = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.fill('#usernameInput', email);
  await page.fill('#passwordInput', password);
  await page.click('#signInBtn');
  await expect(page).toHaveURL(/\/dashboard/);
};
const owner = (page: Page) => login(page, process.env.E2E_OWNER_EMAIL ?? 'owner@pesticideclub.com', process.env.E2E_OWNER_PASSWORD ?? 'Owner-pass-123');
const salesman = (page: Page) => login(page, process.env.E2E_SALES_EMAIL ?? 'pos@pesticideclub.com', process.env.E2E_SALES_PASSWORD ?? 'Sales-pass-123');

test.describe('Audit Log', () => {
  test('recording a sale shows up in the audit log', async ({ page, context }) => {
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

    await page.goto('/audit-log');
    await page.getByPlaceholder('Search by summary...').fill(sale.invoice_no);
    await page.waitForResponse((res) => res.url().includes('search=') && res.request().method() === 'GET');
    await expect(page.locator('tbody tr').first()).toContainText('Sale Completed');
    await expect(page.locator('tbody tr').first()).toContainText(sale.invoice_no);
  });

  test('salesman is blocked from the Audit Log page', async ({ page }) => {
    await salesman(page);
    await page.goto('/audit-log');
    await expect(page.getByRole('heading', { name: 'Access Restricted' })).toBeVisible();
  });

  test('filtering by action type narrows the list', async ({ page }) => {
    await owner(page);
    await page.goto('/audit-log');
    await page.selectOption('select', 'LOGIN_SUCCESS');
    await page.waitForTimeout(400);
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toContainText('Login Success');
  });
});
