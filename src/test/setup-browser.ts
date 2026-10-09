// Real styles, so visibility and layout assertions mean what they say.
import '@/styles/globals.css';
import { clearMocks } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from 'vitest-browser-react';
import { resetStores } from './reset';
import { unmockTauri } from './tauri';

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

afterEach(async () => {
  // Unmount first: components unregister Tauri listeners on unmount, which needs the mocks.
  await cleanup();
  clearMocks();
  unmockTauri();
});
