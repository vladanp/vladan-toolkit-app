import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureRefreshRate, refreshRateFromFrames } from './refresh-rate';

const frames = (count: number, interval: number, start = 1000) =>
  Array.from({ length: count }, (_, index) => start + index * interval);

describe('refreshRateFromFrames', () => {
  it('uses the median frame time', () => {
    expect(refreshRateFromFrames(frames(30, 1000 / 60))).toBe(60);
    expect(refreshRateFromFrames(frames(30, 1000 / 144))).toBe(144);
    // One dropped frame doesn't move the median.
    expect(refreshRateFromFrames([...frames(20, 1000 / 120), 1000 + 19 * (1000 / 120) + 50])).toBe(
      120,
    );
  });

  it('needs at least two frames', () => {
    expect(refreshRateFromFrames([])).toBeNull();
    expect(refreshRateFromFrames([5])).toBeNull();
    expect(refreshRateFromFrames([5, 5, 5])).toBeNull();
  });
});

describe('measureRefreshRate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('times frames from the scheduler', async () => {
    let time = 0;
    const schedule = (callback: (time: number) => void) => {
      time += 1000 / 165;
      queueMicrotask(() => callback(time));
    };
    await expect(measureRefreshRate(20, 1000, schedule)).resolves.toBe(165);
  });

  it('gives up when frames stop coming (hidden window)', async () => {
    vi.useFakeTimers();
    const result = measureRefreshRate(20, 500, () => {});
    vi.advanceTimersByTime(500);
    await expect(result).resolves.toBeNull();
  });

  it('ignores frames that arrive after it gave up', async () => {
    vi.useFakeTimers();
    let late: ((time: number) => void) | undefined;
    const result = measureRefreshRate(20, 500, (callback) => {
      late = callback;
    });
    vi.advanceTimersByTime(500);
    late?.(1234);
    await expect(result).resolves.toBeNull();
  });

  it('uses requestAnimationFrame by default', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    await measureRefreshRate(2, 2000);
    expect(raf).toHaveBeenCalled();
  });
});
