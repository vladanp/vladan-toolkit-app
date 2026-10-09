import { Outlet, useRouter } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { Toaster } from 'sonner';
import { useHotkeys } from '@/core/hotkeys';
import { SHORTCUTS, toolShortcut } from '@/core/shortcuts';
import { useUi } from '@/core/stores/ui';
import { useRegistry } from '../registry-context';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { UpdateNotifier } from './UpdateNotifier';
import { useShellActions } from './use-shell-actions';
import { useThemeSync } from './use-theme-sync';

const toasterStyle = {
  '--normal-bg': 'var(--vt-elevated)',
  '--normal-border': 'var(--vt-line-strong)',
  '--normal-text': 'var(--vt-fg)',
} as CSSProperties;

export function AppShell() {
  const theme = useThemeSync();
  const router = useRouter();
  const actions = useShellActions();
  const togglePalette = useUi((s) => s.togglePalette);
  const { tools } = useRegistry();

  const toolHotkeys = Object.fromEntries(
    tools.flatMap((tool, index) => {
      const shortcut = toolShortcut(index);
      return shortcut ? [[shortcut, () => void actions.openTool(tool.id)]] : [];
    }),
  );

  useHotkeys({
    [SHORTCUTS.palette]: togglePalette,
    [SHORTCUTS.sidebar]: actions.toggleSidebar,
    [SHORTCUTS.settings]: () => void actions.openSettings(),
    [SHORTCUTS.home]: () => void actions.goHome(),
    [SHORTCUTS.back]: () => router.history.back(),
    [SHORTCUTS.forward]: () => router.history.forward(),
    ...toolHotkeys,
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-fg">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <UpdateNotifier />
      <Toaster theme={theme} position="bottom-right" style={toasterStyle} closeButton />
    </div>
  );
}
