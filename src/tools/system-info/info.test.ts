import { describe, expect, it } from 'vitest';
import { mockTauri } from '@/test/tauri';
import { formatBytes, formatDuration, loadInfoGroups, toMarkdown } from './info';

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1536, '1.5 KB'],
    [16 * 1024 ** 3, '16.0 GB'],
    [3 * 1024 ** 5, '3072.0 TB'],
    [0, 'Unknown'],
    [null, 'Unknown'],
    [Number.NaN, 'Unknown'],
  ])('%s → %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
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

describe('loadInfoGroups', () => {
  it('uses browser information outside Tauri', async () => {
    const groups = await loadInfoGroups();
    expect(groups.map((g) => g.title)).toEqual(['Application', 'Browser', 'Display & locale']);
    expect(groups[0]?.items).toContainEqual({ label: 'Runtime', value: 'Browser' });
  });

  it('uses the Rust system_info command inside Tauri', async () => {
    mockTauri();
    const groups = await loadInfoGroups();
    expect(groups.map((g) => g.title)).toEqual([
      'Application',
      'Operating system',
      'Hardware',
      'Display & locale',
    ]);
    const hardware = groups.find((g) => g.title === 'Hardware')?.items;
    expect(hardware).toContainEqual({ label: 'Cores', value: '4 physical · 8 logical' });
    expect(hardware).toContainEqual({ label: 'Memory', value: '16.0 GB' });
    expect(groups[0]?.items).toContainEqual({ label: 'Runtime', value: 'Tauri 2.12.2' });
  });

  it('handles missing optional values', async () => {
    mockTauri({
      system_info: () => ({
        osName: null,
        osVersion: null,
        kernelVersion: null,
        arch: 'aarch64',
        cpuBrand: null,
        logicalCores: 2,
        physicalCores: null,
        totalMemoryBytes: null,
        uptimeSeconds: null,
      }),
    });
    const groups = await loadInfoGroups();
    const items = groups.flatMap((g) => g.items);
    expect(items).toContainEqual({ label: 'Cores', value: '2 logical' });
    expect(items).toContainEqual({ label: 'Name', value: 'Unknown' });
  });
});

describe('toMarkdown', () => {
  it('renders headings and bullet lists', () => {
    expect(
      toMarkdown([
        { title: 'A', items: [{ label: 'x', value: '1' }] },
        { title: 'B', items: [{ label: 'y', value: '2' }] },
      ]),
    ).toBe('### A\n- **x:** 1\n\n### B\n- **y:** 2');
  });
});
