import { describe, expect, it } from 'vitest';
import { parseShortcut } from './hotkeys';
import { SHORTCUT_LABELS, SHORTCUTS, toolShortcut } from './shortcuts';

describe('shortcuts', () => {
  it('are all valid and labelled', () => {
    for (const [name, shortcut] of Object.entries(SHORTCUTS)) {
      expect(() => parseShortcut(shortcut)).not.toThrow();
      expect(SHORTCUT_LABELS[name as keyof typeof SHORTCUTS]).toBeTruthy();
    }
  });

  it('are unique', () => {
    const values = Object.values(SHORTCUTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('map the first nine tools to mod+1…9', () => {
    expect(toolShortcut(0)).toBe('mod+1');
    expect(toolShortcut(8)).toBe('mod+9');
    expect(toolShortcut(9)).toBeUndefined();
    expect(toolShortcut(-1)).toBeUndefined();
  });
});
