import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';
import { isTauri } from '@/core/ipc';
import { useSettings } from '@/core/stores/settings';
import {
  applyTheme,
  onSystemThemeChange,
  type ResolvedTheme,
  resolveTheme,
  systemPrefersDark,
} from '@/core/theme';

/** Keeps the DOM (and the native window chrome) in sync with the theme preference. */
export function useThemeSync(): ResolvedTheme {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const resolved = resolveTheme(theme, prefersDark);

  useEffect(() => onSystemThemeChange(setPrefersDark), []);

  useEffect(() => {
    applyTheme(resolved, accent);
  }, [resolved, accent]);

  useEffect(() => {
    if (!isTauri()) return;
    // `null` lets the native title bar / traffic lights follow the OS.
    getCurrentWindow()
      .setTheme(theme === 'system' ? null : theme)
      .catch((error: unknown) => console.warn('Could not set native window theme', error));
  }, [theme]);

  return resolved;
}
