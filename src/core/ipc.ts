import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { commands, type AppInfo as NativeAppInfo } from '@/bindings';
import { platform } from './platform';

export { commands, invoke, isTauri };

/** App info from Rust (see `src-tauri/src/commands/app.rs`), plus where we are running. */
export type AppInfo = Omit<NativeAppInfo, 'tauriVersion'> & {
  tauriVersion: string | null;
  runtime: 'tauri' | 'web';
};

function webAppInfo(): AppInfo {
  return {
    name: 'Vladan Toolkit',
    version: __APP_VERSION__,
    tauriVersion: null,
    webviewVersion: null,
    os: platform,
    arch: 'unknown',
    updaterEnabled: false,
    runtime: 'web',
  };
}

let cached: Promise<AppInfo> | undefined;

/**
 * Static information about the running app. Inside Tauri it comes from Rust; in a plain
 * browser (`pnpm dev:web`, tests) it falls back to what the frontend knows.
 */
export function getAppInfo(): Promise<AppInfo> {
  cached ??= isTauri()
    ? commands.appInfo().then((info): AppInfo => ({ ...info, runtime: 'tauri' }))
    : Promise.resolve(webAppInfo());
  return cached;
}

/** Test helper: forget the cached app info. */
export function resetAppInfoCache(): void {
  cached = undefined;
}

export function useAppInfo(): AppInfo | undefined {
  const [info, setInfo] = useState<AppInfo>();
  useEffect(() => {
    let active = true;
    getAppInfo().then(
      (value) => {
        if (active) setInfo(value);
      },
      (error: unknown) => console.error('Failed to load app info', error),
    );
    return () => {
      active = false;
    };
  }, []);
  return info;
}
