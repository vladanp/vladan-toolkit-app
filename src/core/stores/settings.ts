import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ACCENTS, type Accent, THEMES, type ThemePreference } from '../theme';

export interface SettingsState {
  theme: ThemePreference;
  accent: Accent;
  sidebarCollapsed: boolean;
  autoCheckUpdates: boolean;
  setTheme: (theme: ThemePreference) => void;
  setAccent: (accent: Accent) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setAutoCheckUpdates: (enabled: boolean) => void;
}

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  accent: 'ember',
  sidebarCollapsed: false,
  autoCheckUpdates: true,
} as const satisfies Partial<SettingsState>;

type PersistedSettings = Pick<
  SettingsState,
  'theme' | 'accent' | 'sidebarCollapsed' | 'autoCheckUpdates'
>;

/** Drops unknown or malformed persisted values so a bad localStorage entry can't break the UI. */
export function sanitizeSettings(raw: unknown): PersistedSettings {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    theme: THEMES.includes(value.theme as ThemePreference)
      ? (value.theme as ThemePreference)
      : DEFAULT_SETTINGS.theme,
    accent: ACCENTS.includes(value.accent as Accent)
      ? (value.accent as Accent)
      : DEFAULT_SETTINGS.accent,
    sidebarCollapsed:
      typeof value.sidebarCollapsed === 'boolean'
        ? value.sidebarCollapsed
        : DEFAULT_SETTINGS.sidebarCollapsed,
    autoCheckUpdates:
      typeof value.autoCheckUpdates === 'boolean'
        ? value.autoCheckUpdates
        : DEFAULT_SETTINGS.autoCheckUpdates,
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setAutoCheckUpdates: (autoCheckUpdates) => set({ autoCheckUpdates }),
    }),
    {
      name: 'vt:settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, accent, sidebarCollapsed, autoCheckUpdates }) => ({
        theme,
        accent,
        sidebarCollapsed,
        autoCheckUpdates,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
    },
  ),
);
