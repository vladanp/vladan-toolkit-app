import type { Channel } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SpeedTestEvent } from '@/bindings';
import { mockTauri, SPEED_TEST_RESULT as RESULT } from '@/test/tauri';
import { toSaved } from './results';
import {
  applyEvent,
  CANCELLED,
  HISTORY_LIMIT,
  type Live,
  overallProgress,
  useSpeedTest,
} from './store';

const live = (overrides: Partial<Live> = {}): Live => ({
  phase: 'latency',
  progress: 0,
  latencyMs: null,
  downloadMbps: null,
  uploadMbps: null,
  trace: [],
  ...overrides,
});

/** A `speed_test_run` handler that replays `events`, then settles with `outcome`. */
function runReplaying(events: SpeedTestEvent[], outcome: () => unknown) {
  return (args: unknown) => {
    const channel = (args as { onEvent: Channel<SpeedTestEvent> }).onEvent;
    for (const event of events) channel.onmessage(event);
    return outcome();
  };
}

beforeEach(() => {
  useSpeedTest.setState(useSpeedTest.getInitialState(), true);
});

describe('applyEvent', () => {
  it('tracks the phase and its readings', () => {
    let state = live();
    state = applyEvent(state, { type: 'progress', phase: 'latency', value: 21, fraction: 0.5 });
    expect(state).toMatchObject({ latencyMs: 21, progress: 0.5 });
    state = applyEvent(state, { type: 'phase', phase: 'download' });
    expect(state).toMatchObject({ phase: 'download', progress: 0, trace: [] });
    state = applyEvent(state, { type: 'progress', phase: 'download', value: 300, fraction: 0.2 });
    state = applyEvent(state, { type: 'progress', phase: 'download', value: 450, fraction: 0.4 });
    expect(state).toMatchObject({ downloadMbps: 450, trace: [300, 450], latencyMs: 21 });
    state = applyEvent(state, { type: 'phase', phase: 'upload' });
    state = applyEvent(state, { type: 'progress', phase: 'upload', value: null, fraction: null });
    expect(state).toMatchObject({ uploadMbps: 0, progress: 0, trace: [0], downloadMbps: 450 });
    const connection = { server: null, isp: null, ip: null, location: null };
    expect(applyEvent(state, { type: 'connection', connection })).toBe(state);
  });

  it('turns phases into one overall progress', () => {
    expect(overallProgress(live())).toBe(0);
    expect(overallProgress(live({ progress: 1 }))).toBeCloseTo(0.1);
    expect(overallProgress(live({ phase: 'download', progress: 0.5 }))).toBeCloseTo(0.325);
    expect(overallProgress(live({ phase: 'upload', progress: 2 }))).toBeCloseTo(1);
  });
});

describe('useSpeedTest', () => {
  it('does nothing outside the desktop app', async () => {
    await useSpeedTest.getState().start();
    expect(useSpeedTest.getState().status).toBe('idle');
  });

  it('runs a test, streams progress and saves the result', async () => {
    const seen: (Live | null)[] = [];
    const unsubscribe = useSpeedTest.subscribe((state) => seen.push(state.live));
    mockTauri({
      speed_test_run: runReplaying(
        [
          { type: 'phase', phase: 'latency' },
          { type: 'connection', connection: RESULT.connection },
          { type: 'progress', phase: 'latency', value: 18, fraction: 1 },
          { type: 'phase', phase: 'download' },
          { type: 'progress', phase: 'download', value: 480, fraction: 0.5 },
        ],
        () => RESULT,
      ),
    });
    await useSpeedTest.getState().start();
    unsubscribe();

    const state = useSpeedTest.getState();
    expect(state.status).toBe('idle');
    expect(state.live).toBeNull();
    expect(state.connection).toEqual(RESULT.connection);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ downloadMbps: 487.3, server: 'Frankfurt (FRA)' });
    expect(seen).toContainEqual(expect.objectContaining({ phase: 'download', downloadMbps: 480 }));
    // Only the history survives a restart.
    expect(JSON.parse(localStorage.getItem('vt:speed-test') ?? '{}').state).toEqual({
      history: state.history,
    });
  });

  it('keeps a limited history, newest first', async () => {
    mockTauri({ speed_test_run: () => RESULT });
    const old = Array.from({ length: HISTORY_LIMIT }, (_, index) => toSaved(RESULT, index));
    useSpeedTest.setState({ history: old });
    await useSpeedTest.getState().start();
    const { history } = useSpeedTest.getState();
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0]?.downloadMbps).toBe(487.3);
    useSpeedTest.getState().clearHistory();
    expect(useSpeedTest.getState().history).toEqual([]);
  });

  it('reports failures and treats a stop as no result', async () => {
    mockTauri({
      speed_test_run: () => Promise.reject('The speed test server is busy. Try again in a minute.'),
    });
    await useSpeedTest.getState().start();
    expect(useSpeedTest.getState()).toMatchObject({
      status: 'error',
      error: 'The speed test server is busy. Try again in a minute.',
    });

    mockTauri({ speed_test_run: () => Promise.reject(new Error(CANCELLED)) });
    await useSpeedTest.getState().start();
    expect(useSpeedTest.getState()).toMatchObject({ status: 'idle', live: null, history: [] });
  });

  it('ignores a second start and forwards stop to Rust', async () => {
    const calls = mockTauri({ speed_test_run: () => new Promise(() => {}) });
    void useSpeedTest.getState().start();
    void useSpeedTest.getState().start();
    await useSpeedTest.getState().cancel();
    expect(calls.filter((c) => c.cmd === 'speed_test_run')).toHaveLength(1);
    expect(calls.map((c) => c.cmd)).toContain('speed_test_cancel');
  });
});
