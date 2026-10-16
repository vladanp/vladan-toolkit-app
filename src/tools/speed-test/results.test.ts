import { describe, expect, it } from 'vitest';
import {
  downloadSeconds,
  formatData,
  formatMbps,
  formatMs,
  formatWait,
  loadedLatency,
  type SavedResult,
  toSaved,
  verdicts,
} from './results';

const result = (overrides: Partial<SavedResult> = {}): SavedResult => ({
  at: 1,
  downloadMbps: 487,
  uploadMbps: 54,
  latencyMs: 18,
  jitterMs: 2,
  downloadLatencyMs: 40,
  uploadLatencyMs: 30,
  dataUsedBytes: 690e6,
  server: 'Frankfurt (FRA)',
  isp: 'Example ISP',
  ip: '203.0.113.7',
  location: 'Belgrade, RS',
  ...overrides,
});

describe('toSaved', () => {
  it('flattens the connection and defaults missing numbers', () => {
    expect(
      toSaved(
        {
          downloadMbps: null,
          uploadMbps: 10,
          latencyMs: null,
          jitterMs: null,
          downloadLatencyMs: null,
          uploadLatencyMs: 70,
          dataUsedBytes: null,
          connection: { server: null, isp: 'ISP', ip: null, location: null },
        },
        42,
      ),
    ).toEqual({
      at: 42,
      downloadMbps: 0,
      uploadMbps: 10,
      latencyMs: 0,
      jitterMs: 0,
      downloadLatencyMs: null,
      uploadLatencyMs: 70,
      dataUsedBytes: 0,
      server: null,
      isp: 'ISP',
      ip: null,
      location: null,
    });
  });
});

describe('formatting', () => {
  it('formats speeds, data, latency and waits', () => {
    expect(formatMbps(487.3)).toBe('487');
    expect(formatMbps(54.27)).toBe('54.3');
    expect(formatMbps(8)).toBe('8');
    expect(formatData(690e6)).toBe('690 MB');
    expect(formatData(1_234_000_000)).toBe('1.2 GB');
    expect(formatData(10)).toBe('1 MB');
    expect(formatMs(18.4)).toBe('18 ms');
    expect(formatWait(6720)).toBe('1h 52m');
    expect(formatWait(190)).toBe('3m 10s');
    expect(formatWait(0.2)).toBe('1s');
  });

  it('works out download times', () => {
    expect(downloadSeconds(100e9, 800)).toBe(1000);
    expect(downloadSeconds(100e9, 0)).toBeNull();
  });
});

describe('verdicts', () => {
  const grades = (overrides: Partial<SavedResult>) =>
    verdicts(result(overrides)).map((v) => [v.activity, v.grade]);

  it('grades a fast, steady line as great', () => {
    expect(grades({})).toEqual([
      ['4K streaming', 'great'],
      ['Online gaming', 'great'],
      ['Video calls', 'great'],
    ]);
  });

  it('grades middling lines as okay', () => {
    expect(grades({ downloadMbps: 20, uploadMbps: 2, latencyMs: 45, jitterMs: 12 })).toEqual([
      ['4K streaming', 'ok'],
      ['Online gaming', 'ok'],
      ['Video calls', 'ok'],
    ]);
  });

  it('grades slow or laggy lines as poor', () => {
    const poor = verdicts(
      result({ downloadMbps: 8, uploadMbps: 0.8, latencyMs: 120, jitterMs: 3 }),
    );
    expect(poor.map((v) => v.grade)).toEqual(['poor', 'poor', 'poor']);
    expect(poor.map((v) => v.summary)).toEqual([
      'Streams will drop to HD',
      'Expect noticeable lag',
      'Calls will struggle',
    ]);
  });
});

describe('loadedLatency', () => {
  it('needs at least one reading under load', () => {
    expect(loadedLatency(result({ downloadLatencyMs: null, uploadLatencyMs: null }))).toBeNull();
  });

  it('uses the worst reading under load', () => {
    expect(loadedLatency(result({ downloadLatencyMs: null, uploadLatencyMs: 30 }))).toMatchObject({
      busyMs: 30,
      addedMs: 12,
      grade: 'great',
    });
    expect(loadedLatency(result({ downloadLatencyMs: 90 }))).toMatchObject({
      busyMs: 90,
      addedMs: 72,
      grade: 'ok',
    });
    const bloated = loadedLatency(result({ downloadLatencyMs: 240 }));
    expect(bloated).toMatchObject({ busyMs: 240, addedMs: 222, grade: 'poor' });
    expect(bloated?.summary).toContain('Smart Queue Management');
  });

  it('never reports negative added latency', () => {
    expect(loadedLatency(result({ latencyMs: 50, downloadLatencyMs: 40 }))?.addedMs).toBe(0);
  });
});
