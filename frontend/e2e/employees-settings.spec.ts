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

test.describe('Employees', () => {
  test('add, deactivate and reactivate an employee', async ({ page }) => {
    const stamp = Date.now();
    const name = `E2E Test Employee ${stamp}`;
    const email = `e2e.${stamp}@pesticideclub.com`;
    await owner(page);
    await page.goto('/employees');

    await page.getByRole('button', { name: 'Add Employee' }).click();
    await page.locator('#empName').fill(name);
    await page.locator('#empEmail').fill(email);
    await page.locator('#empRole').selectOption('SALESMAN');
    await page.locator('#empPassword').fill('E2e-pass-123');
    await page.getByRole('button', { name: 'Create Employee' }).click();
    const row = page.locator('tbody tr').filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Active');
    await row.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Deactivate' }).click();
    await page.getByRole('button', { name: 'Deactivate' }).last().click();
    await expect(row).toContainText('Deactivated');

    await row.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Reactivate' }).click();
    await expect(row).toContainText('Active');
  });

  test('salesman is blocked from the Employees page', async ({ page }) => {
    await salesman(page);
    await page.goto('/employees');
    await expect(page.getByRole('heading', { name: 'Access Restricted' })).toBeVisible();
  });
});

test.describe('Settings', () => {
  test('shows the signed-in account and toggles dark mode', async ({ page }) => {
    await owner(page);
    await page.goto('/settings');
    await expect(page.getByText(/owner@pesticideclub.com/i)).toBeVisible();

    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('changing password with the wrong current password is rejected', async ({ page }) => {
    await salesman(page);
    await page.goto('/settings');
    await page.locator('#currentPassword').fill('totally-wrong');
    await page.locator('#newPassword').fill('New-pass-1234');
    await page.locator('#confirmPassword').fill('New-pass-1234');
    await page.getByRole('button', { name: 'Update Password' }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /incorrect/i }).last()).toBeVisible();
  });
});
