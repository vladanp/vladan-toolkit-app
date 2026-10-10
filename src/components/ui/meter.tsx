import { cn } from '@/lib/cn';

export type MeterTone = 'normal' | 'warning' | 'danger';

// The track is a lighter step of the fill's own color, so the state reads across the bar.
const TRACK: Record<MeterTone, string> = {
  normal: 'bg-accent/15',
  warning: 'bg-warning/20',
  danger: 'bg-danger/20',
};
const FILL: Record<MeterTone, string> = {
  normal: 'bg-accent',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export interface MeterProps {
  /** 0 to 1. */
  fraction: number;
  label: string;
  tone?: MeterTone;
  className?: string;
}

/** A thin bar for one ratio against a limit (disk space, battery charge). */
export function Meter({ fraction, label, tone = 'normal', className }: MeterProps) {
  const clamped = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
  const percent = Math.round(clamped * 100);
  return (
    // A native <meter> can't be styled the same way in WebView2, WKWebView and WebKitGTK.
    // biome-ignore lint/a11y/useSemanticElements: see above
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      className={cn('h-1.5 overflow-hidden rounded-full', TRACK[tone], className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', FILL[tone])}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
