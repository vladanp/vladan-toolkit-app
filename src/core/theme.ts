export const THEMES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const ACCENTS = ['ember', 'amber', 'emerald', 'teal', 'blue'] as const;
export type Accent = (typeof ACCENTS)[number];

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function systemPrefersDark(win: Pick<Window, 'matchMedia'> = window): boolean {
  return win.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean = systemPrefersDark(),
): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Applies theme + accent to the document root, where the CSS tokens are keyed. */
export function applyTheme(
  theme: ResolvedTheme,
  accent: Accent,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  root.style.colorScheme = theme;
}

/** Calls `listener` whenever the OS switches between light and dark. Returns an unsubscribe. */
export function onSystemThemeChange(
  listener: (prefersDark: boolean) => void,
  win: Pick<Window, 'matchMedia'> = window,
): () => void {
  const query = win.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}
