import { Toaster } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { mockTauri } from '@/test/tauri';
import tool from './index';
import SystemInfo, { copySystemInfo } from './SystemInfo';

function stubClipboard() {
  return vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
}

describe('System Info tool', () => {
  it('is registered with a lazy component and a palette command', () => {
    expect(tool.id).toBe('system-info');
    expect(tool.commands?.map((c) => c.id)).toEqual(['copy']);
  });

  it('shows native details and copies them as Markdown', async () => {
    mockTauri();
    const writeText = stubClipboard();
    const screen = await render(
      <>
        <SystemInfo />
        <Toaster />
      </>,
    );
    await expect.element(screen.getByRole('region', { name: 'Hardware' })).toBeVisible();
    await expect.element(screen.getByText('Test CPU 9000')).toBeVisible();
    await screen.getByRole('button', { name: 'Copy as Markdown' }).click();
    expect(writeText.mock.calls[0]?.[0]).toContain('### Hardware');
    await expect.element(screen.getByText('System info copied as Markdown')).toBeVisible();
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
