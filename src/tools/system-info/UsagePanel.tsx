import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Sparkline } from '@/components/ui/sparkline';
import { formatBytes, formatPercent } from './format';
import { memoryPercent, useSystemUsage } from './use-usage';

const INTERVAL_MS = 2000;
/** Two minutes of history. */
const SAMPLES = 60;

const ago = (index: number, count: number) => {
  const seconds = ((count - 1 - index) * INTERVAL_MS) / 1000;
  return seconds === 0 ? 'now' : `${seconds} s ago`;
};

function trendLabel(name: string, values: readonly number[]): string {
  if (values.length === 0) return `${name} over the last 2 minutes`;
  return `${name} over the last 2 minutes: low ${formatPercent(Math.min(...values))}, high ${formatPercent(Math.max(...values))}`;
}

function UsageTile({
  title,
  value,
  caption,
  values,
  footer,
}: {
  title: string;
  value: string;
  caption: string;
  values: number[];
  footer: ReactNode;
}) {
  const peak = values.length > 0 ? Math.max(...values) : 0;
  return (
    <div className="min-w-0 space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-fg-muted text-xs">{title}</h3>
        <span className="text-fg-subtle text-xs">Peak {formatPercent(peak)} in 2 min</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-2xl text-fg">{value}</span>
        <span className="truncate text-fg-subtle text-xs">{caption}</span>
      </div>
      <Sparkline
        values={values}
        capacity={SAMPLES}
        max={100}
        label={trendLabel(title, values)}
        describe={(point, index) => `${formatPercent(point)} · ${ago(index, values.length)}`}
      />
      <div className="flex min-h-6 items-end justify-between gap-3 text-fg-subtle text-xs">
        {footer}
      </div>
    </div>
  );
}

/** One slim column per logical core; hover a column for its exact load. */
function CoreStrip({ cores }: { cores: readonly number[] }) {
  const busiest = cores.length > 0 ? Math.max(...cores) : 0;
  return (
    <>
      <span>Busiest core {formatPercent(busiest)}</span>
      <div aria-hidden="true" className="flex h-6 max-w-[60%] flex-1 items-end justify-end gap-0.5">
        {cores.map((load, index) => (
          <div
            // Cores never reorder, so the index is a stable identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            title={`Core ${index + 1}: ${formatPercent(load)}`}
            className="flex h-full min-w-0.5 max-w-3 flex-1 items-end rounded-[2px] bg-active"
          >
            <div
              className="w-full rounded-[2px] bg-accent"
              style={{ height: `${Math.max(load, 4)}%` }}
            />
          </div>
        ))}
      </div>
    </>
  );
}

/** Live CPU and memory load, refreshed every two seconds while the page is visible. */
export function UsagePanel() {
  const { usage, history, error } = useSystemUsage(INTERVAL_MS, SAMPLES);

  if (error && !usage) {
    return <p className="text-fg-subtle">Live usage isn't available: {error}</p>;
  }

  const memory = usage ? memoryPercent(usage) : 0;

  return (
    <section
      aria-label="Live usage"
      aria-busy={!usage}
      className="grid min-h-44 divide-line overflow-hidden rounded-lg border border-line bg-surface max-md:divide-y md:grid-cols-2 md:divide-x"
    >
      {usage && (
        <>
          <UsageTile
            title="CPU"
            value={formatPercent(usage.cpuPercent ?? 0)}
            caption={`${usage.corePercents.length} threads`}
            values={history.map((sample) => sample.cpu)}
            footer={<CoreStrip cores={usage.corePercents.map((load) => load ?? 0)} />}
          />
          <UsageTile
            title="Memory"
            value={formatPercent(memory)}
            caption={`${formatBytes(usage.memoryUsedBytes)} of ${formatBytes(usage.memoryTotalBytes)} in use`}
            values={history.map((sample) => sample.memory)}
            footer={
              <>
                <span>
                  {usage.swapTotalBytes
                    ? `Swap ${formatBytes(usage.swapUsedBytes)} of ${formatBytes(usage.swapTotalBytes)}`
                    : 'No swap'}
                </span>
                {memory >= 90 && (
                  <span className="flex items-center gap-1 text-warning">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    Almost full
                  </span>
                )}
              </>
            }
          />
        </>
      )}
    </section>
  );
}
