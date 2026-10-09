import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

function ControlButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-full w-[46px] items-center justify-center text-fg-muted transition-colors',
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

/** Minimize / maximize / close for Windows and Linux, where the native title bar is hidden. */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const sync = () => {
      win.isMaximized().then(
        (value) => !disposed && setMaximized(value),
        () => {},
      );
    };
    sync();
    win.onResized(sync).then(
      (fn) => {
        if (disposed) fn();
        else unlisten = fn;
      },
      () => {},
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const win = getCurrentWindow();
  return (
    <div className="flex h-full items-stretch" data-testid="window-controls">
      <ControlButton label="Minimize" onClick={() => void win.minimize()}>
        <Minus className="size-4" strokeWidth={1.25} />
      </ControlButton>
      <ControlButton
        label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void win.toggleMaximize()}
      >
        {maximized ? (
          <Copy className="size-3.5 -scale-x-100" strokeWidth={1.25} />
        ) : (
          <Square className="size-3" strokeWidth={1.25} />
        )}
      </ControlButton>
      <ControlButton label="Close" danger onClick={() => void win.close()}>
        <X className="size-4" strokeWidth={1.25} />
      </ControlButton>
    </div>
  );
}
