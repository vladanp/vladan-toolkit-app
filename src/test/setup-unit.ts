import '@testing-library/jest-dom/vitest';
import { clearMocks } from '@tauri-apps/api/mocks';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { resetStores } from './reset';
import { unmockTauri } from './tauri';

// jsdom has no matchMedia; behave like an OS in light mode with no listeners firing.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

afterEach(() => {
  cleanup();
  clearMocks();
  unmockTauri();
});
