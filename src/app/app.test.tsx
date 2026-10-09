import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { useSettings } from '@/core/stores/settings';
import { useUi } from '@/core/stores/ui';
import { useUsage } from '@/core/stores/usage';
import { renderApp } from '@/test/render-app';
import { mockTauri } from '@/test/tauri';

const press = (keys: string) => userEvent.keyboard(keys);

describe('home', () => {
  it('greets and lists every tool with its shortcut', async () => {
    const { screen } = await renderApp('/');
    await expect.element(screen.getByRole('heading', { level: 2 })).toMatchTextContent(', Vladan');
    const list = screen.getByRole('region', { name: 'Tools' });
    await expect.element(list.getByText('Hammer')).toBeVisible();
    await expect.element(list.getByText('Never opened').first()).toBeVisible();
  });

  it('shows an empty state without tools', async () => {
    const { screen } = await renderApp('/', []);
    await expect.element(screen.getByText('No tools yet', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('No tools yet.')).toBeVisible();
  });

  it('shows when a tool was last opened', async () => {
    useUsage.getState().markUsed('hammer', Date.now() - 5 * 60_000);
    const { screen } = await renderApp('/');
    await expect.element(screen.getByText('5 min. ago')).toBeVisible();
  });
});

describe('navigation', () => {
  it('opens tools from the sidebar and marks them as used', async () => {
    const { screen, router } = await renderApp('/');
    await screen
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Wrench' })
      .click();
    await expect.element(screen.getByText('Wrench view')).toBeVisible();
    expect(router.state.location.pathname).toBe('/tools/wrench');
    expect(useUsage.getState().lastUsed.wrench).toBeTypeOf('number');
  });

  it('collapses the sidebar to icons with tooltips', async () => {
    useSettings.setState({ sidebarCollapsed: true });
    const { screen } = await renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await expect.element(nav).toHaveAttribute('data-collapsed', 'true');
    const link = nav.getByRole('link', { name: 'Hammer' });
    await expect.element(link).toHaveAttribute('aria-keyshortcuts', 'Control+1');
    await userEvent.hover(link);
    await expect
      .poll(() => document.querySelector('[data-base-ui-portal]')?.textContent)
      .toContain('Hammer');
  });

  it('renders a not-found page for unknown tools and routes', async () => {
    const { screen } = await renderApp('/tools/nope');
    await expect.element(screen.getByText('Nothing here')).toBeVisible();
    const other = await renderApp('/does/not/exist');
    await expect.element(other.screen.getByText('Nothing here').last()).toBeVisible();
    await other.screen.getByRole('link', { name: 'Back to Home' }).last().click();
    expect(other.router.state.location.pathname).toBe('/');
  });

  it('isolates crashing tools behind an error boundary', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { screen } = await renderApp('/tools/crashy');
    await expect.element(screen.getByRole('alert')).toMatchTextContent('Crashy ran into a problem');
    await expect.element(screen.getByText('Kaboom')).toBeVisible();
    await screen.getByRole('button', { name: 'Try again' }).click();
    await expect.element(screen.getByRole('alert')).toBeVisible();
    // The rest of the shell keeps working.
    await screen.getByRole('link', { name: 'Hammer' }).first().click();
    await expect.element(screen.getByText('Hammer time')).toBeVisible();
    expect(error).toHaveBeenCalled();
  });

  it('gives "full" layout tools the whole content area', async () => {
    const { screen } = await renderApp('/tools/wrench');
    const view = screen.getByText('Wrench view').element();
    expect(view.parentElement?.className).toContain('h-full');
  });
});

describe('keyboard shortcuts', () => {
  it('navigates with mod+1…9, mod+, , mod+0 and back/forward', async () => {
    const { screen, router } = await renderApp('/');
    await press('{Control>}2{/Control}');
    await expect.element(screen.getByText('Wrench view')).toBeVisible();
    await press('{Control>},{/Control}');
    await expect.element(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // `[` starts a key code in user-event syntax, so it is escaped as `[[`.
    await press('{Control>}[[{/Control}');
    await expect.poll(() => router.state.location.pathname).toBe('/tools/wrench');
    await press('{Control>}]{/Control}');
    await expect.poll(() => router.state.location.pathname).toBe('/settings');
    await press('{Control>}0{/Control}');
    await expect.poll(() => router.state.location.pathname).toBe('/');
  });

  it('toggles the sidebar and the palette', async () => {
    await renderApp('/');
    await press('{Control>}b{/Control}');
    expect(useSettings.getState().sidebarCollapsed).toBe(true);
    await press('{Control>}k{/Control}');
    expect(useUi.getState().paletteOpen).toBe(true);
  });
});

describe('command palette', () => {
  it('searches and opens a tool', async () => {
    const { router } = await renderApp('/');
    await press('{Control>}k{/Control}');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect.element(dialog).toBeVisible();
    await userEvent.keyboard('wren');
    await expect.element(dialog.getByRole('option', { name: /Wrench/ })).toBeVisible();
    await expect.element(dialog.getByRole('option', { name: /Hammer/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => router.state.location.pathname).toBe('/tools/wrench');
    expect(useUi.getState().paletteOpen).toBe(false);
  });

  it('ranks title matches above description matches', async () => {
    await renderApp('/');
    await press('{Control>}k{/Control}');
    await userEvent.keyboard('settings');
    const options = page.getByRole('dialog').getByRole('option');
    await expect.element(options.first()).toHaveAccessibleName('Open Settings');
  });

  it('matches keywords and descriptions', async () => {
    await renderApp('/');
    await press('{Control>}k{/Control}');
    await userEvent.keyboard('nail');
    await expect
      .element(
        page
          .getByRole('dialog')
          .getByRole('option', { name: /Hammer/ })
          .first(),
      )
      .toBeVisible();
  });

  it('runs app actions such as switching theme', async () => {
    await renderApp('/');
    await press('{Control>}k{/Control}');
    await userEvent.keyboard('light theme');
    await page.getByRole('option', { name: /Use light theme/ }).click();
    expect(useSettings.getState().theme).toBe('light');
    await expect.poll(() => document.documentElement.dataset.theme).toBe('light');
  });

  it('shows an empty state and closes with Escape', async () => {
    await renderApp('/');
    await press('{Control>}k{/Control}');
    await userEvent.keyboard('zzzzqqq');
    await expect.element(page.getByText('No matching tools or actions.')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.poll(() => useUi.getState().paletteOpen).toBe(false);
  });

  it('reports failing commands as a toast instead of crashing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { hammerTool } = await import('@/test/fixtures');
    const swing = hammerTool.commands?.[0];
    if (!swing) throw new Error('fixture is missing its command');
    vi.spyOn(swing, 'run').mockImplementation(() => {
      throw new Error('swing failed');
    });
    const { screen } = await renderApp('/');
    await press('{Control>}k{/Control}');
    await userEvent.keyboard('swing');
    await userEvent.keyboard('{Enter}');
    await expect.element(screen.getByText('"Swing the hammer" failed')).toBeVisible();
    await expect.element(screen.getByText('swing failed')).toBeVisible();
    expect(error).toHaveBeenCalled();
  });

  it('offers "Check for updates" only when the build can update', async () => {
    mockTauri({ app_info: () => ({ ...APP, updaterEnabled: true }) });
    await renderApp('/');
    await press('{Control>}k{/Control}');
    await userEvent.keyboard('updates');
    await expect.element(page.getByRole('option', { name: /Check for updates/ })).toBeVisible();
  });
});

const APP = {
  name: 'Vladan Toolkit',
  version: '1.0.0',
  tauriVersion: '2.12.2',
  webviewVersion: null,
  os: 'linux',
  arch: 'x86_64',
  updaterEnabled: false,
};

describe('theme', () => {
  it('applies the saved theme and accent to the document', async () => {
    useSettings.setState({ theme: 'light', accent: 'teal' });
    await renderApp('/');
    await expect.poll(() => document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.accent).toBe('teal');
  });

  it('syncs the native window theme inside Tauri', async () => {
    const calls = mockTauri();
    useSettings.setState({ theme: 'system' });
    await renderApp('/');
    await expect
      .poll(() => calls.find((c) => c.cmd === 'plugin:window|set_theme')?.args)
      .toMatchObject({ value: null });
  });

  it('warns but keeps working if the native theme call fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockTauri({
      'plugin:window|set_theme': () => {
        throw new Error('unsupported');
      },
    });
    await renderApp('/');
    await expect.poll(() => warn.mock.calls.length).toBeGreaterThan(0);
  });
});
