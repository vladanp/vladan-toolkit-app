import { describe, expect, it } from 'vitest';
import type { BatteryInfo, SystemInfo } from '@/bindings';
import { type AppInfo, getAppInfo } from '@/core/ipc';
import { GRAPHICS_INFO, mockTauri, monitor, SYSTEM_INFO } from '@/test/tauri';
import {
  type Basics,
  buildReport,
  DETECTING,
  displaysFromMonitors,
  type Graphics,
  type InfoGroup,
  loadBasics,
  loadGraphics,
  loadMarkdown,
  toMarkdown,
} from './info';

const GB = 1024 ** 3;
const measure60 = async () => 60;

async function nativeBasics(system: Partial<SystemInfo> = {}): Promise<Basics> {
  mockTauri();
  const app: AppInfo = await getAppInfo();
  return { app, system: { ...SYSTEM_INFO, ...system } };
}

const group = (groups: InfoGroup[], title: string) => groups.find((g) => g.title === title);
const values = (groups: InfoGroup[], title: string) =>
  group(groups, title)?.items.map((item) => [item.label, item.value]);

describe('loading', () => {
  it('uses only browser information outside Tauri', async () => {
    const basics = await loadBasics();
    expect(basics.system).toBeNull();
    const graphics = await loadGraphics(measure60);
    expect(graphics.gpus).toEqual([]);
    expect(graphics.displays).toEqual([
      expect.objectContaining({ name: 'This screen', refreshHz: 60, measured: true }),
    ]);
    const unmeasured = await loadGraphics(async () => null);
    expect(unmeasured.displays[0]?.measured).toBe(false);
  });

  it('asks Rust inside Tauri and measures the current screen', async () => {
    mockTauri();
    const basics = await loadBasics();
    expect(basics.system?.cpuBrand).toBe('Test CPU 9000');
    const graphics = await loadGraphics(async () => 144);
    expect(graphics.gpus).toEqual(GRAPHICS_INFO.gpus);
    expect(graphics.displays).toEqual([
      {
        name: 'Display 1',
        width: 2560,
        height: 1440,
        scale: 1,
        refreshHz: 144,
        primary: true,
        measured: true,
      },
    ]);
  });

  it('prefers the displays macOS reports, refresh rate included', async () => {
    mockTauri({
      system_graphics: () => ({
        gpus: [],
        displays: [
          {
            name: 'Built-in display',
            width: 3024,
            height: 1964,
            scale: 2,
            refreshHz: 120,
            primary: true,
            builtin: true,
          },
          {
            name: 'Odd',
            width: 800,
            height: 600,
            scale: null,
            refreshHz: null,
            primary: false,
            builtin: false,
          },
        ],
      }),
    });
    const graphics = await loadGraphics(async () => {
      throw new Error('should not measure');
    });
    expect(graphics.displays.map((d) => [d.name, d.refreshHz, d.scale, d.measured])).toEqual([
      ['Built-in display', 120, 2, false],
      ['Odd', null, 1, false],
    ]);
  });

  it('still lists GPUs when the monitor APIs fail', async () => {
    const fail = () => {
      throw new Error('no monitors');
    };
    mockTauri({
      'plugin:window|available_monitors': fail,
      'plugin:window|current_monitor': fail,
      'plugin:window|primary_monitor': fail,
    });
    const graphics = await loadGraphics(measure60);
    expect(graphics.gpus).toHaveLength(1);
    expect(graphics.displays).toEqual([]);
  });

  it('builds the Markdown with everything loaded', async () => {
    mockTauri();
    const markdown = await loadMarkdown();
    expect(markdown).toMatch(/^## Framework Laptop 13\n/);
    expect(markdown).toContain(
      '- **GPU:** GeForce RTX 4070 (NVIDIA · 12 GB video memory · Driver 560.94)',
    );
  });
});

describe('displaysFromMonitors', () => {
  it('names Windows monitors and marks the current and main one', () => {
    const left = monitor('\\\\.\\DISPLAY1', 0);
    const right = monitor('DELL S2721DGF', 2560, 3840, 2160, 1.5);
    expect(displaysFromMonitors([left, right], right, left, 165)).toEqual([
      expect.objectContaining({
        name: 'Display 1',
        primary: true,
        refreshHz: null,
        measured: false,
      }),
      expect.objectContaining({
        name: 'DELL S2721DGF',
        scale: 1.5,
        refreshHz: 165,
        measured: true,
      }),
    ]);
    expect(displaysFromMonitors([monitor(null)], null, null, null)[0]?.name).toBe('Display 1');
  });
});

describe('buildReport', () => {
  const graphics: Graphics = {
    gpus: GRAPHICS_INFO.gpus,
    displays: [
      {
        name: 'DELL S2721DGF',
        width: 2560,
        height: 1440,
        scale: 1.25,
        refreshHz: 165,
        primary: true,
        measured: true,
      },
    ],
  };

  it('shows the browser preview outside Tauri', async () => {
    const report = buildReport(await loadBasics(), undefined);
    expect(report.title).toBe('This browser');
    expect(report.groups.map((g) => g.title)).toEqual(['Browser', 'Displays', 'App & region']);
    expect(values(report.groups, 'Displays')).toEqual([['Displays', DETECTING]]);
  });

  it('describes the machine', async () => {
    const report = buildReport(await nativeBasics(), graphics, 'linux');
    expect(report.title).toBe('Framework Laptop 13');
    expect(report.subtitle).toBe('Linux 24.04 Ubuntu · Test CPU 9000 · up 1h 5m');
    expect(report.groups.map((g) => g.title)).toEqual([
      'Device',
      'Processor',
      'Graphics',
      'Displays',
      'Storage',
      'Network',
      'Operating system',
      'App & region',
    ]);
    expect(values(report.groups, 'Device')).toEqual([
      ['Computer name', 'workbench'],
      ['Model', 'Framework Laptop 13'],
      ['Motherboard', 'Framework FRANMDCP07'],
      ['Memory', '16 GB'],
    ]);
    expect(values(report.groups, 'Processor')).toEqual([
      ['Model', 'Test CPU 9000'],
      ['Cores', '4 cores, 8 threads'],
      ['Speed', '3.7 GHz'],
      ['Architecture', 'x86_64'],
    ]);
    expect(group(report.groups, 'Displays')?.items).toEqual([
      {
        label: 'DELL S2721DGF',
        value: '2560 × 1440 at 165 Hz',
        detail: 'Main display · 125% scale · Refresh rate measured',
      },
    ]);
    expect(group(report.groups, 'Storage')?.items).toEqual([
      {
        label: '/',
        value: '200 GB free of 512 GB',
        detail: 'SSD · ext4',
        meter: { fraction: 1 - 200 / 512, tone: 'normal' },
        status: undefined,
      },
    ]);
    expect(group(report.groups, 'Network')?.items).toEqual([
      { label: 'wlp2s0', value: '192.168.1.20', detail: '2a02:1::5' },
    ]);
    expect(group(report.groups, 'Device')?.items[3]?.detail).toBe('Plus 4 GB swap');
  });

  it('shows placeholders while graphics load and when nothing is found', async () => {
    const basics = await nativeBasics();
    expect(values(buildReport(basics, undefined).groups, 'Graphics')).toEqual([['GPU', DETECTING]]);
    const empty = buildReport(basics, { gpus: [], displays: [] });
    expect(values(empty.groups, 'Graphics')).toEqual([['GPU', 'Unknown']]);
    expect(values(empty.groups, 'Displays')).toEqual([['Displays', 'Unknown']]);
  });

  it('describes every GPU in its own words', async () => {
    const report = buildReport(await nativeBasics(), {
      gpus: [
        {
          name: 'Apple M3 Pro',
          vendor: 'Apple',
          memoryBytes: null,
          cores: 18,
          driverVersion: null,
        },
        {
          name: 'Intel UHD 770',
          vendor: 'Intel',
          memoryBytes: null,
          cores: null,
          driverVersion: null,
        },
      ],
      displays: [],
    });
    expect(group(report.groups, 'Graphics')?.items).toEqual([
      { label: 'GPU 1', value: 'Apple M3 Pro', detail: 'Shares system memory · 18 cores' },
      { label: 'GPU 2', value: 'Intel UHD 770', detail: undefined },
    ]);
  });

  it('names the device from whatever the firmware provides', async () => {
    const title = async (device: SystemInfo['device'], hostName: string | null = 'pc') =>
      buildReport(await nativeBasics({ device, hostName }), graphics).title;
    expect(
      await title({
        vendor: 'Apple Inc.',
        model: 'MacBook Pro (14-inch, Nov 2023)',
        motherboard: null,
      }),
    ).toBe('MacBook Pro (14-inch, Nov 2023)');
    expect(await title({ vendor: 'Dell Inc.', model: 'XPS 15 9520', motherboard: null })).toBe(
      'Dell XPS 15 9520',
    );
    expect(await title({ vendor: 'LENOVO', model: 'Lenovo Legion 5', motherboard: null })).toBe(
      'Lenovo Legion 5',
    );
    expect(await title({ vendor: null, model: 'Custom', motherboard: null })).toBe('Custom');
    expect(
      await title({ vendor: 'ASUS', model: null, motherboard: 'ASUS B550' }, 'GAMING-PC'),
    ).toBe('GAMING-PC');
    expect(await title({ vendor: null, model: null, motherboard: null }, null)).toBe(
      'This computer',
    );
  });

  it('labels drives per OS and warns when they fill up', async () => {
    const disk = (name: string, mountPoint: string, free: number) => ({
      name,
      mountPoint,
      fileSystem: 'NTFS',
      kind: 'unknown' as const,
      totalBytes: 100 * GB,
      availableBytes: free * GB,
      removable: name === 'USB',
    });
    const disks = [disk('Windows', 'C:\\', 10), disk('', 'D:\\', 3), disk('USB', 'E:\\', 50)];
    const windows = buildReport(await nativeBasics({ disks }), graphics, 'windows');
    expect(
      group(windows.groups, 'Storage')?.items.map((i) => [
        i.label,
        i.status,
        i.meter?.tone,
        i.detail,
      ]),
    ).toEqual([
      ['C: Windows', 'Running low', 'warning', 'NTFS'],
      ['D:', 'Almost full', 'danger', 'NTFS'],
      ['E: USB', undefined, 'normal', 'NTFS · Removable'],
    ]);
    const mac = buildReport(
      await nativeBasics({
        disks: [
          { ...disk('Macintosh HD', '/', 50), totalBytes: 500_000_000_000, availableBytes: null },
        ],
      }),
      graphics,
      'macos',
    );
    expect(values(mac.groups, 'Storage')).toEqual([['Macintosh HD', 'Unknown free of 500 GB']]);
    const broken = buildReport(
      await nativeBasics({ disks: [{ ...disk('x', '/x', 0), totalBytes: null }] }),
      graphics,
      'linux',
    );
    expect(group(broken.groups, 'Storage')?.items[0]?.meter).toEqual({
      fraction: 0,
      tone: 'normal',
    });
    const none = buildReport(await nativeBasics({ disks: [] }), graphics);
    expect(group(none.groups, 'Storage')).toBeUndefined();
  });

  it('handles missing optional values', async () => {
    const report = buildReport(
      await nativeBasics({
        device: { vendor: null, model: null, motherboard: null },
        osName: null,
        osVersion: null,
        kernelVersion: null,
        hostName: null,
        cpuBrand: null,
        cpuFrequencyMhz: null,
        physicalCores: null,
        logicalCores: 2,
        totalSwapBytes: null,
        uptimeSeconds: null,
        networks: [],
      }),
      graphics,
    );
    expect(report.subtitle).toBe('up Unknown');
    expect(values(report.groups, 'Device')).toEqual([
      ['Computer name', 'Unknown'],
      ['Memory', '16 GB'],
    ]);
    expect(values(report.groups, 'Processor')).toEqual([
      ['Model', 'Unknown'],
      ['Cores', '2 threads'],
      ['Architecture', 'x86_64'],
    ]);
    expect(values(report.groups, 'Network')).toEqual([['Status', 'Not connected']]);
    expect(values(report.groups, 'Operating system')?.[0]).toEqual(['Name', 'Unknown']);
    const noAddress = buildReport(
      await nativeBasics({ networks: [{ name: 'en0', addresses: [] }] }),
      graphics,
    );
    expect(values(noAddress.groups, 'Network')).toEqual([['en0', 'Unknown']]);
  });

  describe('battery', () => {
    const battery = (overrides: Partial<BatteryInfo>): BatteryInfo => ({
      chargePercent: 82,
      state: 'charging',
      healthPercent: 91,
      cycleCount: 212,
      secondsToFull: 3_900,
      secondsToEmpty: null,
      ...overrides,
    });
    const items = async (overrides: Partial<BatteryInfo>) =>
      group(
        buildReport(await nativeBasics({ battery: battery(overrides) }), graphics).groups,
        'Battery',
      )?.items;

    it('shows charge, time, health and cycles', async () => {
      expect((await items({}))?.map((i) => [i.label, i.value])).toEqual([
        ['Charge', '82%, charging'],
        ['Time to full', '1h 5m'],
        ['Health', '91% of original capacity'],
        ['Charge cycles', '212'],
      ]);
    });

    it('warns about low charge on battery and a worn battery', async () => {
      const low = await items({
        state: 'discharging',
        chargePercent: 15,
        secondsToEmpty: 1_800,
        healthPercent: 76,
      });
      expect(low?.map((i) => [i.label, i.value, i.status])).toEqual([
        ['Charge', '15%, on battery', 'Low'],
        ['Time left', '30m', undefined],
        ['Health', '76% of original capacity', 'Service recommended'],
        ['Charge cycles', '212', undefined],
      ]);
      const empty = await items({ state: 'discharging', chargePercent: 4, secondsToEmpty: null });
      expect(empty?.[0]).toMatchObject({ status: 'Very low', meter: { tone: 'danger' } });
    });

    it('leaves out what the battery does not report', async () => {
      expect(
        (
          await items({
            state: 'unknown',
            chargePercent: null,
            healthPercent: null,
            cycleCount: null,
          })
        )?.map((i) => [i.label, i.value]),
      ).toEqual([['Charge', '0%']]);
      expect((await items({ state: 'full', secondsToFull: null }))?.[0]?.value).toBe(
        '82%, fully charged',
      );
    });
  });
});

describe('toMarkdown', () => {
  it('renders a heading, sections and extra details', () => {
    expect(
      toMarkdown({
        title: 'PC',
        subtitle: 'Windows 11',
        groups: [
          { title: 'A', items: [{ label: 'x', value: '1' }] },
          { title: 'B', items: [{ label: 'y', value: '2', detail: 'SSD', status: 'Almost full' }] },
        ],
      }),
    ).toBe('## PC\nWindows 11\n\n### A\n- **x:** 1\n\n### B\n- **y:** 2 (Almost full · SSD)');
  });
});
