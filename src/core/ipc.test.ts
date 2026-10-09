import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_INFO, mockTauri } from '@/test/tauri';
import { getAppInfo, resetAppInfoCache, useAppInfo } from './ipc';

describe('getAppInfo', () => {
  it('falls back to frontend info in a plain browser', async () => {
    const info = await getAppInfo();
    expect(info).toMatchObject({ runtime: 'web', tauriVersion: null, updaterEnabled: false });
    expect(info.version).toBe(__APP_VERSION__);
  });

  it('asks Rust when running inside Tauri, once', async () => {
    const calls = mockTauri();
    const info = await getAppInfo();
    await getAppInfo();
    expect(info).toEqual({ ...APP_INFO, runtime: 'tauri' });
    expect(calls.filter((c) => c.cmd === 'app_info')).toHaveLength(1);
  });

  it('can be reset', async () => {
    const first = getAppInfo();
    resetAppInfoCache();
    expect(getAppInfo()).not.toBe(first);
  });
});

describe('useAppInfo', () => {
  it('resolves to app info', async () => {
    const { result } = renderHook(() => useAppInfo());
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current?.runtime).toBe('web'));
  });

  it('logs and stays undefined if loading fails', async () => {
    mockTauri({
      app_info: () => {
        throw new Error('nope');
      },
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAppInfo());
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Failed to load app info', expect.anything()),
    );
    expect(result.current).toBeUndefined();
  });

  it('ignores results that arrive after unmount', async () => {
    const { result, unmount } = renderHook(() => useAppInfo());
    unmount();
    await getAppInfo();
    expect(result.current).toBeUndefined();
  });
});
