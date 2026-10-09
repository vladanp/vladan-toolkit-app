import { type AppInfo, commands, getAppInfo, isTauri } from '@/core/ipc';

export interface InfoItem {
  label: string;
  value: string;
}

export interface InfoGroup {
  title: string;
  items: InfoItem[];
}

const UNKNOWN = 'Unknown';

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return UNKNOWN;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return UNKNOWN;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const text = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === '' ? UNKNOWN : String(value);

/** Gathers everything the tool shows, from Rust when native and from the browser otherwise. */
export async function loadInfoGroups(): Promise<InfoGroup[]> {
  const app: AppInfo = await getAppInfo();
  const groups: InfoGroup[] = [
    {
      title: 'Application',
      items: [
        { label: 'Version', value: app.version },
        {
          label: 'Runtime',
          value: app.runtime === 'tauri' ? `Tauri ${app.tauriVersion}` : 'Browser',
        },
        { label: 'Webview', value: text(app.webviewVersion) },
      ],
    },
  ];

  if (isTauri()) {
    const system = await commands.systemInfo();
    groups.push(
      {
        title: 'Operating system',
        items: [
          { label: 'Name', value: text(system.osName) },
          { label: 'Version', value: text(system.osVersion) },
          { label: 'Kernel', value: text(system.kernelVersion) },
          { label: 'Uptime', value: formatDuration(system.uptimeSeconds) },
        ],
      },
      {
        title: 'Hardware',
        items: [
          { label: 'Architecture', value: system.arch },
          { label: 'CPU', value: text(system.cpuBrand) },
          {
            label: 'Cores',
            value: system.physicalCores
              ? `${system.physicalCores} physical · ${system.logicalCores} logical`
              : `${system.logicalCores} logical`,
          },
          { label: 'Memory', value: formatBytes(system.totalMemoryBytes) },
        ],
      },
    );
  } else {
    groups.push({
      title: 'Browser',
      items: [
        { label: 'Platform', value: app.os },
        { label: 'Logical cores', value: text(navigator.hardwareConcurrency) },
        { label: 'User agent', value: navigator.userAgent },
      ],
    });
  }

  groups.push({
    title: 'Display & locale',
    items: [
      {
        label: 'Screen',
        value: `${window.screen.width} × ${window.screen.height} @${window.devicePixelRatio}x`,
      },
      { label: 'Language', value: navigator.language },
      { label: 'Time zone', value: Intl.DateTimeFormat().resolvedOptions().timeZone },
    ],
  });

  return groups;
}

/** Markdown for pasting into bug reports. */
export function toMarkdown(groups: InfoGroup[]): string {
  return groups
    .map(
      (group) =>
        `### ${group.title}\n${group.items.map((item) => `- **${item.label}:** ${item.value}`).join('\n')}`,
    )
    .join('\n\n');
}
