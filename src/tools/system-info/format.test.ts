import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatFrequency,
  formatPercent,
  formatRefreshRate,
  shortCompany,
  snapRefreshRate,
} from './format';

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1536, '1.5 KB'],
    [16 * 1024 ** 3, '16 GB'],
    [15.64 * 1024 ** 3, '15.6 GB'],
    [476.9 * 1024 ** 3, '477 GB'],
    [3 * 1024 ** 5, '3072 TB'],
    [0, 'Unknown'],
    [null, 'Unknown'],
    [Number.NaN, 'Unknown'],
  ])('%s → %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it('can count in thousands like Finder', () => {
    expect(formatBytes(500_107_862_016, 1000)).toBe('500 GB');
    expect(formatBytes(500_107_862_016)).toBe('466 GB');
  });
});

describe('formatDuration', () => {
  it.each([
    [59, '0m'],
    [3_900, '1h 5m'],
    [2 * 86_400 + 3 * 3_600, '2d 3h'],
    [-1, 'Unknown'],
    [undefined, 'Unknown'],
  ])('%s s → %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe('small formatters', () => {
  it('formats frequencies, percentages and refresh rates', () => {
    expect(formatFrequency(3700)).toBe('3.7 GHz');
    expect(formatFrequency(2995)).toBe('3 GHz');
    expect(formatFrequency(800)).toBe('800 MHz');
    expect(formatPercent(22.6)).toBe('23%');
    expect(formatRefreshRate(120)).toBe('120 Hz');
    expect(formatRefreshRate(59.94)).toBe('59.94 Hz');
  });

  it('snaps noisy measurements to rates monitors ship with', () => {
    expect(snapRefreshRate(59.7)).toBe(60);
    expect(snapRefreshRate(143.2)).toBe(144);
    expect(snapRefreshRate(164.4)).toBe(165);
    expect(snapRefreshRate(85.2)).toBe(85);
  });

  it('drops company suffixes', () => {
    expect(shortCompany('Dell Inc.')).toBe('Dell');
    expect(shortCompany('Micro-Star International Co., Ltd.')).toBe('Micro-Star International');
    expect(shortCompany('Hewlett-Packard')).toBe('Hewlett-Packard');
    expect(shortCompany('ASUSTeK COMPUTER INC.')).toBe('ASUSTeK COMPUTER');
  });
});
