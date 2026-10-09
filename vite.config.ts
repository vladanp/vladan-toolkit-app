/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// `TAURI_DEV_HOST` is set by `tauri dev` when targeting a physical mobile device.
const host = process.env.TAURI_DEV_HOST;

// Coverage runs measure *source* branches. The compiler adds memo-cache branches that only
// run on re-render, which would show up as noise. Everything else (dev, build, `pnpm test`,
// E2E) runs the compiler, so shipped behavior is still what gets tested.
const reactCompiler = process.env.REACT_COMPILER !== 'off';

export default defineConfig({
  plugins: [
    react(),
    // React Compiler 1.0: automatic memoization, no manual useMemo/useCallback needed.
    ...(reactCompiler ? [babel({ presets: [reactCompilerPreset()] })] : []),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Tauri expects a fixed port and wants to see Rust errors in the terminal.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // Tailwind v4 baseline: Safari 16.4 (WKWebView / WebKitGTK) and Chromium 111 (WebView2).
    target: ['es2022', 'chrome111', 'safari16.4'],
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    // Assets load from local disk inside the app, so bundle size barely affects startup.
    chunkSizeWarningLimit: 800,
    minify: process.env.TAURI_ENV_DEBUG ? false : 'oxc',
  },
  test: {
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/bindings.ts',
        'scripts/new-tool.ts',
        'scripts/check-dashes.ts',
        'scripts/coverage-summary.ts',
        'scripts/updater-config.ts',
      ],
      reporter: ['text-summary', 'text', 'html', 'json-summary', 'lcov'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
    projects: [
      {
        // Pure logic, stores and hooks: fast, runs in jsdom.
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          setupFiles: ['./src/test/setup-unit.ts'],
        },
      },
      {
        // Components and full app flows: real Chromium, real layout, real focus and events.
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup-browser.ts'],
          browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,
            provider: playwright({
              // Lets environments with a pre-installed Chromium skip `playwright install`.
              launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
            }),
            instances: [{ browser: 'chromium' }],
            // A typical laptop window, so responsive (`sm:`/`md:`) content is visible.
            viewport: { width: 1280, height: 800 },
          },
        },
      },
    ],
  },
});
