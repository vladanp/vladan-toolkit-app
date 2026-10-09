import { cn } from '@/lib/cn';

/** The app mark. Follows the current accent color. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-[18px] shrink-0', className)}>
      <rect width="24" height="24" rx="6" className="fill-accent" />
      <path
        d="M7.5 8.25 12 16.5l4.5-8.25"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
