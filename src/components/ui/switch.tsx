import { Switch as BaseSwitch } from '@base-ui/react/switch';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, disabled }: SwitchProps) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      aria-label={label}
      disabled={disabled}
      className="relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-line-strong bg-active p-px transition-colors data-checked:border-transparent data-checked:bg-accent data-disabled:opacity-50"
    >
      <BaseSwitch.Thumb className="block size-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-checked:translate-x-3.5" />
    </BaseSwitch.Root>
  );
}
