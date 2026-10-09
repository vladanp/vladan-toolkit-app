import type { Update } from '@tauri-apps/plugin-updater';
import { Toaster } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { useSettings } from '@/core/stores/settings';
import { useUpdater } from '@/core/updater';
import { APP_INFO, mockTauri } from '@/test/tauri';
import {
  CHECK_INTERVAL_MS,
  checkForUpdates,
  FIRST_CHECK_DELAY_MS,
  installUpdate,
  UpdateNotifier,
} from './UpdateNotifier';

const update = {
  version: '3.0.0',
  body: undefined,
  downloadAndInstall: vi.fn(),
} as unknown as Update;

function backend(result: Update | null | Error) {
  const check = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const relaunch = vi.fn(async () => {});
  useUpdater.setState({ backend: { check, relaunch } });
  return { check, relaunch };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('checkForUpdates', () => {
  it('announces an available update with an install action', async () => {
    backend(update);
    const install = vi.fn(async () => {});
    useUpdater.setState({ install });
    const screen = await render(<Toaster />);
    await checkForUpdates({ silent: true });
    await expect.element(screen.getByText('Version 3.0.0 is available')).toBeVisible();
    await screen.getByRole('button', { name: 'Install & restart' }).click();
    expect(install).toHaveBeenCalled();
  });

  it('confirms "up to date" only when asked explicitly', async () => {
    backend(null);
    const screen = await render(<Toaster />);
    await checkForUpdates({ silent: true });
    expect(document.body.textContent).not.toContain('latest version');
    useUpdater.setState({ status: { kind: 'idle' } });
    await checkForUpdates({ silent: false });
    await expect.element(screen.getByText("You're on the latest version")).toBeVisible();
  });

  it('reports errors only when asked explicitly', async () => {
    backend(new Error('offline'));
    const screen = await render(<Toaster />);
    await checkForUpdates({ silent: true });
    expect(document.body.textContent).not.toContain("Couldn't check");
    await checkForUpdates({ silent: false });
    await expect.element(screen.getByText("Couldn't check for updates")).toBeVisible();
  });
});

describe('installUpdate', () => {
  it('shows progress, and the reason when the install fails', async () => {
    const install = vi.fn(async () => {
      useUpdater.setState({ status: { kind: 'error', message: 'signature mismatch' } });
    });
    useUpdater.setState({ install });
    const screen = await render(<Toaster />);
    const pending = installUpdate();
    await expect.element(screen.getByText('Downloading the update…')).toBeVisible();
    await pending;
    await expect.element(screen.getByText("Couldn't install the update")).toBeVisible();
    await expect.element(screen.getByText('signature mismatch')).toBeVisible();
    expect(install).toHaveBeenCalledOnce();
  });
});

describe('UpdateNotifier', () => {
  it('checks shortly after launch and then periodically', async () => {
    mockTauri({ app_info: () => ({ ...APP_INFO, updaterEnabled: true }) });
    const { check } = backend(null);
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const screen = await render(<UpdateNotifier />);
    await vi.waitFor(() => vi.getTimerCount() > 0 || Promise.reject(new Error('no timers yet')));
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
    await screen.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stays quiet when auto-check is off or the build cannot update', async () => {
    mockTauri({ app_info: () => ({ ...APP_INFO, updaterEnabled: true }) });
    useSettings.setState({ autoCheckUpdates: false });
    const { check } = backend(null);
    await render(<UpdateNotifier />);
    await new Promise((r) => setTimeout(r, 50));
    expect(check).not.toHaveBeenCalled();
  });
});
