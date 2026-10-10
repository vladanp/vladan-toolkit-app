import { Toaster } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { mockTauri, SYSTEM_INFO, SYSTEM_USAGE } from '@/test/tauri';
import tool from './index';
import SystemInfo, { copySystemInfo } from './SystemInfo';
import { UsagePanel } from './UsagePanel';

const GB = 1024 ** 3;

function stubClipboard() {
  return vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
}

describe('System Info tool', () => {
  it('is registered with a lazy component and a palette command', () => {
    expect(tool.id).toBe('system-info');
    expect(tool.commands?.map((c) => c.id)).toEqual(['copy']);
  });

  it('shows the machine, live load and every section, then copies it as Markdown', async () => {
    mockTauri();
    const writeText = stubClipboard();
    const screen = await render(
      <>
        <SystemInfo />
        <Toaster />
      </>,
    );
    await expect
      .element(screen.getByRole('heading', { level: 2, name: 'Framework Laptop 13' }))
      .toBeVisible();
    for (const name of ['Device', 'Processor', 'Graphics', 'Displays', 'Storage', 'Network']) {
      await expect.element(screen.getByRole('region', { name })).toBeVisible();
    }
    await expect.element(screen.getByText('GeForce RTX 4070')).toBeVisible();
    await expect.element(screen.getByText(/^2560 × 1440 at \d+ Hz$/)).toBeVisible();
    await expect
      .element(screen.getByRole('meter', { name: '/ used' }))
      .toHaveAttribute('aria-valuenow', '61');
    const live = screen.getByRole('region', { name: 'Live usage' });
    await expect.element(live.getByText('23%')).toBeVisible();
    await expect.element(live.getByText('Busiest core 74%')).toBeVisible();

    await screen.getByRole('button', { name: 'Copy as Markdown' }).click();
    expect(writeText.mock.calls[0]?.[0]).toContain('### Graphics');
    await expect.element(screen.getByText('System info copied as Markdown')).toBeVisible();
  });

  it('copies right away even while graphics are still loading', async () => {
    let finish: (value: unknown) => void = () => {};
    mockTauri({
      system_graphics: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const writeText = stubClipboard();
    const screen = await render(<SystemInfo />);
    await expect.element(screen.getByText('Detecting…').first()).toBeVisible();
    await screen.getByRole('button', { name: 'Copy as Markdown' }).click();
    finish({ gpus: [], displays: [] });
    // Waits for the refresh rate measurement (about a second of frames) too.
    await expect.poll(() => writeText.mock.calls.length, { timeout: 5000 }).toBe(1);
    expect(writeText.mock.calls[0]?.[0]).not.toContain('Detecting');
  });

  it('refreshes everything', async () => {
    const systemInfo = vi.fn(() => SYSTEM_INFO);
    mockTauri({ system_info: systemInfo });
    const screen = await render(<SystemInfo />);
    await expect.element(screen.getByRole('region', { name: 'Device' })).toBeVisible();
    await screen.getByRole('button', { name: 'Refresh' }).click();
    await expect.poll(() => systemInfo.mock.calls.length).toBe(2);
    await expect.element(screen.getByText('GeForce RTX 4070')).toBeVisible();
  });

  it('shows warnings in words, not only color', async () => {
    mockTauri({
      system_info: () => ({
        ...SYSTEM_INFO,
        disks: [{ ...SYSTEM_INFO.disks[0], availableBytes: 2 * GB }],
      }),
    });
    const screen = await render(<SystemInfo />);
    await expect.element(screen.getByText('Almost full')).toBeVisible();
  });

  it('shows the browser preview outside the desktop app', async () => {
    const screen = await render(<SystemInfo />);
    await expect.element(screen.getByRole('heading', { name: 'This browser' })).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Browser' })).toBeVisible();
    expect(screen.container.querySelector('[aria-label="Live usage"]')).toBeNull();
  });

  it('shows an error when the backend fails', async () => {
    mockTauri({
      system_info: () => {
        throw new Error('permission denied');
      },
    });
    const screen = await render(<SystemInfo />);
    await expect.element(screen.getByRole('alert')).toMatchTextContent('permission denied');
  });

  it('palette command copies without opening the tool', async () => {
    const writeText = stubClipboard();
    await render(<Toaster />);
    await tool.commands?.[0]?.run({ openTool: async () => {} });
    expect(writeText).toHaveBeenCalledOnce();
    await copySystemInfo();
    expect(writeText).toHaveBeenCalledTimes(2);
  });
});

describe('UsagePanel', () => {
  it('draws trends with a hover readout', async () => {
    mockTauri();
    const screen = await render(<UsagePanel />);
    const trend = screen.getByRole('img', {
      name: /^CPU over the last 2 minutes: low 23%, high 23%$/,
    });
    await expect.element(trend).toBeVisible();
    // The newest sample sits at the right edge; the rest of the line is still empty.
    const { width } = trend.element().getBoundingClientRect();
    await userEvent.hover(trend, { position: { x: width / 2, y: 10 } });
    await expect.element(page.getByText(/ · now$/)).not.toBeInTheDocument();
    await userEvent.hover(trend, { position: { x: width - 2, y: 10 } });
    await expect.element(page.getByText('23% · now')).toBeInTheDocument();
    await userEvent.unhover(trend);
    await expect.element(page.getByText('23% · now')).not.toBeInTheDocument();
  });

  it('flags memory that is almost full and missing swap', async () => {
    mockTauri({
      system_usage: () => ({
        ...SYSTEM_USAGE,
        cpuPercent: null,
        corePercents: [null],
        memoryUsedBytes: 15.5 * GB,
        swapTotalBytes: null,
      }),
    });
    const screen = await render(<UsagePanel />);
    await expect.element(screen.getByText('Almost full')).toBeVisible();
    await expect.element(screen.getByText('No swap')).toBeVisible();
    await expect.element(screen.getByText('Busiest core 0%')).toBeVisible();
  });

  it('copes with a machine that reports no memory or cores', async () => {
    mockTauri({
      system_usage: () => ({ ...SYSTEM_USAGE, corePercents: [], memoryTotalBytes: null }),
    });
    const screen = await render(<UsagePanel />);
    await expect.element(screen.getByText('Busiest core 0%')).toBeVisible();
    await expect
      .element(screen.getByRole('img', { name: /^Memory over the last 2 minutes: low 0%/ }))
      .toBeVisible();
  });

  it('explains when live usage is unavailable', async () => {
    mockTauri({
      system_usage: () => {
        throw new Error('sampler gone');
      },
    });
    const screen = await render(<UsagePanel />);
    await expect
      .element(screen.getByText("Live usage isn't available: sampler gone"))
      .toBeVisible();
  });
});
