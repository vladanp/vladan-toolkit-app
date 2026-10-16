import { type PointerEvent, useState } from 'react';
import { cn } from '@/lib/cn';

export interface SparklineProps {
  values: readonly number[];
  /** Slots on the x axis. The newest value sits at the right edge, so the line fills in. */
  capacity: number;
  /** The top of the y axis (the bottom is 0). */
  max: number;
  /** What the line shows, for screen readers; include the numbers that matter. */
  label: string;
  /** Hover readout for one point, e.g. `"34% · 12 s ago"`. */
  describe: (value: number, index: number) => string;
  className?: string;
}

/**
 * A small single-series trend: a 2px line over a light wash, the latest value marked by
 * a dot. Hovering shows a hairline and the value under the pointer.
 */
export function Sparkline({ values, capacity, max, label, describe, className }: SparklineProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const slots = Math.max(capacity, values.length, 2);
  const offset = slots - values.length;
  const x = (index: number) => ((offset + index) / (slots - 1)) * 100;
  const y = (value: number) => 100 - Math.min(Math.max(value / max, 0), 1) * 100;
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const lastIndex = values.length - 1;
  const last = values[lastIndex];
  const hoveredValue = hovered === null ? undefined : values[hovered];

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const slot = Math.round(((event.clientX - rect.left) / rect.width) * (slots - 1));
    const index = slot - offset;
    setHovered(index >= 0 && index <= lastIndex ? index : null);
  };

  return (
    <div
      role="img"
      aria-label={label}
      className={cn('relative h-10 border-line border-b', className)}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHovered(null)}
    >
      {values.length > 1 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <polygon
            points={`${x(0)},100 ${points} ${x(lastIndex)},100`}
            className="fill-accent/10"
          />
          <polyline
            points={points}
            fill="none"
            className="stroke-accent"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {last !== undefined && (
        <span
          aria-hidden="true"
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
          style={{ left: `${x(lastIndex)}%`, top: `${y(last)}%` }}
        />
      )}
      {hovered !== null && hoveredValue !== undefined && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-line-strong"
            style={{ left: `${x(hovered)}%` }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-md bg-elevated px-1.5 py-0.5 text-[11px] text-fg shadow-popover"
            style={{ left: `${Math.min(Math.max(x(hovered), 12), 88)}%` }}
          >
            {describe(hoveredValue, hovered)}
          </span>
        </>
      )}
    </div>
  );
}
