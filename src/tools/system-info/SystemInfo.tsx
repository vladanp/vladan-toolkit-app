import { Check, Copy, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { type InfoGroup, loadInfoGroups, toMarkdown } from './info';

export async function copySystemInfo(): Promise<void> {
  await navigator.clipboard.writeText(toMarkdown(await loadInfoGroups()));
  toast.success('System info copied as Markdown');
}

export default function SystemInfo() {
  const [groups, setGroups] = useState<InfoGroup[]>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    loadInfoGroups().then(
      (result) => active && setGroups(result),
      (cause: unknown) =>
        active && setError(cause instanceof Error ? cause.message : String(cause)),
    );
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-danger">
        Couldn't read system info: {error}
      </p>
    );
  }

  if (!groups) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Loading system info">
        <LoaderCircle className="size-5 animate-spin text-fg-subtle" />
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(groups));
    setCopied(true);
    toast.success('System info copied as Markdown');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-fg-muted">
          Useful when filing a bug report or setting up a new machine.
        </p>
        <Button size="sm" onClick={() => void copy()}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          Copy as Markdown
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.title}
            aria-label={group.title}
            className="rounded-lg border border-line bg-surface"
          >
            <h2 className="border-line border-b px-4 py-2.5 font-medium text-fg text-xs">
              {group.title}
            </h2>
            <dl className="divide-y divide-line">
              {group.items.map((item) => (
                <div key={item.label} className="flex gap-4 px-4 py-2">
                  <dt className="w-28 shrink-0 text-fg-subtle">{item.label}</dt>
                  <dd className="min-w-0 select-text break-words font-mono text-fg text-xs leading-5">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
