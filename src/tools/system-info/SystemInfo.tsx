import { Check, Copy, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Meter } from '@/components/ui/meter';
import { cn } from '@/lib/cn';
import {
  type Basics,
  buildReport,
  DETECTING,
  type Graphics,
  type InfoGroup,
  loadBasics,
  loadGraphics,
  loadMarkdown,
  toMarkdown,
} from './info';
import { UsagePanel } from './UsagePanel';

export async function copySystemInfo(): Promise<void> {
  await navigator.clipboard.writeText(await loadMarkdown());
  toast.success('System info copied as Markdown');
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

function InfoCard({ group }: { group: InfoGroup }) {
  return (
    <section aria-label={group.title} className="rounded-lg border border-line bg-surface">
      <h3 className="border-line border-b px-4 py-2.5 font-medium text-fg text-xs">
        {group.title}
      </h3>
      <dl className="divide-y divide-line">
        {group.items.map((item, index) => (
          // Rows never reorder, and two displays or drives can share a name.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <div key={index} className="flex gap-4 px-4 py-2">
            <dt className="w-28 shrink-0 break-words text-fg-subtle">{item.label}</dt>
            <dd className="min-w-0 flex-1 space-y-1.5">
              <div
                className={cn(
                  'select-text break-words font-mono text-xs leading-5',
                  item.value === DETECTING ? 'text-fg-subtle' : 'text-fg',
                )}
              >
                {item.value}
              </div>
              {item.meter && (
                <Meter
                  fraction={item.meter.fraction}
                  tone={item.meter.tone}
                  label={`${item.label} used`}
                />
              )}
              {(item.status || item.detail) && (
                <div className="flex flex-wrap items-center gap-x-2 text-fg-subtle text-xs">
                  {item.status && (
                    <span
                      className={cn(
                        'flex items-center gap-1 font-medium',
                        item.meter?.tone === 'danger' ? 'text-danger' : 'text-warning',
                      )}
                    >
                      <TriangleAlert className="size-3.5" aria-hidden="true" />
                      {item.status}
                    </span>
                  )}
                  {item.detail && <span>{item.detail}</span>}
                </div>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function SystemInfo() {
  const [basics, setBasics] = useState<Basics>();
  const [graphics, setGraphics] = useState<Graphics>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [generation, setGeneration] = useState(0);
  const graphicsRequest = useRef<Promise<Graphics>>(undefined);

  // `generation` is the Refresh button: bumping it loads everything again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    let active = true;
    const request = loadGraphics().catch((): Graphics => ({ gpus: [], displays: [] }));
    graphicsRequest.current = request;
    void request.then((result) => active && setGraphics(result));
    loadBasics().then(
      (result) => active && setBasics(result),
      (cause: unknown) => active && setError(message(cause)),
    );
    return () => {
      active = false;
    };
  }, [generation]);

  if (error) {
    return (
      <p role="alert" className="text-danger">
        Couldn't read system info: {error}
      </p>
    );
  }

  if (!basics) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Loading system info">
        <LoaderCircle className="size-5 animate-spin text-fg-subtle" />
      </div>
    );
  }

  const report = buildReport(basics, graphics);

  const refresh = () => {
    setGraphics(undefined);
    setGeneration((value) => value + 1);
  };

  const copy = async () => {
    const complete = graphics ?? (await graphicsRequest.current);
    await navigator.clipboard.writeText(toMarkdown(buildReport(basics, complete)));
    setCopied(true);
    toast.success('System info copied as Markdown');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-base text-fg">{report.title}</h2>
          <p className="text-fg-muted">{report.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={refresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => void copy()}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copy as Markdown
          </Button>
        </div>
      </header>
      {basics.system && <UsagePanel key={generation} />}
      <div className="grid gap-4 md:grid-cols-2">
        {report.groups.map((group) => (
          <InfoCard key={group.title} group={group} />
        ))}
      </div>
    </div>
  );
}
