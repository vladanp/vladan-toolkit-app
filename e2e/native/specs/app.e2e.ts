import { $, browser, expect } from '@wdio/globals';

const isMac = process.platform === 'darwin';
const mod = isMac ? 'Meta' : 'Control';

describe('Vladan Toolkit (native app)', () => {
  it('starts and renders the shell', async () => {
    await expect($('nav[aria-label="Main"]')).toBeDisplayed();
    await expect($('h2')).toHaveText(expect.stringContaining('Vladan'));
    expect(await browser.getTitle()).toBe('Vladan Toolkit');
  });

  it('uses the right window chrome for the platform', async () => {
    const controls = $('[data-testid="window-controls"]');
    if (isMac) {
      await expect(controls).not.toBeExisting();
      await expect($('[data-testid="titlebar-start"]')).toHaveElementClass('pl-[78px]');
    } else {
      await expect(controls).toBeDisplayed();
      await expect($('button[aria-label="Minimize"]')).toBeDisplayed();
    }
  });

  it('answers typed IPC commands from Rust', async () => {
    const info = await browser.tauri.execute(({ core }) => core.invoke('app_info'));
    expect(info).toMatchObject({
      name: 'Vladan Toolkit',
      os: expect.any(String),
      updaterEnabled: false,
    });
  });

  it('opens a Rust-backed tool and shows native data', async () => {
    await $('a*=System Info').click();
    await expect($('section[aria-label="Hardware"]')).toBeDisplayed();
    await expect($('section[aria-label="Operating system"]')).toBeDisplayed();
    await expect($('section[aria-label="Application"]')).toHaveText(
      expect.stringContaining('Tauri 2.'),
    );
  });

  it('navigates with the command palette', async () => {
    await browser.keys([mod, 'k']);
    const palette = $('[role="dialog"]');
    await expect(palette).toBeDisplayed();
    await browser.keys('settings');
    await browser.keys('Enter');
    await expect($('h1=Settings')).toBeDisplayed();
    await expect($('section[aria-label="About"]')).toHaveText(expect.stringContaining('Tauri'));
  });
});
