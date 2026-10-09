import { expect, test } from '@playwright/test';
import { ACCENTS } from '../../src/core/theme';
import { expectAccessible, press } from './helpers';

// Scans measure final colors; reduced motion (honored by the app's CSS) shortens entrance
// transitions so they can't race the scan on slow runners.
test.use({ reducedMotion: 'reduce' });

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
        await expectAccessible(page);
      });
    }

    test('command palette meets WCAG 2.2 AA', async ({ page }) => {
      await page.goto('/');
      await press(page, 'Mod+k');
      await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
      await expectAccessible(page);
    });
  });
}

test.describe('accent colors', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const accent of ACCENTS) {
      test(`${accent} in the ${theme} theme meets WCAG 2.2 AA`, async ({ page }) => {
        await page.addInitScript(
          ([themeValue, accentValue]) => {
            localStorage.setItem(
              'vt:settings',
              JSON.stringify({ state: { theme: themeValue, accent: accentValue }, version: 1 }),
            );
          },
          [theme, accent] as const,
        );
        // The not found page has accent-colored link text; the sample adds an accent fill
        // with its paired text, as on primary buttons.
        await page.goto('/#/nope');
        await expect(page.locator('html')).toHaveAttribute('data-accent', accent);
        await page.evaluate(() => {
          const sample = document.createElement('button');
          sample.className = 'bg-accent px-2 text-accent-fg';
          sample.textContent = 'Primary action';
          document.querySelector('main')?.append(sample);
        });
        await expectAccessible(page);
      });
    }
  }
});
