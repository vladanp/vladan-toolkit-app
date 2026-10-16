import { availableMonitors, currentMonitor, primaryMonitor } from '@tauri-apps/api/window';
import type {
  BatteryInfo,
  DiskInfo,
  DisplayInfo,
  GpuInfo,
  NetworkInfo,
  SystemInfo,
} from '@/bindings';
import { type AppInfo, commands, getAppInfo, isTauri } from '@/core/ipc';
import { platform as hostPlatform, type Platform } from '@/core/platform';
import {
  formatBytes,
  formatDuration,
  formatFrequency,
  formatPercent,
  formatRefreshRate,
  shortCompany,
  UNKNOWN,
} from './format';
import { measureRefreshRate } from './refresh-rate';

export type Tone = 'normal' | 'warning' | 'danger';

export interface InfoMeter {
  /** 0 to 1. */
  fraction: number;
  tone: Tone;
}

export interface InfoItem {
  label: string;
  value: string;
  /** A quieter second line under the value. */
  detail?: string;
  meter?: InfoMeter;
  /** Says in words what a warning or danger meter shows in color. */
  status?: string;
}

export interface InfoGroup {
  title: string;
  items: InfoItem[];
}

export interface Display {
  name: string;
  width: number;
  height: number;
  scale: number;
  refreshHz: number | null;
  primary: boolean;
  /** The refresh rate was timed in the webview rather than reported by the OS. */
  measured: boolean;
}

/** The quick part: app details and, in the desktop app, the machine snapshot. */
export interface Basics {
  app: AppInfo;
  system: SystemInfo | null;
}

/** The slower part: graphics cards and displays. */
export interface Graphics {
  gpus: GpuInfo[];
  displays: Display[];
}

export interface Report {
  title: string;
  subtitle: string;
  groups: InfoGroup[];
}

export const DETECTING = 'Detecting…';

export async function loadBasics(): Promise<Basics> {
  const app = await getAppInfo();
  return { app, system: isTauri() ? await commands.systemInfo() : null };
}

/** Windows names monitors `\\.\DISPLAY1`; that means nothing to a person. */
function monitorName(name: string | null, index: number): string {
  return name && !name.startsWith('\\\\.\\') ? name : `Display ${index + 1}`;
}

/** The parts of Tauri's `Monitor` this page reads. */
export interface MonitorLike {
  name: string | null;
  scaleFactor: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

function sameMonitor(a: MonitorLike, b: MonitorLike | null): boolean {
  return (
    b !== null &&
    a.name === b.name &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y
  );
}

/** Monitors as Tauri reports them, with the measured refresh rate on the window's own. */
export function displaysFromMonitors(
  monitors: readonly MonitorLike[],
  current: MonitorLike | null,
  primary: MonitorLike | null,
  refreshHz: number | null,
): Display[] {
  return monitors.map((monitor, index) => {
    const isCurrent = sameMonitor(monitor, current);
    return {
      name: monitorName(monitor.name, index),
      width: monitor.size.width,
      height: monitor.size.height,
      scale: monitor.scaleFactor,
      refreshHz: isCurrent ? refreshHz : null,
      primary: sameMonitor(monitor, primary),
      measured: isCurrent && refreshHz !== null,
    };
  });
}

function fromNative(display: DisplayInfo): Display {
  return { ...display, scale: display.scale ?? 1, measured: false };
}

/**
 * Graphics cards and displays. macOS reports displays with their refresh rate; elsewhere
 * the list comes from Tauri and the current screen's refresh rate is measured.
 */
export async function loadGraphics(measure = () => measureRefreshRate()): Promise<Graphics> {
  if (!isTauri()) {
    const refreshHz = await measure();
    const ratio = window.devicePixelRatio;
    return {
      gpus: [],
      displays: [
        {
          name: 'This screen',
          width: Math.round(window.screen.width * ratio),
          height: Math.round(window.screen.height * ratio),
          scale: ratio,
          refreshHz,
          primary: false,
          measured: refreshHz !== null,
        },
      ],
    };
  }
  const graphics = await commands.systemGraphics();
  if (graphics.displays.length > 0) {
    return { gpus: graphics.gpus, displays: graphics.displays.map(fromNative) };
  }
  const [monitors, current, primary, refreshHz] = await Promise.all([
    availableMonitors().catch(() => []),
    currentMonitor().catch(() => null),
    primaryMonitor().catch(() => null),
    measure(),
  ]);
  return {
    gpus: graphics.gpus,
    displays: displaysFromMonitors(monitors, current, primary, refreshHz),
  };
}

const join = (parts: readonly (string | false | null | undefined)[]): string | undefined =>
  parts.filter(Boolean).join(' · ') || undefined;

function deviceTitle(system: SystemInfo): string {
  const { vendor, model } = system.device;
  if (!model) return system.hostName ?? 'This computer';
  if (!vendor || /^apple/i.test(vendor)) return model;
  const company = shortCompany(vendor);
  return model.toLowerCase().startsWith(company.toLowerCase()) ? model : `${company} ${model}`;
}

function gpuItems(gpus: readonly GpuInfo[] | undefined): InfoItem[] {
  if (!gpus) return [{ label: 'GPU', value: DETECTING }];
  if (gpus.length === 0) return [{ label: 'GPU', value: UNKNOWN }];
  return gpus.map((gpu, index) => ({
    label: gpus.length > 1 ? `GPU ${index + 1}` : 'GPU',
    value: gpu.name,
    detail: join([
      gpu.vendor && !gpu.name.toLowerCase().startsWith(gpu.vendor.toLowerCase()) && gpu.vendor,
      gpu.memoryBytes
        ? `${formatBytes(gpu.memoryBytes)} video memory`
        : gpu.vendor === 'Apple' && 'Shares system memory',
      gpu.cores ? `${gpu.cores} cores` : null,
      gpu.driverVersion && `Driver ${gpu.driverVersion}`,
    ]),
  }));
}

function displayItems(displays: readonly Display[] | undefined): InfoItem[] {
  if (!displays) return [{ label: 'Displays', value: DETECTING }];
  if (displays.length === 0) return [{ label: 'Displays', value: UNKNOWN }];
  return displays.map((display) => ({
    label: display.name,
    value: `${display.width} × ${display.height}${
      display.refreshHz ? ` at ${formatRefreshRate(display.refreshHz)}` : ''
    }`,
    detail: join([
      display.primary && 'Main display',
      display.scale !== 1 && `${Math.round(display.scale * 100)}% scale`,
      display.measured && 'Refresh rate measured',
    ]),
  }));
}

function diskLabel(disk: DiskInfo, platform: Platform): string {
  if (platform === 'windows') {
    const drive = disk.mountPoint.replace(/\\$/, '');
    return disk.name ? `${drive} ${disk.name}` : drive;
  }
  return disk.name && !disk.name.startsWith('/dev/') ? disk.name : disk.mountPoint;
}

function diskItem(disk: DiskInfo, platform: Platform): InfoItem {
  const base = platform === 'macos' ? 1000 : 1024;
  const total = disk.totalBytes ?? 0;
  const free = total > 0 ? (disk.availableBytes ?? 0) / total : 1;
  const tone: Tone = free < 0.05 ? 'danger' : free < 0.15 ? 'warning' : 'normal';
  return {
    label: diskLabel(disk, platform),
    value: `${formatBytes(disk.availableBytes, base)} free of ${formatBytes(disk.totalBytes, base)}`,
    detail: join([
      disk.kind !== 'unknown' && disk.kind.toUpperCase(),
      disk.fileSystem,
      disk.removable && 'Removable',
    ]),
    meter: { fraction: 1 - free, tone },
    status: { normal: undefined, warning: 'Running low', danger: 'Almost full' }[tone],
  };
}

function networkItems(networks: readonly NetworkInfo[]): InfoItem[] {
  if (networks.length === 0) return [{ label: 'Status', value: 'Not connected' }];
  return networks.map((network) => ({
    label: network.name,
    value: network.addresses[0] ?? UNKNOWN,
    detail: join(network.addresses.slice(1)),
  }));
}

const BATTERY_STATES: Record<BatteryInfo['state'], string | undefined> = {
  charging: 'charging',
  discharging: 'on battery',
  full: 'fully charged',
  empty: 'empty',
  paused: 'charging paused',
  unknown: undefined,
};

function batteryItems(battery: BatteryInfo): InfoItem[] {
  const charge = battery.chargePercent ?? 0;
  const onBattery = battery.state === 'discharging';
  const chargeTone: Tone =
    onBattery && charge < 10 ? 'danger' : onBattery && charge < 20 ? 'warning' : 'normal';
  const state = BATTERY_STATES[battery.state];
  const items: InfoItem[] = [
    {
      label: 'Charge',
      value: `${formatPercent(charge)}${state ? `, ${state}` : ''}`,
      meter: { fraction: charge / 100, tone: chargeTone },
      status: { normal: undefined, warning: 'Low', danger: 'Very low' }[chargeTone],
    },
  ];
  if (onBattery && battery.secondsToEmpty) {
    items.push({ label: 'Time left', value: formatDuration(battery.secondsToEmpty) });
  }
  if (battery.state === 'charging' && battery.secondsToFull) {
    items.push({ label: 'Time to full', value: formatDuration(battery.secondsToFull) });
  }
  if (battery.healthPercent !== null) {
    const worn = battery.healthPercent < 80;
    items.push({
      label: 'Health',
      value: `${formatPercent(battery.healthPercent)} of original capacity`,
      meter: { fraction: battery.healthPercent / 100, tone: worn ? 'warning' : 'normal' },
      status: worn ? 'Service recommended' : undefined,
    });
  }
  if (battery.cycleCount !== null) {
    items.push({ label: 'Charge cycles', value: String(battery.cycleCount) });
  }
  return items;
}

function appGroup(app: AppInfo): InfoGroup {
  return {
    title: 'App & region',
    items: [
      { label: 'App version', value: app.version },
      {
        label: 'Runtime',
        value: app.runtime === 'tauri' ? `Tauri ${app.tauriVersion}` : 'Browser',
      },
      { label: 'Webview', value: app.webviewVersion ?? UNKNOWN },
      { label: 'Language', value: navigator.language },
      { label: 'Time zone', value: Intl.DateTimeFormat().resolvedOptions().timeZone },
    ],
  };
}

/**
 * Everything the page shows, as plain data: the same report renders the cards and the
 * Markdown copy. Pass `graphics` as `undefined` while it is still loading.
 */
export function buildReport(
  { app, system }: Basics,
  graphics: Graphics | undefined,
  platform: Platform = hostPlatform,
): Report {
  const graphicsGroup = { title: 'Graphics', items: gpuItems(graphics?.gpus) };
  const displaysGroup = { title: 'Displays', items: displayItems(graphics?.displays) };

  if (!system) {
    return {
      title: 'This browser',
      subtitle: 'Open the desktop app for hardware, drives, network and live usage.',
      groups: [
        {
          title: 'Browser',
          items: [
            { label: 'Platform', value: app.os },
            { label: 'Logical cores', value: String(navigator.hardwareConcurrency || UNKNOWN) },
            { label: 'User agent', value: navigator.userAgent },
          ],
        },
        displaysGroup,
        appGroup(app),
      ],
    };
  }

  const { device } = system;
  const model = device.model ? deviceTitle(system) : null;
  const groups: InfoGroup[] = [
    {
      title: 'Device',
      items: [
        { label: 'Computer name', value: system.hostName ?? UNKNOWN },
        ...(model ? [{ label: 'Model', value: model }] : []),
        ...(device.motherboard ? [{ label: 'Motherboard', value: device.motherboard }] : []),
        {
          label: 'Memory',
          value: formatBytes(system.totalMemoryBytes),
          detail: system.totalSwapBytes
            ? `Plus ${formatBytes(system.totalSwapBytes)} swap`
            : undefined,
        },
      ],
    },
    {
      title: 'Processor',
      items: [
        { label: 'Model', value: system.cpuBrand ?? UNKNOWN },
        {
          label: 'Cores',
          value: system.physicalCores
            ? `${system.physicalCores} cores, ${system.logicalCores} threads`
            : `${system.logicalCores} threads`,
        },
        ...(system.cpuFrequencyMhz
          ? [{ label: 'Speed', value: formatFrequency(system.cpuFrequencyMhz) }]
          : []),
        { label: 'Architecture', value: system.arch },
      ],
    },
    graphicsGroup,
    displaysGroup,
  ];
  if (system.disks.length > 0) {
    groups.push({ title: 'Storage', items: system.disks.map((disk) => diskItem(disk, platform)) });
  }
  groups.push({ title: 'Network', items: networkItems(system.networks) });
  if (system.battery) groups.push({ title: 'Battery', items: batteryItems(system.battery) });
  groups.push(
    {
      title: 'Operating system',
      items: [
        { label: 'Name', value: system.osName ?? UNKNOWN },
        { label: 'Version', value: system.osVersion ?? UNKNOWN },
        { label: 'Kernel', value: system.kernelVersion ?? UNKNOWN },
        { label: 'Uptime', value: formatDuration(system.uptimeSeconds) },
      ],
    },
    appGroup(app),
  );

  return {
    title: deviceTitle(system),
    subtitle:
      join([
        system.osVersion ?? system.osName,
        system.cpuBrand,
        `up ${formatDuration(system.uptimeSeconds)}`,
      ]) ?? '',
    groups,
  };
}

/** Markdown for pasting into bug reports or notes. */
export function toMarkdown(report: Report): string {
  const groups = report.groups.map((group) => {
    const lines = group.items.map((item) => {
      const extra = join([item.status, item.detail]);
      return `- **${item.label}:** ${item.value}${extra ? ` (${extra})` : ''}`;
    });
    return `### ${group.title}\n${lines.join('\n')}`;
  });
  return [`## ${report.title}\n${report.subtitle}`, ...groups].join('\n\n');
}

/** Loads everything (waiting for graphics too) and returns the Markdown. */
export async function loadMarkdown(): Promise<string> {
  const [basics, graphics] = await Promise.all([loadBasics(), loadGraphics()]);
  return toMarkdown(buildReport(basics, graphics));
}
