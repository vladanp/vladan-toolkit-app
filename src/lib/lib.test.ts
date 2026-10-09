import { describe, expect, it } from 'vitest';
import { cn } from './cn';
import { greeting } from './greeting';
import { formatRelativeTime } from './time';

describe('cn', () => {
  it('joins truthy classes and resolves Tailwind conflicts', () => {
    expect(cn('px-2', false && 'hidden', 'px-4', ['text-fg'])).toBe('px-4 text-fg');
  });
});

describe('greeting', () => {
  it.each([
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [22, 'Good evening'],
    [23, 'Burning the midnight oil'],
    [2, 'Burning the midnight oil'],
  ])('at %i:00 says "%s"', (hour, expected) => {
    expect(greeting(hour)).toBe(expected);
  });

  it('defaults to the current hour', () => {
    expect(greeting()).toBe(greeting(new Date().getHours()));
  });
});

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 9, 9, 12);
  const minute = 60_000;

  it('says "just now" for under a minute', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
  });

  it.each([
    [5 * minute, '5 min. ago'],
    [3 * 60 * minute, '3 hr. ago'],
    [24 * 60 * minute, 'yesterday'],
    [14 * 24 * 60 * minute, '2 wk. ago'],
    [400 * 24 * 60 * minute, 'last yr.'],
  ])('formats %i ms ago as "%s"', (ago, expected) => {
    expect(formatRelativeTime(now - ago, now)).toBe(expected);
  });

  it('defaults to Date.now()', () => {
    expect(formatRelativeTime(Date.now())).toBe('just now');
  });
});
