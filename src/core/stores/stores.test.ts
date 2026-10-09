import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, useSettings } from './settings';
import { useUi } from './ui';
import { useUsage } from './usage';

describe('settings store', () => {
  it('starts with dark-first defaults', () => {
    expect(useSettings.getState()).toMatchObject(DEFAULT_SETTINGS);
  });

  it('updates and persists preferences', () => {
    const s = useSettings.getState();
    s.setTheme('light');
    s.setAccent('emerald');
    s.toggleSidebar();
    s.setAutoCheckUpdates(false);
    expect(useSettings.getState()).toMatchObject({
      theme: 'light',
      accent: 'emerald',
      sidebarCollapsed: true,
      autoCheckUpdates: false,
    });
    useSettings.getState().setSidebarCollapsed(false);
    expect(useSettings.getState().sidebarCollapsed).toBe(false);

    const persisted = JSON.parse(localStorage.getItem('vt:settings') ?? '{}');
    expect(persisted.state).toEqual({
      theme: 'light',
      accent: 'emerald',
      sidebarCollapsed: false,
      autoCheckUpdates: false,
    });
  });

  it('restores persisted settings on rehydrate', async () => {
    localStorage.setItem(
      'vt:settings',
      JSON.stringify({ state: { theme: 'system', accent: 'amber' }, version: 1 }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState()).toMatchObject({ theme: 'system', accent: 'amber' });
  });
});

describe('sanitizeSettings', () => {
  it('keeps valid values', () => {
    const valid = {
      theme: 'light',
      accent: 'teal',
      sidebarCollapsed: true,
      autoCheckUpdates: false,
    };
    expect(sanitizeSettings(valid)).toEqual(valid);
  });

  it('replaces invalid values with defaults', () => {
    expect(
      sanitizeSettings({
        theme: 'neon',
        accent: 'plaid',
        sidebarCollapsed: 'yes',
        autoCheckUpdates: 1,
      }),
    ).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('usage store', () => {
  it('records and clears last-used times', () => {
    useUsage.getState().markUsed('hammer', 1_000);
    useUsage.getState().markUsed('wrench');
    const { lastUsed } = useUsage.getState();
    expect(lastUsed.hammer).toBe(1_000);
    expect(lastUsed.wrench).toBeGreaterThan(1_000);
    useUsage.getState().clear();
    expect(useUsage.getState().lastUsed).toEqual({});
  });
});

describe('ui store', () => {
  it('opens, closes and toggles the palette', () => {
    useUi.getState().setPaletteOpen(true);
    expect(useUi.getState().paletteOpen).toBe(true);
    useUi.getState().togglePalette();
    expect(useUi.getState().paletteOpen).toBe(false);
  });
});
