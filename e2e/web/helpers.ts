import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** ⌘ when the app thinks it runs on macOS (WebKit project), Ctrl otherwise. */
export async function modKey(page: Page): Promise<'Meta' | 'Control'> {
  const platform = await page.evaluate(() => document.documentElement.dataset.platform);
  return platform === 'macos' ? 'Meta' : 'Control';
}

export async function press(page: Page, shortcut: string): Promise<void> {
  await page.keyboard.press(shortcut.replace('Mod', await modKey(page)));
}

/** Collects console errors and uncaught exceptions; assert it's empty at the end of a test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Waits until every finite CSS transition/animation has finished. Scanning mid fade-in
 * would measure semi-transparent text and report false contrast failures.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
}

/** WCAG 2.2 AA scan of the current page state, once it has settled. */
export async function expectAccessible(page: Page): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(summary, summary.join('\n\n')).toEqual([]);
}
