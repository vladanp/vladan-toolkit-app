import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface UsageState {
  /** Tool id → epoch ms of the last time it was opened. */
  lastUsed: Record<string, number>;
  markUsed: (toolId: string, at?: number) => void;
  clear: () => void;
}

export const useUsage = create<UsageState>()(
  persist(
    (set) => ({
      lastUsed: {},
      markUsed: (toolId, at = Date.now()) =>
        set((state) => ({ lastUsed: { ...state.lastUsed, [toolId]: at } })),
      clear: () => set({ lastUsed: {} }),
    }),
    {
      name: 'vt:usage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ lastUsed }) => ({ lastUsed }),
    },
  ),
);
