import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { ShellActions } from '@/core/commands';
import { useAppInfo } from '@/core/ipc';
import { useSettings } from '@/core/stores/settings';
import { checkForUpdates } from './UpdateNotifier';

/** The concrete implementation of what commands and shortcuts can do to the shell. */
export function useShellActions(): ShellActions {
  const navigate = useNavigate();
  const setTheme = useSettings((s) => s.setTheme);
  const toggleSidebar = useSettings((s) => s.toggleSidebar);
  const updaterEnabled = useAppInfo()?.updaterEnabled ?? false;

  return useMemo(
    () => ({
      goHome: () => navigate({ to: '/' }),
      openSettings: () => navigate({ to: '/settings' }),
      openTool: (toolId: string) => navigate({ to: '/tools/$toolId', params: { toolId } }),
      setTheme,
      toggleSidebar,
      reload: () => window.location.reload(),
      checkForUpdates: updaterEnabled ? () => checkForUpdates({ silent: false }) : undefined,
    }),
    [navigate, setTheme, toggleSidebar, updaterEnabled],
  );
}
