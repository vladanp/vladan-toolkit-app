import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const binary = join(
  root,
  'src-tauri/target/debug',
  process.platform === 'win32' ? 'vladan-toolkit.exe' : 'vladan-toolkit',
);

// `tauri:options` is read by @wdio/tauri-service, which doesn't extend WebdriverIO's
// capability types, so the object is declared separately rather than inline.
const tauriCapabilities = { browserName: 'tauri', 'tauri:options': { application: binary } };

/**
 * Drives the real compiled app (Rust + system webview) on macOS, Windows and Linux.
 * Build it first with `pnpm e2e:native:build`; that enables the `e2e` cargo feature, which
 * embeds a WebDriver server. Release builds never contain it.
 */
export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [process.env.SPEC ?? './specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [tauriCapabilities],
  services: [['@wdio/tauri-service', { driverProvider: 'embedded', captureBackendLogs: true }]],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 60_000 },
  logLevel: 'warn',
  outputDir: join(root, 'e2e/native/logs'),
  waitforTimeout: 15_000,
};
