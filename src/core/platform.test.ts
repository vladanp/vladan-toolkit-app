import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform';

describe('detectPlatform', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15', 'macos'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/140.0', 'windows'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15', 'linux'],
  ] as const)('reads "%s" as %s', (userAgent, expected) => {
    expect(detectPlatform({ userAgent })).toBe(expected);
  });

  it('prefers userAgentData when available', () => {
    expect(detectPlatform({ userAgent: 'unknown', userAgentData: { platform: 'Windows' } })).toBe(
      'windows',
    );
  });

  it('uses the real navigator by default', () => {
    expect(['macos', 'windows', 'linux']).toContain(detectPlatform());
  });
});
