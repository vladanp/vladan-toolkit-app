import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ariaKeyShortcut,
  formatShortcut,
  type KeyEventLike,
  matchesShortcut,
  parseShortcut,
  useHotkeys,
} from './hotkeys';

const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('parseShortcut', () => {
  it('parses modifiers and key', () => {
    expect(parseShortcut('mod+shift+P')).toEqual({ mod: true, shift: true, alt: false, key: 'p' });
    expect(parseShortcut('escape')).toEqual({
      mod: false,
      shift: false,
      alt: false,
      key: 'escape',
    });
  });

  it('rejects unknown modifiers and empty shortcuts', () => {
    expect(() => parseShortcut('hyper+k')).toThrow(/Unknown modifier "hyper"/);
    expect(() => parseShortcut('')).toThrow(/Invalid shortcut/);
  });
});

describe('matchesShortcut', () => {
  it('uses ⌘ on macOS and Ctrl elsewhere', () => {
    expect(matchesShortcut(key('k', { metaKey: true }), 'mod+k', 'macos')).toBe(true);
    expect(matchesShortcut(key('k', { ctrlKey: true }), 'mod+k', 'macos')).toBe(false);
    expect(matchesShortcut(key('k', { ctrlKey: true }), 'mod+k', 'windows')).toBe(true);
    expect(matchesShortcut(key('k', { metaKey: true }), 'mod+k', 'linux')).toBe(false);
  });

  it('requires exact modifiers', () => {
    expect(matchesShortcut(key('K', { ctrlKey: true, shiftKey: true }), 'mod+k', 'linux')).toBe(
      false,
    );
    expect(
      matchesShortcut(key('K', { ctrlKey: true, shiftKey: true }), 'mod+shift+k', 'linux'),
    ).toBe(true);
    expect(matchesShortcut(key('k', { ctrlKey: true, altKey: true }), 'mod+alt+k', 'linux')).toBe(
      true,
    );
    expect(matchesShortcut(key('j', { ctrlKey: true }), 'mod+k', 'linux')).toBe(false);
  });
});

describe('formatShortcut', () => {
  it('renders platform labels', () => {
    expect(formatShortcut('mod+shift+alt+k', 'macos')).toEqual(['⌘', '⌥', '⇧', 'K']);
    expect(formatShortcut('mod+shift+alt+k', 'windows')).toEqual(['Ctrl', 'Alt', 'Shift', 'K']);
  });

  it('uses symbols for special keys', () => {
    expect(formatShortcut('enter', 'linux')).toEqual(['↵']);
    expect(formatShortcut('mod+,', 'linux')).toEqual(['Ctrl', ',']);
    expect(formatShortcut('arrowdown', 'macos')).toEqual(['↓']);
  });
});

describe('ariaKeyShortcut', () => {
  it('uses the ARIA key names', () => {
    expect(ariaKeyShortcut('mod+k', 'macos')).toBe('Meta+K');
    expect(ariaKeyShortcut('mod+shift+alt+k', 'linux')).toBe('Control+Alt+Shift+K');
    expect(ariaKeyShortcut('mod+,', 'windows')).toBe('Control+Comma');
    expect(ariaKeyShortcut('escape')).toBe('Escape');
  });
});

describe('useHotkeys', () => {
  it('calls the matching handler and prevents the default action', () => {
    const onK = vi.fn();
    const onB = vi.fn();
    const { unmount } = renderHook(() => useHotkeys({ 'mod+k': onK, 'mod+b': onB }));

    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(onK).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);

    const other = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);

    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(onK).toHaveBeenCalledOnce();
  });

  it('leaves keys alone that a control handled or an IME is composing', () => {
    const onK = vi.fn();
    const { unmount } = renderHook(() => useHotkeys({ 'mod+k': onK }));
    const input = document.createElement('input');
    document.body.append(input);
    input.addEventListener('keydown', (event) => event.preventDefault());
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, isComposing: true }),
    );
    expect(onK).not.toHaveBeenCalled();
    input.remove();
    unmount();
  });

  it('always uses the latest handlers without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ handler }) => useHotkeys({ 'mod+k': handler }), {
      initialProps: { handler: first },
    });
    rerender({ handler: second });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
