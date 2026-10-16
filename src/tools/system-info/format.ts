export const UNKNOWN = 'Unknown';

/** `16.0` → `"16"`, `15.64` → `"15.6"`: one decimal below 100, none above. */
function compact(value: number): string {
  return String(Number(value.toFixed(value >= 100 ? 0 : 1)));
}

/**
 * Human-readable size. Memory always uses 1024; disks on macOS use 1000 so the numbers
 * match Finder (Windows Explorer uses 1024 and calls it GB too).
 */
export function formatBytes(bytes: number | null | undefined, base: 1000 | 1024 = 1024): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return UNKNOWN;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
  return `${compact(bytes / base ** exponent)} ${units[exponent]}`;
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

/** `3700` MHz → `"3.7 GHz"`. */
export function formatFrequency(mhz: number): string {
  return mhz >= 1000 ? `${Number((mhz / 1000).toFixed(2))} GHz` : `${Math.round(mhz)} MHz`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** `120` → `"120 Hz"`, `59.94` → `"59.94 Hz"`. */
export function formatRefreshRate(hz: number): string {
  return `${Number(hz.toFixed(2))} Hz`;
}

/** Refresh rates monitors actually ship with. */
export const COMMON_REFRESH_RATES = [
  24, 30, 48, 50, 60, 75, 90, 100, 120, 144, 165, 170, 175, 180, 200, 240, 280, 360, 480, 500, 540,
];

/** A measured rate within 3% of a common one is that rate (frame timing is noisy). */
export function snapRefreshRate(hz: number): number {
  return COMMON_REFRESH_RATES.find((rate) => Math.abs(hz - rate) / rate < 0.03) ?? Math.round(hz);
}

/** `"Dell Inc."` → `"Dell"`, `"ASUSTeK COMPUTER INC."` → `"ASUSTeK COMPUTER"`. */
export function shortCompany(name: string): string {
  return name
    .replace(/,?\s+(inc\.?|corporation|corp\.?|co\.,? ltd\.?|ltd\.?|llc|gmbh)$/i, '')
    .trim();
}
