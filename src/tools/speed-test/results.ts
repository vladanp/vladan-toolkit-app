import type { SpeedTestResult } from '@/bindings';

/** A finished test as the history keeps it. */
export interface SavedResult {
  /** When it finished, epoch ms. */
  at: number;
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs: number;
  downloadLatencyMs: number | null;
  uploadLatencyMs: number | null;
  dataUsedBytes: number;
  server: string | null;
  isp: string | null;
  ip: string | null;
  location: string | null;
}

export function toSaved(result: SpeedTestResult, at: number): SavedResult {
  return {
    at,
    downloadMbps: result.downloadMbps ?? 0,
    uploadMbps: result.uploadMbps ?? 0,
    latencyMs: result.latencyMs ?? 0,
    jitterMs: result.jitterMs ?? 0,
    downloadLatencyMs: result.downloadLatencyMs,
    uploadLatencyMs: result.uploadLatencyMs,
    dataUsedBytes: result.dataUsedBytes ?? 0,
    ...result.connection,
  };
}

/** `487.3` → `"487"`, `54.27` → `"54.3"`, `8.214` → `"8.2"`. */
export function formatMbps(mbps: number): string {
  return mbps >= 100 ? String(Math.round(mbps)) : String(Number(mbps.toFixed(1)));
}

/** Data volume the way providers count it (1000 based): `"312 MB"`, `"1.2 GB"`. */
export function formatData(bytes: number): string {
  if (bytes >= 1e9) return `${Number((bytes / 1e9).toFixed(1))} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

const regions = new Intl.DisplayNames(['en'], { type: 'region' });

/** `"Belgrade, RS"` → `"Belgrade, Serbia"`, `"NL"` → `"Netherlands"`. */
export function formatLocation(location: string): string {
  return location
    .split(', ')
    .map((part) => (/^[A-Z]{2}$/.test(part) ? (regions.of(part) ?? part) : part))
    .join(', ');
}

export function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

/** `1h 52m`, `3m 10s`, `40s`. */
export function formatWait(seconds: number): string {
  const total = Math.max(1, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${total % 60}s`;
  return `${total}s`;
}

export type Grade = 'great' | 'ok' | 'poor';

export interface Verdict {
  activity: string;
  grade: Grade;
  summary: string;
}

/** The first tier whose test passes, or poor with `otherwise`. */
function grade(
  activity: string,
  tiers: [passes: boolean, grade: Grade, summary: string][],
  otherwise: string,
): Verdict {
  const tier = tiers.find(([passes]) => passes);
  return tier
    ? { activity, grade: tier[1], summary: tier[2] }
    : { activity, grade: 'poor', summary: otherwise };
}

/** What the numbers mean for things people actually do. */
export function verdicts(result: SavedResult): Verdict[] {
  const { downloadMbps: down, uploadMbps: up, latencyMs: ping, jitterMs: jitter } = result;
  return [
    // Netflix asks for 15 Mbps per 4K stream.
    grade(
      '4K streaming',
      [
        [down >= 40, 'great', 'Several 4K streams at once'],
        [down >= 15, 'ok', 'One 4K stream at a time'],
      ],
      'Streams will drop to HD',
    ),
    grade(
      'Online gaming',
      [
        [ping <= 30 && jitter <= 5, 'great', 'Very responsive'],
        [ping <= 70 && jitter <= 20, 'ok', 'Fine for most games'],
      ],
      'Expect noticeable lag',
    ),
    grade(
      'Video calls',
      [
        [up >= 4 && down >= 4, 'great', 'HD video both ways'],
        [up >= 1.5, 'ok', 'Video may drop to lower quality'],
      ],
      'Calls will struggle',
    ),
  ];
}

export interface LoadedLatency {
  /** The worst latency while downloading or uploading. */
  busyMs: number;
  /** How much the connection adds when it is busy. */
  addedMs: number;
  grade: Grade;
  summary: string;
}

/**
 * Latency while the line is busy compared to idle. A big jump ("bufferbloat") makes games
 * lag whenever someone else in the house streams or downloads.
 */
export function loadedLatency(result: SavedResult): LoadedLatency | null {
  const busy = [result.downloadLatencyMs, result.uploadLatencyMs].filter(
    (value): value is number => value !== null,
  );
  if (busy.length === 0) return null;
  const busyMs = Math.max(...busy);
  const addedMs = Math.max(0, busyMs - result.latencyMs);
  if (addedMs < 30) {
    return { busyMs, addedMs, grade: 'great', summary: 'Stays responsive when the line is busy' };
  }
  if (addedMs < 100) {
    return {
      busyMs,
      addedMs,
      grade: 'ok',
      summary: 'Some lag when someone else streams or downloads',
    };
  }
  return {
    busyMs,
    addedMs,
    grade: 'poor',
    summary:
      'Games will lag when someone else streams or downloads. A router with Smart Queue Management (SQM) fixes this.',
  };
}

/** Seconds to download `bytes` at `mbps`. */
export function downloadSeconds(bytes: number, mbps: number): number | null {
  return mbps > 0 ? (bytes * 8) / (mbps * 1_000_000) : null;
}
