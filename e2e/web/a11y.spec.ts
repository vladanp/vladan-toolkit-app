import { expect, test } from '@playwright/test';
import { expectAccessible, press } from './helpers';

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem(
          'vt:settings',
          JSON.stringify({ state: { theme: value }, version: 1 }),
        );
      }, theme);
    });

    for (const [name, path] of [
      ['home', '/'],
      ['settings', '/#/settings'],
      ['system info', '/#/tools/system-info'],
      ['not found', '/#/nope'],
    ] as const) {
      test(`${name} meets WCAG 2.2 AA`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('main h1')).toBeVisible();
        // Let entrance animations finish so contrast is measured on final colors.
        await page.waitForTimeout(300);
        await expectAccessible(page);
      });
    }

    test('command palette meets WCAG 2.2 AA', async ({ page }) => {
      await page.goto('/');
      await press(page, 'Mod+k');
      await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
      await page.waitForTimeout(300);
      await expectAccessible(page);
    });
  });
}
