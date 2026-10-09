import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement } from 'react';
import type { Shortcut } from '@/core/hotkeys';
import { Kbd } from './kbd';

export const TooltipProvider = BaseTooltip.Provider;

export interface TooltipProps {
  label: string;
  shortcut?: Shortcut;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** When true the trigger renders without a tooltip (e.g. sidebar is expanded). */
  disabled?: boolean;
  /** The trigger. Must accept a ref and DOM props (buttons, links). */
  children: ReactElement;
}

export function Tooltip({ label, shortcut, side = 'right', disabled, children }: TooltipProps) {
  if (disabled) return children;
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
          <BaseTooltip.Popup className="flex items-center gap-2 rounded-md bg-elevated px-2 py-1 text-fg text-xs shadow-popover transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0">
            {label}
            {shortcut && <Kbd shortcut={shortcut} />}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
