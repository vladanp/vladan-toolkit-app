import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  CircleX,
  Gauge,
  type LucideIcon,
  RotateCw,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Meter } from '@/components/ui/meter';
import { Sparkline } from '@/components/ui/sparkline';
import { isTauri } from '@/core/ipc';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/time';
import {
  downloadSeconds,
  formatData,
  formatLocation,
  formatMbps,
  formatMs,
  formatWait,
  type Grade,
  loadedLatency,
  type SavedResult,
  verdicts,
} from './results';
import { type Live, overallProgress, useSpeedTest } from './store';

const PHASE_LABEL: Record<Live['phase'], string> = {
  latency: 'Measuring ping…',
  download: 'Testing download…',
  upload: 'Testing upload…',
};

const GRADES: Record<Grade, { label: string; icon: LucideIcon; className: string }> = {
  great: { label: 'Great', icon: CircleCheck, className: 'text-success' },
  ok: { label: 'Okay', icon: CircleAlert, className: 'text-warning' },
  poor: { label: 'Poor', icon: CircleX, className: 'text-danger' },
};

/** Room for the trace of one transfer phase (about 10 s of readings every 150 ms). */
const TRACE_SLOTS = 70;
/** A typical modern game install, for the "how long would it take" row. */
const GAME_BYTES = 100e9;

function GradeLabel({ grade }: { grade: Grade }) {
  const { label, icon: Icon, className } = GRADES[grade];
  return (
    <span className={cn('flex shrink-0 items-center gap-1 font-medium', className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="flex items-center gap-1.5 text-fg-muted text-xs">
        {Icon && <Icon className="size-3.5" aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className="font-semibold text-3xl text-fg">{value}</span>
        <span className="text-fg-subtle text-xs">{unit}</span>
      </dd>
    </div>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-line border-b px-4 py-2">
        <h3 className="py-0.5 font-medium text-fg text-xs">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Running({ live, onStop }: { live: Live; onStop: () => void }) {
  const transfer = live.phase !== 'latency';
  const current = live.phase === 'download' ? live.downloadMbps : live.uploadMbps;
  const peak = Math.max(1, ...live.trace);
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p aria-live="polite" className="text-fg-muted">
            {PHASE_LABEL[live.phase]}
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-semibold text-5xl text-fg">
              {transfer
                ? formatMbps(current ?? 0)
                : live.latencyMs === null
                  ? '…'
                  : Math.round(live.latencyMs)}
            </span>
            <span className="text-fg-subtle">{transfer ? 'Mbps' : 'ms'}</span>
          </p>
        </div>
        <Button onClick={onStop}>Stop</Button>
      </div>
      <Meter fraction={overallProgress(live)} label="Test progress" />
      {transfer && (
        <Sparkline
          values={live.trace}
          capacity={TRACE_SLOTS}
          max={peak * 1.15}
          label={`${live.phase === 'download' ? 'Download' : 'Upload'} speed so far, peak ${formatMbps(peak)} Mbps`}
          describe={(value) => `${formatMbps(value)} Mbps`}
          className="h-16"
        />
      )}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-fg-subtle text-xs">
        <div className="flex gap-1.5">
          <dt>Ping</dt>
          <dd className="text-fg-muted">
            {live.latencyMs === null ? '…' : formatMs(live.latencyMs)}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Download</dt>
          <dd className="text-fg-muted">
            {live.downloadMbps === null ? '…' : `${formatMbps(live.downloadMbps)} Mbps`}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Upload</dt>
          <dd className="text-fg-muted">
            {live.uploadMbps === null ? '…' : `${formatMbps(live.uploadMbps)} Mbps`}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Results({ result, onStart }: { result: SavedResult; onStart: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 border-line border-b px-4 py-2.5">
        <p className="min-w-0 truncate text-fg-muted text-xs">
          Last test {formatRelativeTime(result.at)}
          {result.server && ` · ${result.server}`}
        </p>
        <Button size="sm" variant="primary" onClick={onStart}>
          <RotateCw className="size-3.5" />
          Run again
        </Button>
      </div>
      <dl className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
        <Stat
          label="Download"
          value={formatMbps(result.downloadMbps)}
          unit="Mbps"
          icon={ArrowDown}
        />
        <Stat label="Upload" value={formatMbps(result.uploadMbps)} unit="Mbps" icon={ArrowUp} />
        <Stat label="Ping" value={String(Math.round(result.latencyMs))} unit="ms" />
        <Stat label="Jitter" value={String(Math.round(result.jitterMs))} unit="ms" />
      </dl>
    </div>
  );
}

function Start({ onStart, native }: { onStart: () => void; native: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <Gauge className="size-8 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
      <h2 className="font-semibold text-base text-fg">How fast is your internet?</h2>
      <p className="max-w-md text-fg-muted">
        Measures download, upload, ping and lag under load in about 25 seconds.
      </p>
      <Button variant="primary" onClick={onStart} disabled={!native}>
        Start test
      </Button>
      {!native && <p className="text-fg-subtle text-xs">The speed test runs in the desktop app.</p>}
    </div>
  );
}

function Meaning({ result }: { result: SavedResult }) {
  const loaded = loadedLatency(result);
  const gameSeconds = downloadSeconds(GAME_BYTES, result.downloadMbps);
  return (
    <Card title="What this means">
      <ul className="divide-y divide-line">
        {verdicts(result).map((verdict) => (
          <li key={verdict.activity} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-28 shrink-0 text-fg">{verdict.activity}</span>
            <GradeLabel grade={verdict.grade} />
            <span className="min-w-0 text-fg-muted text-xs">{verdict.summary}</span>
          </li>
        ))}
        {loaded && (
          <li className="flex items-start gap-3 px-4 py-2.5">
            <span className="w-28 shrink-0 text-fg">Lag under load</span>
            <GradeLabel grade={loaded.grade} />
            <span className="min-w-0 text-fg-muted text-xs">
              Ping goes from {formatMs(result.latencyMs)} to {formatMs(loaded.busyMs)} when the line
              is busy. {loaded.summary}
            </span>
          </li>
        )}
        {gameSeconds !== null && (
          <li className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-28 shrink-0 text-fg">100 GB game</span>
            <span className="text-fg-muted text-xs">
              Downloads in about {formatWait(gameSeconds)}
            </span>
          </li>
        )}
      </ul>
    </Card>
  );
}

function Connection({ result }: { result: SavedResult }) {
  const rows: [string, string | null][] = [
    ['Server', result.server],
    ['Provider', result.isp],
    ['IP address', result.ip],
    ['Location', result.location && formatLocation(result.location)],
    ['Data used', formatData(result.dataUsedBytes)],
  ];
  return (
    <Card title="Connection">
      <dl className="divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-4 px-4 py-2">
            <dt className="w-24 shrink-0 text-fg-subtle">{label}</dt>
            <dd className="min-w-0 select-text break-words text-fg">{value ?? 'Unknown'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function History({ history, onClear }: { history: SavedResult[]; onClear: () => void }) {
  const downloads = history.map((result) => result.downloadMbps).reverse();
  return (
    <Card
      title="History"
      action={
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      }
    >
      {history.length > 1 && (
        <div className="px-4 pt-8 pb-3">
          <Sparkline
            values={downloads}
            capacity={downloads.length}
            max={Math.max(...downloads) * 1.15}
            label={`Download speed over the last ${downloads.length} tests: low ${formatMbps(Math.min(...downloads))}, high ${formatMbps(Math.max(...downloads))} Mbps`}
            describe={(value, index) =>
              `${formatMbps(value)} Mbps · ${formatRelativeTime(history[history.length - 1 - index]?.at ?? 0)}`
            }
          />
        </div>
      )}
      <table className="w-full text-left text-xs tabular-nums">
        <thead className="text-fg-subtle">
          <tr className="border-line border-b">
            <th scope="col" className="px-4 py-2 font-normal">
              When
            </th>
            <th scope="col" className="px-2 py-2 text-right font-normal">
              Download
            </th>
            <th scope="col" className="px-2 py-2 text-right font-normal">
              Upload
            </th>
            <th scope="col" className="px-4 py-2 text-right font-normal">
              Ping
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line text-fg">
          {history.map((result) => (
            <tr key={result.at}>
              <td className="px-4 py-2 text-fg-muted">{formatRelativeTime(result.at)}</td>
              <td className="px-2 py-2 text-right">{formatMbps(result.downloadMbps)} Mbps</td>
              <td className="px-2 py-2 text-right">{formatMbps(result.uploadMbps)} Mbps</td>
              <td className="px-4 py-2 text-right">{formatMs(result.latencyMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function SpeedTest() {
  const status = useSpeedTest((state) => state.status);
  const live = useSpeedTest((state) => state.live);
  const error = useSpeedTest((state) => state.error);
  const history = useSpeedTest((state) => state.history);
  const { start, cancel, clearHistory } = useSpeedTest.getState();
  const native = isTauri();
  const latest = history[0];
  const onStart = () => void start();

  return (
    <div className="space-y-6">
      <section
        aria-label="Speed test"
        className="overflow-hidden rounded-lg border border-line bg-surface"
      >
        {status === 'running' && live ? (
          <Running live={live} onStop={() => void cancel()} />
        ) : latest ? (
          <Results result={latest} onStart={onStart} />
        ) : (
          <Start onStart={onStart} native={native} />
        )}
        {status === 'error' && (
          <p role="alert" className="border-line border-t px-4 py-3 text-danger">
            Speed test failed: {error}
          </p>
        )}
      </section>
      {latest && status !== 'running' && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Meaning result={latest} />
            <Connection result={latest} />
          </div>
          <History history={history} onClear={clearHistory} />
        </>
      )}
      <p className="text-fg-subtle text-xs">
        Tests run against Cloudflare's speed test network, which sees your IP address like any
        website does. Results stay on this computer.
      </p>
    </div>
  );
}
