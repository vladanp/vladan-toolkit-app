import type { Channel } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { SpeedTestEvent } from '@/bindings';
import { mockTauri, SPEED_TEST_RESULT } from '@/test/tauri';
import tool from './index';
import { toSaved } from './results';
import SpeedTest from './SpeedTest';
import { useSpeedTest } from './store';

/** A `speed_test_run` the test drives by hand: send events, then finish or fail it. */
function controlledRun() {
  let channel: Channel<SpeedTestEvent> | undefined;
  let settle: { resolve: (value: unknown) => void; reject: (reason: unknown) => void } | undefined;
  return {
    handler: (args: unknown) => {
      channel = (args as { onEvent: Channel<SpeedTestEvent> }).onEvent;
      return new Promise((resolve, reject) => {
        settle = { resolve, reject };
      });
    },
    send: (event: SpeedTestEvent) => channel?.onmessage(event),
    finish: () => settle?.resolve(SPEED_TEST_RESULT),
    fail: (reason: string) => settle?.reject(reason),
  };
}

beforeEach(() => {
  useSpeedTest.setState(useSpeedTest.getInitialState(), true);
});

describe('Speed Test tool', () => {
  it('is registered with a palette command', () => {
    expect(tool.id).toBe('speed-test');
    expect(tool.commands?.map((c) => c.id)).toEqual(['run']);
  });

  it('explains that the test needs the desktop app', async () => {
    const screen = await render(<SpeedTest />);
    await expect.element(screen.getByRole('button', { name: 'Start test' })).toBeDisabled();
    await expect.element(screen.getByText('The speed test runs in the desktop app.')).toBeVisible();
  });

  it('shows live progress, then the result with what it means', async () => {
    const run = controlledRun();
    mockTauri({ speed_test_run: run.handler });
    const screen = await render(<SpeedTest />);
    await screen.getByRole('button', { name: 'Start test' }).click();
    await expect.element(screen.getByText('Measuring ping…')).toBeVisible();

    run.send({ type: 'progress', phase: 'latency', value: 18.4, fraction: 1 });
    await expect.element(screen.getByText('18', { exact: true })).toBeVisible();
    run.send({ type: 'phase', phase: 'download' });
    run.send({ type: 'progress', phase: 'download', value: 312, fraction: 0.3 });
    run.send({ type: 'progress', phase: 'download', value: 480.4, fraction: 0.6 });
    await expect.element(screen.getByText('Testing download…')).toBeVisible();
    await expect.element(screen.getByText('480', { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole('meter', { name: 'Test progress' }))
      .toHaveAttribute('aria-valuenow', '37');
    await expect
      .element(screen.getByRole('img', { name: 'Download speed so far, peak 480 Mbps' }))
      .toBeVisible();
    run.send({ type: 'phase', phase: 'upload' });
    run.send({ type: 'progress', phase: 'upload', value: 54, fraction: 0.5 });
    await expect.element(screen.getByText('Testing upload…')).toBeVisible();

    run.finish();
    const results = screen.getByRole('region', { name: 'Speed test' });
    await expect.element(results.getByText('487', { exact: true })).toBeVisible();
    await expect.element(results.getByText('54.3', { exact: true })).toBeVisible();
    await expect
      .element(results.getByText(/^Last test just now · Frankfurt \(FRA\)$/))
      .toBeVisible();

    const meaning = screen.getByRole('region', { name: 'What this means' });
    await expect.element(meaning.getByText('Several 4K streams at once')).toBeVisible();
    await expect
      .element(meaning.getByText(/Ping goes from 18 ms to 140 ms when the line is busy/))
      .toBeVisible();
    await expect.element(meaning.getByText('Downloads in about 27m 22s')).toBeVisible();

    const connection = screen.getByRole('region', { name: 'Connection' });
    await expect.element(connection.getByText('Example ISP')).toBeVisible();
    await expect.element(connection.getByText('690 MB')).toBeVisible();
    const rows = screen.getByRole('region', { name: 'History' }).getByRole('row');
    await expect.element(rows.last()).toBeVisible();
    expect(rows.elements()).toHaveLength(2);
  });

  it('stops a running test and returns to where it was', async () => {
    const run = controlledRun();
    const calls = mockTauri({ speed_test_run: run.handler });
    const screen = await render(<SpeedTest />);
    await screen.getByRole('button', { name: 'Start test' }).click();
    await screen.getByRole('button', { name: 'Stop' }).click();
    expect(calls.map((c) => c.cmd)).toContain('speed_test_cancel');
    run.fail('Cancelled');
    await expect.element(screen.getByRole('button', { name: 'Start test' })).toBeVisible();
    expect(screen.container.querySelector('[role="alert"]')).toBeNull();
  });

  it('says why a test failed', async () => {
    const run = controlledRun();
    mockTauri({ speed_test_run: run.handler });
    const screen = await render(<SpeedTest />);
    await screen.getByRole('button', { name: 'Start test' }).click();
    run.fail("Couldn't reach the speed test server. Check your internet connection.");
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(
        "Speed test failed: Couldn't reach the speed test server. Check your internet connection.",
      );
  });

  it('keeps a history with a trend and can clear it', async () => {
    mockTauri();
    const now = Date.now();
    useSpeedTest.setState({
      history: [
        toSaved(SPEED_TEST_RESULT, now),
        toSaved({ ...SPEED_TEST_RESULT, downloadMbps: 300 }, now - 3_600_000),
        toSaved({ ...SPEED_TEST_RESULT, downloadMbps: 250 }, now - 7_200_000),
      ],
    });
    const screen = await render(<SpeedTest />);
    const history = screen.getByRole('region', { name: 'History' });
    const trend = history.getByRole('img', {
      name: 'Download speed over the last 3 tests: low 250, high 487 Mbps',
    });
    await expect.element(trend).toBeVisible();
    const { width } = trend.element().getBoundingClientRect();
    await userEvent.hover(trend, { position: { x: width - 2, y: 10 } });
    await expect.element(page.getByText('487 Mbps · just now')).toBeInTheDocument();
    expect(history.getByRole('row').elements()).toHaveLength(4);

    await history.getByRole('button', { name: 'Clear' }).click();
    await expect.element(screen.getByRole('button', { name: 'Start test' })).toBeVisible();
  });

  it('runs again from the result view and from the palette', async () => {
    const calls = mockTauri({ speed_test_run: () => SPEED_TEST_RESULT });
    useSpeedTest.setState({ history: [toSaved(SPEED_TEST_RESULT, Date.now())] });
    const screen = await render(<SpeedTest />);
    await screen.getByRole('button', { name: 'Run again' }).click();
    await expect.poll(() => useSpeedTest.getState().history.length).toBe(2);

    let opened = false;
    await tool.commands?.[0]?.run({
      openTool: async () => {
        opened = true;
      },
    });
    expect(opened).toBe(true);
    await expect.poll(() => calls.filter((c) => c.cmd === 'speed_test_run').length).toBe(2);
  });
});
