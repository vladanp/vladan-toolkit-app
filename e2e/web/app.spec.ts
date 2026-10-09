import { expect, test } from '@playwright/test';
import { press, trackErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Vladan');
});

test('home lists the built-in tools without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Tools' }).getByText('System Info')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('command palette opens a tool from the keyboard', async ({ page }) => {
  await press(page, 'Mod+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('system');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page).toHaveURL(/#\/tools\/system-info$/);
  await expect(page.getByRole('region', { name: 'Application' })).toBeVisible();
});

test('tool shortcuts and navigation history', async ({ page }) => {
  await press(page, 'Mod+1');
  await expect(page).toHaveURL(/#\/tools\/system-info$/);
  await press(page, 'Mod+,');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/tools\/system-info$/);
  await press(page, 'Mod+0');
  await expect(page).toHaveURL(/#\/$/);
});

test('appearance settings persist across restarts', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Light' }).click();
  await page.getByRole('radio', { name: 'teal' }).click();
  await press(page, 'Mod+b');
  await page.reload();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('data-accent', 'teal');
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveAttribute(
    'data-collapsed',
    'true',
  );
});

test('deep links and unknown routes', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.goto('/#/tools/does-not-exist');
  await expect(page.getByText('Nothing here')).toBeVisible();
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test('copies system info to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/tools/system-info');
  await page.getByRole('button', { name: 'Copy as Markdown' }).click();
  await expect(page.getByText('System info copied as Markdown')).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('### Application');
});
