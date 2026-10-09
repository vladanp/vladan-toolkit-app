import { Hammer } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { buildCommands, GROUPS, type ShellActions, scoreCommand } from './commands';
import type { ToolDefinition } from './tools/define-tool';

function actions(overrides: Partial<ShellActions> = {}): ShellActions {
  return {
    goHome: vi.fn(),
    openSettings: vi.fn(),
    openTool: vi.fn(async () => {}),
    setTheme: vi.fn(),
    toggleSidebar: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

const tools: ToolDefinition[] = Array.from({ length: 10 }, (_, i) => ({
  id: `tool-${i}`,
  name: `Tool ${i}`,
  description: `Does thing ${i}`,
  icon: Hammer,
  component: () => null,
  ...(i === 0 ? { keywords: ['zero'], commands: [{ id: 'act', title: 'Act', run: vi.fn() }] } : {}),
}));

describe('buildCommands', () => {
  it('creates an "open" command per tool with ⌘1–9 shortcuts', async () => {
    const a = actions();
    const commands = buildCommands(tools, a);
    const open = commands.filter((c) => c.group === GROUPS.tools);
    expect(open).toHaveLength(10);
    expect(open[0]).toMatchObject({ id: 'tool:tool-0', title: 'Tool 0', shortcut: 'mod+1' });
    expect(open[0]?.keywords).toEqual(['Does thing 0', 'zero']);
    expect(open[8]?.shortcut).toBe('mod+9');
    expect(open[9]?.shortcut).toBeUndefined();
    await open[3]?.run();
    expect(a.openTool).toHaveBeenCalledWith('tool-3');
  });

  it('adds tool-contributed commands grouped under the tool name', async () => {
    const a = actions();
    const command = buildCommands(tools, a).find((c) => c.id === 'tool-0:act');
    expect(command).toMatchObject({ title: 'Act', group: 'Tool 0' });
    await command?.run();
    const toolCommand = tools[0]?.commands?.[0];
    expect(toolCommand?.run).toHaveBeenCalledOnce();
    const context = vi.mocked(toolCommand?.run)?.mock.calls[0]?.[0];
    await context?.openTool();
    expect(a.openTool).toHaveBeenCalledWith('tool-0');
  });

  it('wires navigation, theme, sidebar and reload actions', () => {
    const a = actions();
    const byId = new Map(buildCommands([], a).map((c) => [c.id, c]));
    byId.get('nav:home')?.run();
    byId.get('nav:settings')?.run();
    byId.get('theme:light')?.run();
    byId.get('theme:system')?.run();
    byId.get('theme:dark')?.run();
    byId.get('ui:sidebar')?.run();
    byId.get('app:reload')?.run();
    expect(a.goHome).toHaveBeenCalled();
    expect(a.openSettings).toHaveBeenCalled();
    expect(a.setTheme).toHaveBeenNthCalledWith(1, 'light');
    expect(a.setTheme).toHaveBeenNthCalledWith(2, 'system');
    expect(a.setTheme).toHaveBeenNthCalledWith(3, 'dark');
    expect(a.toggleSidebar).toHaveBeenCalled();
    expect(a.reload).toHaveBeenCalled();
  });

  it('offers "Check for updates" only when the build can update', () => {
    expect(buildCommands([], actions()).some((c) => c.id === 'app:update')).toBe(false);
    const checkForUpdates = vi.fn();
    const update = buildCommands([], actions({ checkForUpdates })).find(
      (c) => c.id === 'app:update',
    );
    update?.run();
    expect(checkForUpdates).toHaveBeenCalled();
  });

  it('produces unique ids', () => {
    const ids = buildCommands(tools, actions({ checkForUpdates: vi.fn() })).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('scoreCommand', () => {
  const systemInfo = {
    title: 'System Info',
    group: 'Tools',
    keywords: ['Details about this machine and build, ready to paste into bug reports.', 'cpu'],
  };
  const settings = { title: 'Open Settings', group: 'Navigation' };
  const lightTheme = { title: 'Use light theme', group: 'Preferences', keywords: ['appearance'] };

  it('shows everything for an empty search', () => {
    expect(scoreCommand(systemInfo, '  ')).toBe(1);
  });

  it('ranks title prefix > title word > title substring > keyword > fuzzy title', () => {
    const scores = [
      scoreCommand(systemInfo, 'sys'),
      scoreCommand(systemInfo, 'info'),
      scoreCommand(systemInfo, 'nfo'),
      scoreCommand(systemInfo, 'cpu'),
      scoreCommand(systemInfo, 'achi'),
      scoreCommand(systemInfo, 'syinf'),
    ];
    expect(scores).toEqual([1, 0.9, 0.75, 0.5, 0.4, 0.2]);
  });

  it('does not fuzzy-match long descriptions', () => {
    expect(scoreCommand(systemInfo, 'settings')).toBe(0);
    expect(scoreCommand(settings, 'settings')).toBeGreaterThan(0.8);
  });

  it('requires every word to match', () => {
    expect(scoreCommand(lightTheme, 'light theme')).toBe(0.9);
    expect(scoreCommand(lightTheme, 'light zebra')).toBe(0);
    expect(scoreCommand(lightTheme, 'appear')).toBe(0.5);
  });
});
