import { formatShortcut, type Shortcut } from '@/core/hotkeys';
import { cn } from '@/lib/cn';

export interface KbdProps {
  shortcut: Shortcut;
  className?: string;
  /**
   * Hide from assistive tech when the shortcut is already exposed on the control via
   * `aria-keyshortcuts`, so it is not read twice or folded into the control's name.
   */
  decorative?: boolean;
}

export function Kbd({ shortcut, className, decorative }: KbdProps) {
  const keys = formatShortcut(shortcut);
  return (
    <kbd
      className={cn(
        'inline-flex items-center gap-0.5 font-sans text-[11px] text-fg-subtle',
        className,
      )}
      aria-label={decorative ? undefined : keys.join('+')}
      aria-hidden={decorative || undefined}
    >
      {keys.map((key) => (
        <span
          key={key}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line-strong bg-surface px-1 leading-none"
        >
          {key}
        </span>
      ))}
    </kbd>
  );
}
