import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)} aria-label={title}>
      <header>
        <h2 className="font-medium text-[13px] text-fg">{title}</h2>
        {description && <p className="text-fg-subtle text-xs">{description}</p>}
      </header>
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

export function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-fg">{label}</div>
        {description && <div className="text-fg-subtle text-xs">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
