import { describe, expect, it, vi } from 'vitest';
import { applyTheme, onSystemThemeChange, resolveTheme, systemPrefersDark } from './theme';

function fakeMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches,
    addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
      listeners.delete(fn),
  };
  return {
    win: { matchMedia: vi.fn(() => query) } as unknown as Pick<Window, 'matchMedia'>,
    emit: (value: boolean) => {
      for (const fn of listeners) fn({ matches: value } as MediaQueryListEvent);
    },
    listeners,
  };
}

describe('resolveTheme', () => {
  it('passes explicit themes through', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('follows the OS for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('reads the OS preference by default', () => {
    expect(['dark', 'light']).toContain(resolveTheme('system'));
  });
});

describe('systemPrefersDark', () => {
  it('reads prefers-color-scheme', () => {
    expect(systemPrefersDark(fakeMatchMedia(true).win)).toBe(true);
    expect(systemPrefersDark(fakeMatchMedia(false).win)).toBe(false);
  });
});

describe('applyTheme', () => {
  it('sets data attributes and color-scheme on the root', () => {
    const root = document.createElement('html');
    applyTheme('light', 'rose', root);
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.accent).toBe('rose');
    expect(root.style.colorScheme).toBe('light');
  });

  it('defaults to the document element', () => {
    applyTheme('dark', 'blue');
    expect(document.documentElement.dataset.accent).toBe('blue');
  });
});

describe('onSystemThemeChange', () => {
  it('notifies on change and unsubscribes', () => {
    const media = fakeMatchMedia(false);
    const listener = vi.fn();
    const unsubscribe = onSystemThemeChange(listener, media.win);
    media.emit(true);
    expect(listener).toHaveBeenCalledWith(true);
    unsubscribe();
    expect(media.listeners.size).toBe(0);
  });
});
