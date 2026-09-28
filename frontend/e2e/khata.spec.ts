import { expect, test, type Page } from '@playwright/test';

// Needs the API on :8000 with seed_demo_khata applied.
const login = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.fill('#usernameInput', email);
  await page.fill('#passwordInput', password);
  await page.click('#signInBtn');
  await expect(page).toHaveURL(/\/dashboard/);
};
const owner = (page: Page) => login(page, process.env.E2E_OWNER_EMAIL ?? 'owner@pesticideclub.com', process.env.E2E_OWNER_PASSWORD ?? 'Owner-pass-123');

// The search box is debounced (~300ms) before it refetches, so a row matched against the
// pre-filter list is visible immediately and then gets replaced once the filtered response
// lands — interacting with it in that window (e.g. opening its row menu) races a remount.
// Waiting for the actual filtered response avoids that instead of guessing at a timeout.
const searchAndSettle = async (page: Page, placeholder: string, value: string) => {
  const wait = page.waitForResponse((res) => res.url().includes('search=') && res.request().method() === 'GET');
  await page.fill(`input[placeholder*="${placeholder}"]`, value);
  await wait;
};

test.describe('Customers & Khata', () => {
  test('registers a farmer, records a credit sale and a payment from Khata, and the ledger reflects both', async ({ page }) => {
    const name = `E2E Farmer ${Date.now()}`;
    await owner(page);

    // Customers is a pure directory now: register, but all khata actions happen on Khata.
    await page.goto('/customers');
    await expect(page.getByText('Chaudhry Riaz Ahmed')).toBeVisible();
    await page.getByRole('button', { name: 'Register New Farmer' }).click();
    await page.locator('#custName').fill(name);
    await page.locator('#custLimit').fill('50000');
    await page.getByRole('button', { name: 'Register Customer' }).click();
    await expect(page.getByText(name).first()).toBeVisible();

    // Customers rows no longer carry Pay / Record credit sale actions.
    await searchAndSettle(page, 'Search by name', name);
    const custRow = page.locator('tbody tr').filter({ hasText: name });
    await custRow.getByRole('button').last().click();
    await expect(page.getByRole('menuitem', { name: 'Record credit sale' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'View profile & khata' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Record the credit sale from Khata instead.
    await page.goto('/khata');
    await page.getByRole('button', { name: 'Record Credit Sale' }).click();
    await page.getByPlaceholder('Search by name or phone...').fill(name);
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.locator('#chargeAmount').fill('8000');
    await page.locator('#chargeDesc').fill('Seed & fertilizer');
    await page.getByRole('button', { name: 'Record Charge' }).click();
    await searchAndSettle(page, 'Search by farmer', name);
    await expect(page.locator('tbody tr').filter({ hasText: name })).toContainText('Rs. 8,000');

    // Pay part of it, also from Khata.
    await page.getByRole('button', { name: 'Record Payment' }).click();
    await page.getByPlaceholder('Search by name or phone...').fill(name);
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.locator('#custPayAmount').fill('3000');
    await page.getByRole('button', { name: 'Record Payment' }).click();
    await searchAndSettle(page, 'Search by farmer', name);
    await expect(page.locator('tbody tr').filter({ hasText: name }).first()).toContainText('Rs. 3,000');

    // Profile page shows both entries in its ledger.
    await page.goto('/customers');
    await searchAndSettle(page, 'Search by name', name);
    await page.locator('tbody tr').filter({ hasText: name }).getByRole('button').first().click();
    await expect(page).toHaveURL(/\/customers\/\d+/);
    await expect(page.getByText('Credit Sale', { exact: true })).toBeVisible();
    await expect(page.getByText(/Payment · Cash/)).toBeVisible();

    // Global Khata ledger shows both entries too.
    await page.goto('/khata');
    await searchAndSettle(page, 'Search by farmer', name);
    await expect(page.locator('tbody tr')).toHaveCount(2);
  });

  test('a khata payment can exceed the outstanding balance (advance)', async ({ page }) => {
    await owner(page);
    await page.goto('/khata');
    await page.getByRole('button', { name: 'Record Payment' }).click();
    await page.getByPlaceholder('Search by name or phone...').fill('Haji Munir');
    await expect(page.getByRole('button', { name: /Haji Munir Gujjar/ })).toBeVisible();
    await page.getByRole('button', { name: /Haji Munir Gujjar/ }).click();
    await page.locator('#custPayAmount').fill('999999');
    await page.getByRole('button', { name: 'Record Payment' }).click();
    await expect(page.getByText('Payment of Rs. 999,999 recorded')).toBeVisible();
  });

  test('deleting a customer with khata history is blocked', async ({ page }) => {
    await owner(page);
    await page.goto('/customers');
    await searchAndSettle(page, 'Search by name', 'Chaudhry Riaz Ahmed');
    const row = page.locator('tbody tr').filter({ hasText: 'Chaudhry Riaz Ahmed' });
    await expect(row).toHaveCount(1);
    await row.getByRole('button').last().click();
    await expect(page.getByRole('menuitem', { name: 'Delete customer' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Delete customer' }).click();
    await page.getByRole('button', { name: 'Delete customer' }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /khata history/i })).toBeVisible();
  });

  test('salesman can access customers and khata (unrestricted routes), and /payments redirects to Khata', async ({ page }) => {
    await login(page, process.env.E2E_SALES_EMAIL ?? 'pos@pesticideclub.com', process.env.E2E_SALES_PASSWORD ?? 'Sales-pass-123');
    for (const path of ['/customers', '/khata']) {
      await page.goto(path);
      await expect(page.getByText('Access Restricted')).toHaveCount(0);
    }
    await page.goto('/payments');
    await expect(page).toHaveURL(/\/khata/);
  });
});
