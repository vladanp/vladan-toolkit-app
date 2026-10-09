import { describe, expect, it, vi } from 'vitest';
import { mockTauri } from '@/test/tauri';
import { openExternal } from './external';

describe('openExternal', () => {
  it('opens https links in a new browser tab outside Tauri', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await openExternal('https://example.com/a');
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
  });

  it('uses the opener plugin inside Tauri', async () => {
    const calls = mockTauri();
    await openExternal('mailto:hi@example.com');
    expect(calls).toContainEqual({
      cmd: 'plugin:opener|open_url',
      args: expect.objectContaining({ url: 'mailto:hi@example.com' }),
    });
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'http://insecure.example'])(
    'refuses %s',
    async (url) => {
      await expect(openExternal(url)).rejects.toThrow(/Refusing to open/);
    },
  );
});
