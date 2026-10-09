import { isTauri } from '@tauri-apps/api/core';

const ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:']);

/** Opens a link in the user's default browser. Only https and mailto links are allowed. */
export async function openExternal(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Refusing to open ${parsed.protocol} URL`);
  }
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(parsed.href);
  } else {
    window.open(parsed.href, '_blank', 'noopener,noreferrer');
  }
}
