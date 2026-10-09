import { createContext, useContext } from 'react';
import { registry, type ToolRegistry } from '@/core/tools/registry';

/** Lets tests (and future features like per-user tool visibility) swap the tool set. */
export const RegistryContext = createContext<ToolRegistry>(registry);

export function useRegistry(): ToolRegistry {
  return useContext(RegistryContext);
}
