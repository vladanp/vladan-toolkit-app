import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { AppInfo, SystemInfo } from '@/bindings';

export const APP_INFO: AppInfo = {
  name: 'Vladan Toolkit',
  version: '1.2.3',
  tauriVersion: '2.12.2',
  webviewVersion: '140.0',
  os: 'linux',
  arch: 'x86_64',
  updaterEnabled: false,
};

export const SYSTEM_INFO: SystemInfo = {
  osName: 'Ubuntu',
  osVersion: 'Linux 24.04 Ubuntu',
  kernelVersion: '6.8.0',
  arch: 'x86_64',
  cpuBrand: 'Test CPU 9000',
  logicalCores: 8,
  physicalCores: 4,
  totalMemoryBytes: 16 * 1024 ** 3,
  uptimeSeconds: 3_900,
};

export interface IpcCall {
  cmd: string;
  args: unknown;
}

type Handler = (args: unknown) => unknown;

/**
 * Pretends we are running inside Tauri: sets `isTauri`, a `main` window, and answers IPC
 * calls from `handlers` (falling back to sensible defaults). Returns the recorded calls.
 */
export function mockTauri(handlers: Record<string, Handler> = {}): IpcCall[] {
  (globalThis as { isTauri?: boolean }).isTauri = true;
  mockWindows('main');
  const calls: IpcCall[] = [];
  const defaults: Record<string, Handler> = {
    app_info: () => APP_INFO,
    system_info: () => SYSTEM_INFO,
    'plugin:window|is_maximized': () => false,
    'plugin:event|listen': () => 1,
  };
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
      const handler = handlers[cmd] ?? defaults[cmd];
      return handler?.(args);
    },
    { shouldMockEvents: true },
  );
  return calls;
}

export function unmockTauri(): void {
  delete (globalThis as { isTauri?: boolean }).isTauri;
}
