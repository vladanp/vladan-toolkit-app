import { PanelLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import { isTauri } from '@/core/ipc';
import { platform as currentPlatform, type Platform } from '@/core/platform';
import { SHORTCUTS } from '@/core/shortcuts';
import { useSettings } from '@/core/stores/settings';
import { useUi } from '@/core/stores/ui';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';
import { WindowControls } from './WindowControls';

/**
 * The custom title bar. It is a drag region for moving the window. On macOS the native
 * traffic lights float over its left edge; on Windows/Linux we draw our own controls.
 */
export function TitleBar({
  platform = currentPlatform,
  native = isTauri(),
}: {
  platform?: Platform;
  native?: boolean;
}) {
  const toggleSidebar = useSettings((s) => s.toggleSidebar);
  const openPalette = useUi((s) => s.setPaletteOpen);
  const trafficLights = native && platform === 'macos';
  const ownControls = native && platform !== 'macos';

  return (
    <header
      data-tauri-drag-region
      className="grid h-10 shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center border-line border-b bg-panel"
    >
      <div
        data-tauri-drag-region
        className={cn('flex h-full items-center gap-2', trafficLights ? 'pl-[78px]' : 'pl-3')}
        data-testid="titlebar-start"
      >
        <Logo />
        <span data-tauri-drag-region className="font-semibold text-[13px] text-fg tracking-tight">
          Vladan Toolkit
        </span>
        <Tooltip label="Toggle sidebar" shortcut={SHORTCUTS.sidebar} side="bottom">
          <Button variant="ghost" size="icon" aria-label="Toggle sidebar" onClick={toggleSidebar}>
            <PanelLeft className="size-4" />
          </Button>
        </Tooltip>
      </div>

      <button
        type="button"
        onClick={() => openPalette(true)}
        className="flex h-7 w-[min(420px,36vw)] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted"
      >
        <Search className="size-3.5" />
        <span className="flex-1 truncate text-left text-xs">Search tools and actions…</span>
        <Kbd shortcut={SHORTCUTS.palette} />
      </button>

      <div data-tauri-drag-region className="flex h-full items-center justify-end">
        {ownControls && <WindowControls />}
      </div>
    </header>
  );
}
