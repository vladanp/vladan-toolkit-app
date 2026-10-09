import { useEffect, useRef } from 'react';
import { platform as currentPlatform, type Platform } from './platform';

/**
 * Shortcuts are written platform-neutral, e.g. `mod+k`, `mod+shift+p`, `mod+,`.
 * `mod` is ⌘ on macOS and Ctrl on Windows/Linux.
 */
export type Shortcut = string;

export interface ParsedShortcut {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function parseShortcut(shortcut: Shortcut): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop();
  if (!key) throw new Error(`Invalid shortcut: "${shortcut}"`);
  for (const part of parts) {
    if (!['mod', 'shift', 'alt'].includes(part)) {
      throw new Error(`Unknown modifier "${part}" in shortcut "${shortcut}"`);
    }
  }
  return {
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key,
  };
}

export function matchesShortcut(
  event: KeyEventLike,
  shortcut: Shortcut,
  platform: Platform = currentPlatform,
): boolean {
  const parsed = parseShortcut(shortcut);
  const mod = platform === 'macos' ? event.metaKey : event.ctrlKey;
  // The "other" primary modifier must not be held, so Ctrl+K on macOS doesn't trigger ⌘K.
  const otherMod = platform === 'macos' ? event.ctrlKey : event.metaKey;
  return (
    mod === parsed.mod &&
    !otherMod &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt &&
    event.key.toLowerCase() === parsed.key
  );
}

const MAC_SYMBOLS: Record<string, string> = { mod: '⌘', shift: '⇧', alt: '⌥' };
const PC_LABELS: Record<string, string> = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt' };
const KEY_LABELS: Record<string, string> = {
  ',': ',',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: '↵',
  escape: 'Esc',
  backspace: '⌫',
};

/** Splits a shortcut into display labels, e.g. `mod+k` → `['⌘', 'K']` or `['Ctrl', 'K']`. */
export function formatShortcut(shortcut: Shortcut, platform: Platform = currentPlatform): string[] {
  const parsed = parseShortcut(shortcut);
  const labels = platform === 'macos' ? MAC_SYMBOLS : PC_LABELS;
  const keys: string[] = [];
  if (parsed.mod) keys.push(labels.mod as string);
  if (parsed.alt) keys.push(labels.alt as string);
  if (parsed.shift) keys.push(labels.shift as string);
  keys.push(KEY_LABELS[parsed.key] ?? parsed.key.toUpperCase());
  return keys;
}

const ARIA_KEYS: Record<string, string> = {
  ',': 'Comma',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  enter: 'Enter',
  escape: 'Escape',
  backspace: 'Backspace',
};

/** Value for the `aria-keyshortcuts` attribute, e.g. `mod+k` → `Control+K` (`Meta+K` on macOS). */
export function ariaKeyShortcut(shortcut: Shortcut, platform: Platform = currentPlatform): string {
  const parsed = parseShortcut(shortcut);
  const parts: string[] = [];
  if (parsed.mod) parts.push(platform === 'macos' ? 'Meta' : 'Control');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  parts.push(ARIA_KEYS[parsed.key] ?? parsed.key.toUpperCase());
  return parts.join('+');
}

export type HotkeyMap = Record<Shortcut, (event: KeyboardEvent) => void>;

/**
 * Registers window-level shortcuts. Handlers are kept in a ref so callers can pass
 * inline objects without re-subscribing on every render.
 */
export function useHotkeys(bindings: HotkeyMap, target: Window = window): void {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A focused control already handled the key, or an IME is still composing text.
      if (event.defaultPrevented || event.isComposing) return;
      for (const [shortcut, handler] of Object.entries(ref.current)) {
        if (matchesShortcut(event, shortcut)) {
          event.preventDefault();
          handler(event);
          return;
        }
      }
    };
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }, [target]);
}
