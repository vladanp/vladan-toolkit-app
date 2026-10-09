import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-hover active:bg-active',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg active:bg-active',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
} as const;

const SIZES = {
  sm: 'h-7 gap-1.5 rounded-md px-2.5 text-xs',
  md: 'h-8 gap-2 rounded-md px-3 text-[13px]',
  icon: 'size-7 rounded-md',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,color,filter] duration-100 disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
