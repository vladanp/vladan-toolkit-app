import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAppInfo } from '@/core/ipc';
import { useSettings } from '@/core/stores/settings';
import { useUpdater } from '@/core/updater';

export const FIRST_CHECK_DELAY_MS = 5_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Downloads and installs the update, keeping the user informed; the app restarts when done. */
export async function installUpdate(): Promise<void> {
  const id = toast.loading('Downloading the update…', { duration: Number.POSITIVE_INFINITY });
  await useUpdater.getState().install();
  const { status } = useUpdater.getState();
  if (status.kind === 'error') {
    toast.error("Couldn't install the update", {
      id,
      description: status.message,
      duration: 8_000,
    });
  }
}

/** Checks for an update and reports the result as a toast. Silent checks only speak up for news. */
export async function checkForUpdates({ silent }: { silent: boolean }): Promise<void> {
  const status = await useUpdater.getState().check();
  if (status.kind === 'available') {
    toast(`Version ${status.version} is available`, {
      id: 'update-available',
      description: 'Restart to install it now; it only takes a moment.',
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: 'Install & restart',
        onClick: () => void installUpdate(),
      },
    });
  } else if (!silent && status.kind === 'up-to-date') {
    toast.success("You're on the latest version");
  } else if (!silent && status.kind === 'error') {
    toast.error("Couldn't check for updates", { description: status.message });
  }
}

/** Background update checks: shortly after launch, then every few hours. */
export function UpdateNotifier() {
  const updaterEnabled = useAppInfo()?.updaterEnabled ?? false;
  const autoCheck = useSettings((s) => s.autoCheckUpdates);

  useEffect(() => {
    if (!updaterEnabled || !autoCheck) return;
    const run = () => void checkForUpdates({ silent: true });
    const first = setTimeout(run, FIRST_CHECK_DELAY_MS);
    const interval = setInterval(run, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [updaterEnabled, autoCheck]);

  return null;
}
