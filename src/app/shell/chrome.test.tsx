import { Window as TauriWindow } from '@tauri-apps/api/window';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettings } from '@/core/stores/settings';
import { useUi } from '@/core/stores/ui';
import { mockTauri } from '@/test/tauri';
import { TitleBar } from './TitleBar';
import { WindowControls } from './WindowControls';

const renderTitleBar = (props: Parameters<typeof TitleBar>[0]) =>
  render(
    <TooltipProvider>
      <TitleBar {...props} />
    </TooltipProvider>,
  );

describe('TitleBar', () => {
  it('is a window drag region', async () => {
    const screen = await renderTitleBar({ platform: 'linux', native: false });
    expect(screen.container.querySelector('header')?.hasAttribute('data-tauri-drag-region')).toBe(
      true,
    );
  });

  it('leaves room for macOS traffic lights and draws no controls there', async () => {
    const screen = await renderTitleBar({ platform: 'macos', native: true });
    await expect.element(screen.getByTestId('titlebar-start')).toHaveClass('pl-[78px]');
    expect(screen.container.querySelector('[data-testid="window-controls"]')).toBeNull();
  });

  it('draws window controls on Windows and Linux', async () => {
    mockTauri();
    const screen = await renderTitleBar({ platform: 'windows', native: true });
    await expect.element(screen.getByTestId('window-controls')).toBeVisible();
    await expect.element(screen.getByTestId('titlebar-start')).toHaveClass('pl-3');
  });

  it('draws no controls in the browser preview', async () => {
    const screen = await renderTitleBar({ platform: 'windows', native: false });
    expect(screen.container.querySelector('[data-testid="window-controls"]')).toBeNull();
  });

  it('opens the palette and toggles the sidebar', async () => {
    const screen = await renderTitleBar({ platform: 'linux', native: false });
    await screen.getByRole('button', { name: /Search tools and actions/ }).click();
    expect(useUi.getState().paletteOpen).toBe(true);
    await screen.getByRole('button', { name: 'Toggle sidebar' }).click();
    expect(useSettings.getState().sidebarCollapsed).toBe(true);
  });

  it('uses real defaults when no props are given', async () => {
    const screen = await renderTitleBar({});
    await expect.element(screen.getByText('Vladan Toolkit')).toBeVisible();
  });
});

describe('WindowControls', () => {
  it('minimizes, toggles maximize and closes the current window', async () => {
    const calls = mockTauri();
    const screen = await render(<WindowControls />);
    await screen.getByRole('button', { name: 'Minimize' }).click();
    await screen.getByRole('button', { name: 'Maximize' }).click();
    await screen.getByRole('button', { name: 'Close' }).click();
    const commands = calls.map((c) => c.cmd);
    expect(commands).toContain('plugin:window|minimize');
    expect(commands).toContain('plugin:window|toggle_maximize');
    expect(commands).toContain('plugin:window|close');
  });

  it('shows "Restore" while maximized', async () => {
    mockTauri({ 'plugin:window|is_maximized': () => true });
    const screen = await render(<WindowControls />);
    await expect.element(screen.getByRole('button', { name: 'Restore' })).toBeVisible();
  });

  it('survives IPC failures and unmounts cleanly', async () => {
    mockTauri({
      'plugin:window|is_maximized': () => {
        throw new Error('no window');
      },
      'plugin:event|listen': () => {
        throw new Error('no events');
      },
    });
    const screen = await render(<WindowControls />);
    await expect.element(screen.getByRole('button', { name: 'Maximize' })).toBeVisible();
    await screen.unmount();
  });

  it('unlistens if unmounted before the listener is registered', async () => {
    mockTauri();
    const unlisten = vi.fn();
    let register: (fn: () => void) => void = () => {};
    vi.spyOn(TauriWindow.prototype, 'onResized').mockReturnValue(
      new Promise((resolve) => {
        register = resolve;
      }),
    );
    const screen = await render(<WindowControls />);
    await screen.unmount();
    register(unlisten);
    await expect.poll(() => unlisten.mock.calls.length).toBe(1);
  });

  it('unlistens on unmount once registered', async () => {
    mockTauri();
    const unlisten = vi.fn();
    vi.spyOn(TauriWindow.prototype, 'onResized').mockResolvedValue(unlisten);
    const screen = await render(<WindowControls />);
    await expect.poll(() => TauriWindow.prototype.onResized).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    await screen.unmount();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
