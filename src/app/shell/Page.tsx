import type { ReactNode } from 'react';
import type { ToolIcon } from '@/core/tools/define-tool';
import { cn } from '@/lib/cn';

export interface PageProps {
  title: string;
  icon?: ToolIcon;
  description?: string;
  actions?: ReactNode;
  layout?: 'contained' | 'full';
  children: ReactNode;
}

/** Standard page frame: a slim header row and a scrollable body. */
export function Page({
  title,
  icon: Icon,
  description,
  actions,
  layout = 'contained',
  children,
}: PageProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-line border-b px-6">
        {Icon && <Icon className="size-4 shrink-0 text-fg-muted" />}
        <h1 className="shrink-0 font-medium text-[13px] text-fg">{title}</h1>
        {description && (
          <p className="hidden min-w-0 truncate text-fg-subtle md:block">
            <span aria-hidden="true" className="mr-2.5 text-line-strong">
              /
            </span>
            {description}
          </p>
        )}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            'animate-page-in',
            layout === 'contained' ? 'mx-auto w-full max-w-4xl px-8 py-8' : 'h-full',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
