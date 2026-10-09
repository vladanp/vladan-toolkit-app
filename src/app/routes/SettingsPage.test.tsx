import { describe, expect, it, vi } from 'vitest';
import { useSettings } from '@/core/stores/settings';
import { useUsage } from '@/core/stores/usage';
import { type UpdateStatus, useUpdater } from '@/core/updater';
import { renderApp } from '@/test/render-app';
import { APP_INFO, mockTauri } from '@/test/tauri';
import { describeUpdateStatus, REPO_URL } from './SettingsPage';

describe('settings page', () => {
  it('changes theme, accent and sidebar density', async () => {
    const { screen } = await renderApp('/settings');
    await screen.getByRole('button', { name: 'Light' }).click();
    expect(useSettings.getState().theme).toBe('light');
    await screen.getByRole('radio', { name: 'emerald' }).click();
    expect(useSettings.getState().accent).toBe('emerald');
    await expect.poll(() => document.documentElement.dataset.accent).toBe('emerald');
    await screen.getByRole('switch', { name: 'Compact sidebar' }).click();
    expect(useSettings.getState().sidebarCollapsed).toBe(true);
  });

  it('lists keyboard shortcuts', async () => {
    const { screen } = await renderApp('/settings');
    const section = screen.getByRole('region', { name: 'Keyboard shortcuts' });
    await expect.element(section.getByText('Open command palette')).toBeVisible();
    await expect.element(section.getByLabelText('Ctrl+K')).toBeVisible();
  });

  it('clears recent activity', async () => {
    useUsage.getState().markUsed('hammer');
    const { screen } = await renderApp('/settings');
    await screen.getByRole('button', { name: 'Clear' }).click();
    expect(useUsage.getState().lastUsed).toEqual({});
    await expect.element(screen.getByText('Recent activity cleared')).toBeVisible();
  });

  it('shows browser-preview details and opens the repository', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { screen } = await renderApp('/settings');
    await expect.element(screen.getByText('Browser preview')).toBeVisible();
    await screen.getByRole('button', { name: /GitHub/ }).click();
    expect(open).toHaveBeenCalledWith(`${REPO_URL}`, '_blank', 'noopener,noreferrer');
  });

  it('shows native details inside Tauri', async () => {
    mockTauri();
    const { screen } = await renderApp('/settings');
    await expect.element(screen.getByText(`Tauri ${APP_INFO.tauriVersion}`)).toBeVisible();
    await expect.element(screen.getByText(`${APP_INFO.os} · ${APP_INFO.arch}`)).toBeVisible();
    await expect.element(screen.getByText(APP_INFO.webviewVersion as string)).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Updates' })).not.toBeInTheDocument();
  });

  it('manages updates when the build supports them', async () => {
    mockTauri({ app_info: () => ({ ...APP_INFO, updaterEnabled: true }) });
    const check = vi.fn(async () => null);
    useUpdater.setState({ backend: { check, relaunch: vi.fn(async () => {}) } });
    const { screen } = await renderApp('/settings');
    const updates = screen.getByRole('region', { name: 'Updates' });
    await expect.element(updates.getByText('Not checked yet')).toBeVisible();
    await updates.getByRole('switch', { name: 'Check for updates automatically' }).click();
    expect(useSettings.getState().autoCheckUpdates).toBe(false);
    await updates.getByRole('button', { name: 'Check now' }).click();
    await expect.element(screen.getByText("You're on the latest version")).toBeVisible();
    expect(check).toHaveBeenCalled();

    const install = vi.fn(async () => {});
    useUpdater.setState({
      status: { kind: 'available', version: '9.9.9', notes: undefined },
      install,
    });
    await updates.getByRole('button', { name: 'Install & restart' }).click();
    expect(install).toHaveBeenCalled();
  });
});

describe('describeUpdateStatus', () => {
  it.each<[UpdateStatus, RegExp]>([
    [{ kind: 'idle' }, /Not checked yet/],
    [{ kind: 'checking' }, /Checking/],
    [{ kind: 'up-to-date', checkedAt: Date.now() }, /Up to date · checked just now/],
    [{ kind: 'available', version: '2.0.0', notes: undefined }, /Version 2.0.0 is available/],
    [{ kind: 'downloading', downloaded: 50, total: 200 }, /Downloading… 25%/],
    [{ kind: 'downloading', downloaded: 50, total: undefined }, /^Downloading…$/],
    [{ kind: 'installing' }, /Installing/],
    [{ kind: 'error', message: 'offline' }, /Check failed: offline/],
  ])('%o', (status, expected) => {
    expect(describeUpdateStatus(status)).toMatch(expected);
  });
});
