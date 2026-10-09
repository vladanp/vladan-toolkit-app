import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type UpdaterBackend, useUpdater } from './updater';

function fakeUpdate(events: DownloadEvent[] = [], fail?: Error): Update {
  return {
    version: '2.0.0',
    body: 'Notes',
    downloadAndInstall: vi.fn(async (onEvent?: (event: DownloadEvent) => void) => {
      for (const event of events) onEvent?.(event);
      if (fail) throw fail;
    }),
  } as unknown as Update;
}

function useBackend(backend: Partial<UpdaterBackend>) {
  const full: UpdaterBackend = {
    check: vi.fn(async () => null),
    relaunch: vi.fn(async () => {}),
    ...backend,
  };
  useUpdater.setState({ backend: full });
  return full;
}

describe('updater store', () => {
  beforeEach(() => {
    useUpdater.setState(useUpdater.getInitialState(), true);
  });

  it('reports up-to-date', async () => {
    useBackend({ check: vi.fn(async () => null) });
    const status = await useUpdater.getState().check();
    expect(status.kind).toBe('up-to-date');
    expect(useUpdater.getState().status).toEqual(status);
  });

  it('reports an available update', async () => {
    useBackend({ check: vi.fn(async () => fakeUpdate()) });
    expect(await useUpdater.getState().check()).toEqual({
      kind: 'available',
      version: '2.0.0',
      notes: 'Notes',
    });
  });

  it('reports errors from Error and non-Error values', async () => {
    useBackend({ check: vi.fn(async () => Promise.reject(new Error('offline'))) });
    expect(await useUpdater.getState().check()).toEqual({ kind: 'error', message: 'offline' });
    useBackend({ check: vi.fn(async () => Promise.reject('plain')) });
    expect(await useUpdater.getState().check()).toEqual({ kind: 'error', message: 'plain' });
  });

  it('does not start a second check while busy', async () => {
    const backend = useBackend({});
    useUpdater.setState({ status: { kind: 'checking' } });
    expect((await useUpdater.getState().check()).kind).toBe('checking');
    expect(backend.check).not.toHaveBeenCalled();
  });

  it('downloads with progress, installs, then relaunches', async () => {
    const statuses: string[] = [];
    const update = fakeUpdate([
      { event: 'Started', data: { contentLength: 100 } },
      { event: 'Progress', data: { chunkLength: 40 } },
      { event: 'Progress', data: { chunkLength: 60 } },
      { event: 'Finished' },
    ]);
    const backend = useBackend({ check: vi.fn(async () => update) });
    await useUpdater.getState().check();
    const unsubscribe = useUpdater.subscribe((s) => {
      const st = s.status;
      statuses.push(
        st.kind === 'downloading' ? `downloading ${st.downloaded}/${st.total}` : st.kind,
      );
    });
    await useUpdater.getState().install();
    unsubscribe();
    expect(statuses).toEqual([
      'downloading 0/undefined',
      'downloading 0/100',
      'downloading 40/100',
      'downloading 100/100',
      'installing',
    ]);
    expect(backend.relaunch).toHaveBeenCalledOnce();
  });

  it('surfaces install failures', async () => {
    useBackend({ check: vi.fn(async () => fakeUpdate([], new Error('disk full'))) });
    await useUpdater.getState().check();
    await useUpdater.getState().install();
    expect(useUpdater.getState().status).toEqual({ kind: 'error', message: 'disk full' });
  });

  it('install is a no-op without an update', async () => {
    const backend = useBackend({});
    await useUpdater.getState().install();
    expect(useUpdater.getState().status.kind).toBe('idle');
    expect(backend.relaunch).not.toHaveBeenCalled();
  });
});

describe('default backend', () => {
  it('delegates to the Tauri updater and process plugins', async () => {
    vi.doMock('@tauri-apps/plugin-updater', () => ({ check: vi.fn(async () => null) }));
    vi.doMock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn(async () => {}) }));
    vi.resetModules();
    const { useUpdater: fresh } = await import('./updater');
    const { backend } = fresh.getState();
    await expect(backend.check()).resolves.toBeNull();
    await expect(backend.relaunch()).resolves.toBeUndefined();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    expect(relaunch).toHaveBeenCalled();
    vi.doUnmock('@tauri-apps/plugin-updater');
    vi.doUnmock('@tauri-apps/plugin-process');
  });
});
