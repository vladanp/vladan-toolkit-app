import type { Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; checkedAt: number }
  | { kind: 'available'; version: string; notes: string | undefined }
  | { kind: 'downloading'; downloaded: number; total: number | undefined }
  | { kind: 'installing' }
  | { kind: 'error'; message: string };

export interface UpdaterBackend {
  check: () => Promise<Update | null>;
  relaunch: () => Promise<void>;
}

/** Loaded lazily so the updater code stays out of the startup bundle. */
const tauriBackend: UpdaterBackend = {
  check: async () => (await import('@tauri-apps/plugin-updater')).check(),
  relaunch: async () => (await import('@tauri-apps/plugin-process')).relaunch(),
};

interface UpdaterState {
  status: UpdateStatus;
  update: Update | null;
  backend: UpdaterBackend;
  check: () => Promise<UpdateStatus>;
  install: () => Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useUpdater = create<UpdaterState>()((set, get) => ({
  status: { kind: 'idle' },
  update: null,
  backend: tauriBackend,

  check: async () => {
    const { status, backend } = get();
    if (
      status.kind === 'checking' ||
      status.kind === 'downloading' ||
      status.kind === 'installing'
    ) {
      return status;
    }
    set({ status: { kind: 'checking' } });
    try {
      const update = await backend.check();
      const next: UpdateStatus = update
        ? { kind: 'available', version: update.version, notes: update.body }
        : { kind: 'up-to-date', checkedAt: Date.now() };
      set({ status: next, update });
      return next;
    } catch (error) {
      const next: UpdateStatus = { kind: 'error', message: message(error) };
      set({ status: next, update: null });
      return next;
    }
  },

  install: async () => {
    const { update, backend } = get();
    if (!update) return;
    let downloaded = 0;
    let total: number | undefined;
    set({ status: { kind: 'downloading', downloaded, total } });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength;
        if (event.event === 'Progress') downloaded += event.data.chunkLength;
        if (event.event === 'Finished') {
          set({ status: { kind: 'installing' } });
          return;
        }
        set({ status: { kind: 'downloading', downloaded, total } });
      });
      await backend.relaunch();
    } catch (error) {
      set({ status: { kind: 'error', message: message(error) } });
    }
  },
}));
