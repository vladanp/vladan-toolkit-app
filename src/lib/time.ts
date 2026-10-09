const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

/** Human friendly relative time, e.g. "5 min. ago". Anything under a minute is "just now". */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = timestamp - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return 'just now';
}
