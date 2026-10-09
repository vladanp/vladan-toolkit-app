import type { Shortcut } from './hotkeys';

/** App-wide shortcuts. Shown in Settings → Keyboard and next to palette entries. */
export const SHORTCUTS = {
  palette: 'mod+k',
  sidebar: 'mod+b',
  settings: 'mod+,',
  home: 'mod+0',
  back: 'mod+[',
  forward: 'mod+]',
} as const satisfies Record<string, Shortcut>;

export const SHORTCUT_LABELS: Record<keyof typeof SHORTCUTS, string> = {
  palette: 'Open command palette',
  sidebar: 'Toggle sidebar',
  settings: 'Open settings',
  home: 'Go home',
  back: 'Go back',
  forward: 'Go forward',
};

/** The first nine tools get ⌘1…⌘9. */
export function toolShortcut(index: number): Shortcut | undefined {
  return index >= 0 && index < 9 ? `mod+${index + 1}` : undefined;
}
