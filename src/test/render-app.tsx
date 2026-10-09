import { createMemoryHistory } from '@tanstack/react-router';
import { render } from 'vitest-browser-react';
import { App } from '@/app/App';
import { createAppRouter } from '@/app/router';
import type { ToolDefinition } from '@/core/tools/define-tool';
import { createRegistry } from '@/core/tools/registry';
import { TEST_TOOLS } from './fixtures';

/** Renders the whole app at `path` with an in-memory router and the given tools. */
export async function renderApp(path = '/', tools: ToolDefinition[] = TEST_TOOLS) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  const screen = await render(<App router={router} registry={createRegistry(tools)} />);
  return { screen, router };
}
