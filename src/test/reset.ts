import { resetAppInfoCache } from '@/core/ipc';
import { useSettings } from '@/core/stores/settings';
import { useUi } from '@/core/stores/ui';
import { useUsage } from '@/core/stores/usage';
import { useUpdater } from '@/core/updater';

/** Puts every global store back to its initial state so tests can't leak into each other. */
export function resetStores(): void {
  useSettings.setState(useSettings.getInitialState(), true);
  useUsage.setState(useUsage.getInitialState(), true);
  useUi.setState(useUi.getInitialState(), true);
  useUpdater.setState(useUpdater.getInitialState(), true);
  resetAppInfoCache();
}
