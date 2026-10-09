import { RouterProvider } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { registry as defaultRegistry, type ToolRegistry } from '@/core/tools/registry';
import { RegistryContext } from './registry-context';
import type { createAppRouter } from './router';

export interface AppProps {
  router: ReturnType<typeof createAppRouter>;
  registry?: ToolRegistry;
}

export function App({ router, registry = defaultRegistry }: AppProps) {
  return (
    <RegistryContext value={registry}>
      <TooltipProvider delay={400}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </RegistryContext>
  );
}
