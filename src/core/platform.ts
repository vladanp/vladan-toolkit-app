export type Platform = 'macos' | 'windows' | 'linux';

interface NavigatorLike {
  userAgent: string;
  userAgentData?: { platform?: string };
}

/**
 * Detects the host OS from the webview's navigator. This is synchronous, so the
 * very first render already knows whether to draw macOS traffic-light space
 * or Windows/Linux window controls.
 */
export function detectPlatform(nav: NavigatorLike = navigator): Platform {
  const hint = `${nav.userAgentData?.platform ?? ''} ${nav.userAgent}`.toLowerCase();
  if (/mac|iphone|ipad/.test(hint)) return 'macos';
  if (/win/.test(hint)) return 'windows';
  return 'linux';
}

export const platform: Platform = detectPlatform();
export const isMac = platform === 'macos';
