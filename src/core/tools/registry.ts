import { type ToolDefinition, ToolDefinitionError } from './define-tool';

export interface ToolRegistry {
  /** All tools, sorted for display. */
  readonly tools: readonly ToolDefinition[];
  get: (id: string) => ToolDefinition | undefined;
}

const DEFAULT_ORDER = 100;

export function createRegistry(definitions: Iterable<ToolDefinition>): ToolRegistry {
  const byId = new Map<string, ToolDefinition>();
  for (const tool of definitions) {
    if (byId.has(tool.id)) {
      throw new ToolDefinitionError(`Duplicate tool id "${tool.id}".`);
    }
    byId.set(tool.id, tool);
  }
  const tools = [...byId.values()].sort(
    (a, b) =>
      (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER) || a.name.localeCompare(b.name),
  );
  return {
    tools,
    get: (id) => byId.get(id),
  };
}

type ToolModule = { default?: ToolDefinition };

/** Picks the default export from each globbed module, failing loudly if one is missing. */
export function collectTools(modules: Record<string, ToolModule>): ToolDefinition[] {
  return Object.entries(modules).map(([path, module]) => {
    if (!module.default) {
      throw new ToolDefinitionError(`${path} must \`export default defineTool({...})\`.`);
    }
    return module.default;
  });
}

/**
 * Every `src/tools/<name>/index.ts(x)` is discovered at build time. Adding a tool is just
 * adding a folder; nothing else in the shell needs to change.
 */
export const registry: ToolRegistry = createRegistry(
  collectTools(import.meta.glob<ToolModule>('../../tools/*/index.{ts,tsx}', { eager: true })),
);
