import { House, Monitor, Moon, PanelLeft, RefreshCw, RotateCw, Settings, Sun } from 'lucide-react';
import type { Shortcut } from './hotkeys';
import { SHORTCUTS, toolShortcut } from './shortcuts';
import type { ThemePreference } from './theme';
import type { ToolDefinition, ToolIcon } from './tools/define-tool';

export interface PaletteCommand {
  id: string;
  title: string;
  group: string;
  icon?: ToolIcon;
  keywords?: string[];
  shortcut?: Shortcut;
  run: () => void | Promise<void>;
}

/** What the palette can do to the shell. Implemented by the app, mocked in tests. */
export interface ShellActions {
  goHome: () => void | Promise<void>;
  openSettings: () => void | Promise<void>;
  openTool: (toolId: string) => Promise<void>;
  setTheme: (theme: ThemePreference) => void;
  toggleSidebar: () => void;
  reload: () => void;
  /** Present only when this build can self-update. */
  checkForUpdates?: () => void | Promise<void>;
}

export const GROUPS = {
  tools: 'Tools',
  navigation: 'Navigation',
  preferences: 'Preferences',
  app: 'App',
} as const;

export function buildCommands(
  tools: readonly ToolDefinition[],
  actions: ShellActions,
): PaletteCommand[] {
  const toolCommands = tools.flatMap((tool, index): PaletteCommand[] => {
    const openTool = () => actions.openTool(tool.id);
    const open: PaletteCommand = {
      id: `tool:${tool.id}`,
      title: tool.name,
      group: GROUPS.tools,
      icon: tool.icon,
      keywords: [tool.description, ...(tool.keywords ?? [])],
      shortcut: toolShortcut(index),
      run: openTool,
    };
    const extra = (tool.commands ?? []).map(
      (command): PaletteCommand => ({
        id: `${tool.id}:${command.id}`,
        title: command.title,
        group: tool.name,
        icon: tool.icon,
        keywords: command.keywords,
        run: () => command.run({ openTool }),
      }),
    );
    return [open, ...extra];
  });

  const themeCommand = (theme: ThemePreference, title: string, icon: ToolIcon) => ({
    id: `theme:${theme}`,
    title,
    group: GROUPS.preferences,
    icon,
    keywords: ['theme', 'appearance', 'color', 'mode'],
    run: () => actions.setTheme(theme),
  });

  const commands: PaletteCommand[] = [
    ...toolCommands,
    {
      id: 'nav:home',
      title: 'Go to Home',
      group: GROUPS.navigation,
      icon: House,
      shortcut: SHORTCUTS.home,
      run: actions.goHome,
    },
    {
      id: 'nav:settings',
      title: 'Open Settings',
      group: GROUPS.navigation,
      icon: Settings,
      keywords: ['preferences', 'options'],
      shortcut: SHORTCUTS.settings,
      run: actions.openSettings,
    },
    themeCommand('dark', 'Use dark theme', Moon),
    themeCommand('light', 'Use light theme', Sun),
    themeCommand('system', 'Use system theme', Monitor),
    {
      id: 'ui:sidebar',
      title: 'Toggle sidebar',
      group: GROUPS.preferences,
      icon: PanelLeft,
      shortcut: SHORTCUTS.sidebar,
      run: actions.toggleSidebar,
    },
    {
      id: 'app:reload',
      title: 'Reload window',
      group: GROUPS.app,
      icon: RotateCw,
      keywords: ['refresh', 'restart'],
      run: actions.reload,
    },
  ];

  if (actions.checkForUpdates) {
    commands.push({
      id: 'app:update',
      title: 'Check for updates',
      group: GROUPS.app,
      icon: RefreshCw,
      keywords: ['upgrade', 'version', 'release'],
      run: actions.checkForUpdates,
    });
  }

  return commands;
}

const words = (text: string): string[] => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const char of haystack) {
    if (char === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}

function scoreToken(token: string, title: string, extras: string[]): number {
  if (title.startsWith(token)) return 1;
  if (words(title).some((word) => word.startsWith(token))) return 0.9;
  if (title.includes(token)) return 0.75;
  if (extras.some((extra) => words(extra).some((word) => word.startsWith(token)))) return 0.5;
  if (extras.some((extra) => extra.includes(token))) return 0.4;
  // Typo-tolerant fallback, but only against the title: long descriptions contain almost
  // any letter sequence, which made "settings" match "System Info".
  if (isSubsequence(token, title)) return 0.2;
  return 0;
}

/**
 * Relevance of a command for a palette search, 0 (hidden) to 1. Every word of the query
 * must match; title matches outrank keyword matches, which outrank fuzzy title matches.
 */
export function scoreCommand(
  command: Pick<PaletteCommand, 'title' | 'group' | 'keywords'>,
  search: string,
): number {
  const tokens = words(search.toLowerCase());
  if (tokens.length === 0) return 1;
  const title = command.title.toLowerCase();
  const extras = [command.group, ...(command.keywords ?? [])].map((text) => text.toLowerCase());
  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(token, title, extras);
    if (score === 0) return 0;
    total += score;
  }
  return total / tokens.length;
}
