import { Channel } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ConnectionInfo, Phase, SpeedTestEvent } from '@/bindings';
import { commands, isTauri } from '@/core/ipc';
import { type SavedResult, toSaved } from './results';

/** The error a test ends with when the user stops it (see `speed_test.rs`). */
export const CANCELLED = 'Cancelled';

/** How many past results the history keeps. */
export const HISTORY_LIMIT = 30;

export interface Live {
  phase: Phase;
  /** How far the current phase is, 0 to 1. */
  progress: number;
  latencyMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  /** Live readings of the current transfer, for the trend line. */
  trace: number[];
}

export type Status = 'idle' | 'running' | 'error';

export interface SpeedTestState {
  status: Status;
  live: Live | null;
  connection: ConnectionInfo | null;
  error: string | null;
  /** Newest first. */
  history: SavedResult[];
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  clearHistory: () => void;
}

const freshLive = (): Live => ({
  phase: 'latency',
  progress: 0,
  latencyMs: null,
  downloadMbps: null,
  uploadMbps: null,
  trace: [],
});

/** The new live state after one event from Rust. */
export function applyEvent(live: Live, event: SpeedTestEvent): Live {
  switch (event.type) {
    case 'connection':
      return live;
    case 'phase':
      return { ...live, phase: event.phase, progress: 0, trace: [] };
    case 'progress': {
      const value = event.value ?? 0;
      const next = { ...live, phase: event.phase, progress: event.fraction ?? 0 };
      if (event.phase === 'latency') return { ...next, latencyMs: value };
      const trace = [...live.trace, value];
      return event.phase === 'download'
        ? { ...next, downloadMbps: value, trace }
        : { ...next, uploadMbps: value, trace };
    }
  }
}

/** Share of the whole test each phase takes, for one overall progress bar. */
const PHASE_SPAN: Record<Phase, [start: number, size: number]> = {
  latency: [0, 0.1],
  download: [0.1, 0.45],
  upload: [0.55, 0.45],
};

export function overallProgress(live: Live): number {
  const [start, size] = PHASE_SPAN[live.phase];
  return start + size * Math.min(Math.max(live.progress, 0), 1);
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export const useSpeedTest = create<SpeedTestState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      live: null,
      connection: null,
      error: null,
      history: [],
      start: async () => {
        if (get().status === 'running' || !isTauri()) return;
        set({ status: 'running', live: freshLive(), connection: null, error: null });
        const channel = new Channel<SpeedTestEvent>((event) => {
          if (event.type === 'connection') set({ connection: event.connection });
          set((state) => ({ live: state.live && applyEvent(state.live, event) }));
        });
        try {
          const result = toSaved(await commands.speedTestRun(channel), Date.now());
          set((state) => ({
            status: 'idle',
            live: null,
            history: [result, ...state.history].slice(0, HISTORY_LIMIT),
          }));
        } catch (cause) {
          const text = message(cause);
          set(
            text === CANCELLED
              ? { status: 'idle', live: null }
              : { status: 'error', live: null, error: text },
          );
        }
      },
      cancel: async () => {
        await commands.speedTestCancel();
      },
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'vt:speed-test',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ history }) => ({ history }),
    },
  ),
);
