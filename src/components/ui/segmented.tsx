import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { ToolIcon } from '@/core/tools/define-tool';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ToolIcon;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
}

/** A single-choice segmented control (like macOS NSSegmentedControl). */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup
      value={[value]}
      // Pressing the active segment again would empty the group; keep the current value instead.
      onValueChange={(next) => {
        const [selected] = next;
        if (selected) onValueChange(selected as T);
      }}
      aria-label={label}
      className="inline-flex rounded-md border border-line-strong bg-panel p-0.5"
    >
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <Toggle
          key={optionValue}
          value={optionValue}
          className="inline-flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 font-medium text-fg-muted text-xs transition-colors hover:text-fg data-pressed:bg-active data-pressed:text-fg"
        >
          {Icon && <Icon className="size-3.5" />}
          {optionLabel}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
