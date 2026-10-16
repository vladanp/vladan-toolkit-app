import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { AppInfo, GraphicsInfo, SpeedTestResult, SystemInfo, SystemUsage } from '@/bindings';

export const APP_INFO: AppInfo = {
  name: 'Vladan Toolkit',
  version: '1.2.3',
  tauriVersion: '2.12.2',
  webviewVersion: '140.0',
  os: 'linux',
  arch: 'x86_64',
  updaterEnabled: false,
};

const GB = 1024 ** 3;

export const SYSTEM_INFO: SystemInfo = {
  device: { vendor: 'Framework', model: 'Laptop 13', motherboard: 'Framework FRANMDCP07' },
  osName: 'Ubuntu',
  osVersion: 'Linux 24.04 Ubuntu',
  kernelVersion: '6.8.0',
  hostName: 'workbench',
  arch: 'x86_64',
  cpuBrand: 'Test CPU 9000',
  cpuFrequencyMhz: 3700,
  logicalCores: 8,
  physicalCores: 4,
  totalMemoryBytes: 16 * GB,
  totalSwapBytes: 4 * GB,
  uptimeSeconds: 3_900,
  disks: [
    {
      name: '/dev/nvme0n1p2',
      mountPoint: '/',
      fileSystem: 'ext4',
      kind: 'ssd',
      totalBytes: 512 * GB,
      availableBytes: 200 * GB,
      removable: false,
    },
  ],
  networks: [{ name: 'wlp2s0', addresses: ['192.168.1.20', '2a02:1::5'] }],
  battery: null,
};

export const GRAPHICS_INFO: GraphicsInfo = {
  gpus: [
    {
      name: 'GeForce RTX 4070',
      vendor: 'NVIDIA',
      memoryBytes: 12 * GB,
      cores: null,
      driverVersion: '560.94',
    },
  ],
  displays: [],
};

export const SYSTEM_USAGE: SystemUsage = {
  cpuPercent: 23,
  corePercents: [10, 74, 5, 3, 20, 12, 30, 8],
  memoryUsedBytes: 8 * GB,
  memoryTotalBytes: 16 * GB,
  swapUsedBytes: 1 * GB,
  swapTotalBytes: 4 * GB,
};

export const SPEED_TEST_RESULT: SpeedTestResult = {
  downloadMbps: 487.3,
  uploadMbps: 54.27,
  latencyMs: 18.4,
  jitterMs: 2.1,
  downloadLatencyMs: 140,
  uploadLatencyMs: 60,
  dataUsedBytes: 690e6,
  connection: {
    server: 'Frankfurt (FRA)',
    isp: 'Example ISP',
    ip: '203.0.113.7',
    location: 'Belgrade, RS',
  },
};

/** A monitor as `plugin:window|*_monitor` returns it. */
export function monitor(name: string | null, x = 0, width = 2560, height = 1440, scaleFactor = 1) {
  return {
    name,
    scaleFactor,
    position: { x, y: 0 },
    size: { width, height },
    workArea: { position: { x, y: 0 }, size: { width, height } },
  };
}

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
    system_graphics: () => GRAPHICS_INFO,
    system_usage: () => SYSTEM_USAGE,
    'plugin:window|available_monitors': () => [monitor('\\\\.\\DISPLAY1')],
    'plugin:window|current_monitor': () => monitor('\\\\.\\DISPLAY1'),
    'plugin:window|primary_monitor': () => monitor('\\\\.\\DISPLAY1'),
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
