import { Link } from '@tanstack/react-router';
import { ArrowRight, House, Sparkles } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import { ariaKeyShortcut, type Shortcut } from '@/core/hotkeys';
import { SHORTCUTS, toolShortcut } from '@/core/shortcuts';
import { useUsage } from '@/core/stores/usage';
import { greeting } from '@/lib/greeting';
import { formatRelativeTime } from '@/lib/time';
import { useRegistry } from '../registry-context';
import { Page } from '../shell/Page';

function Hint({ shortcut, label }: { shortcut: Shortcut; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg-muted text-xs">
      <Kbd shortcut={shortcut} />
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-line border-dashed px-6 py-12 text-center">
      <Sparkles className="mx-auto size-5 text-accent-text" />
      <p className="mt-3 font-medium text-fg">No tools yet</p>
      <p className="mt-1 text-fg-subtle">
        Scaffold one with <code className="font-mono text-fg-muted">pnpm new:tool my-tool</code>
      </p>
    </div>
  );
}

export function HomePage() {
  const { tools } = useRegistry();
  const lastUsed = useUsage((s) => s.lastUsed);

  return (
    <Page title="Home" icon={House}>
      <div className="space-y-10">
        <div>
          <h2 className="font-semibold text-2xl text-fg tracking-tight">{greeting()}, Vladan</h2>
          <p className="mt-1 text-fg-muted">Everything you need, one keystroke away.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Hint shortcut={SHORTCUTS.palette} label="Search everything" />
            <Hint shortcut={SHORTCUTS.sidebar} label="Toggle sidebar" />
            <Hint shortcut={SHORTCUTS.settings} label="Settings" />
          </div>
        </div>

        <section aria-labelledby="home-tools">
          <h3
            id="home-tools"
            className="mb-3 font-medium text-[11px] text-fg-subtle uppercase tracking-wider"
          >
            Tools
          </h3>
          {tools.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {tools.map((tool, index) => {
                const Icon = tool.icon;
                const used = lastUsed[tool.id];
                const shortcut = toolShortcut(index);
                return (
                  <li key={tool.id}>
                    <Link
                      to="/tools/$toolId"
                      params={{ toolId: tool.id }}
                      aria-keyshortcuts={shortcut ? ariaKeyShortcut(shortcut) : undefined}
                      className="group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-hover"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-panel">
                        <Icon
                          className="size-4 text-fg-muted group-hover:text-accent-text"
                          strokeWidth={1.75}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-fg">{tool.name}</span>
                        <span className="block truncate text-fg-subtle text-xs">
                          {tool.description}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-fg-subtle text-xs sm:block">
                        {used ? formatRelativeTime(used) : 'Never opened'}
                      </span>
                      {shortcut && (
                        <Kbd shortcut={shortcut} decorative className="hidden sm:inline-flex" />
                      )}
                      <ArrowRight className="size-4 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
