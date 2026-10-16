import { useEffect, useState } from 'react';
import type { SystemUsage } from '@/bindings';
import { commands, isTauri } from '@/core/ipc';

export interface UsageSample {
  /** 0 to 100. */
  cpu: number;
  /** 0 to 100. */
  memory: number;
}

/** Memory in use, 0 to 100. */
export function memoryPercent(usage: SystemUsage): number {
  const total = usage.memoryTotalBytes ?? 0;
  return total > 0 ? ((usage.memoryUsedBytes ?? 0) / total) * 100 : 0;
}

export function toSample(usage: SystemUsage): UsageSample {
  return { cpu: usage.cpuPercent ?? 0, memory: memoryPercent(usage) };
}

/**
 * Polls live CPU and memory load every `intervalMs` while the page is open and the window
 * is visible, keeping the last `historyLength` samples for the trend lines.
 */
export function useSystemUsage(intervalMs: number, historyLength: number) {
  const [usage, setUsage] = useState<SystemUsage>();
  const [history, setHistory] = useState<UsageSample[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const next = await commands.systemUsage();
        if (!active) return;
        setUsage(next);
        setError(undefined);
        setHistory((previous) => [...previous, toSample(next)].slice(-historyLength));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs, historyLength]);

  return { usage, history, error };
}
