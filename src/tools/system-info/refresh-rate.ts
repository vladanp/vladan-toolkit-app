import { snapRefreshRate } from './format';

/** Refresh rate from consecutive frame timestamps (ms), using the median frame time. */
export function refreshRateFromFrames(timestamps: readonly number[]): number | null {
  const deltas = timestamps
    .slice(1)
    .map((stamp, index) => stamp - (timestamps[index] ?? stamp))
    .filter((delta) => delta > 0)
    .sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  return median ? snapRefreshRate(1000 / median) : null;
}

type FrameScheduler = (callback: (time: number) => void) => unknown;

/**
 * Measures the refresh rate of the screen this window is on by timing animation frames,
 * which the webview paints in step with the display. Resolves `null` when frames don't
 * arrive (a hidden window), so callers never wait more than `timeoutMs`.
 */
export function measureRefreshRate(
  frames = 60,
  timeoutMs = 3000,
  schedule: FrameScheduler = (callback) => requestAnimationFrame(callback),
): Promise<number | null> {
  return new Promise((resolve) => {
    const timestamps: number[] = [];
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const onFrame = (time: number) => {
      if (done) return;
      timestamps.push(time);
      if (timestamps.length > frames) finish(refreshRateFromFrames(timestamps));
      else schedule(onFrame);
    };
    schedule(onFrame);
  });
}
