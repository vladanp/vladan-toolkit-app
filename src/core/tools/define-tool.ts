import type { ComponentType, LazyExoticComponent } from 'react';

export type ToolIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

export interface ToolCommandContext {
  /** Navigates to this tool's page. */
  openTool: () => Promise<void>;
}

/** An extra action a tool contributes to the ⌘K command palette. */
export interface ToolCommand {
  /** Unique within the tool. The palette id becomes `<toolId>:<commandId>`. */
  id: string;
  title: string;
  keywords?: string[];
  run: (context: ToolCommandContext) => void | Promise<void>;
}

/**
 * Everything the shell needs to know about a tool. Each folder in `src/tools/` exports
 * one of these (via `defineTool`) as the default export of its `index.ts`.
 */
export interface ToolDefinition {
  /** kebab-case, unique, used in the URL (`/tools/<id>`). Never change it once shipped. */
  id: string;
  name: string;
  /** One line, shown on the home screen and in the palette. */
  description: string;
  icon: ToolIcon;
  /** Extra search terms for the command palette. */
  keywords?: string[];
  /** Sidebar position; lower comes first. Ties are sorted by name. Defaults to 100. */
  order?: number;
  /** The tool's UI. Use `lazy(() => import('./MyTool'))` so it's only loaded when opened. */
  component: LazyExoticComponent<ComponentType> | ComponentType;
  /**
   * `contained` (default) centers the tool in a readable column with padding.
   * `full` hands the tool the whole content area (editors, split views, canvases).
   */
  layout?: 'contained' | 'full';
  commands?: ToolCommand[];
}

export const TOOL_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export class ToolDefinitionError extends Error {
  override name = 'ToolDefinitionError';
}

/** Validates and freezes a tool definition. Throws early so mistakes surface at startup. */
export function defineTool(tool: ToolDefinition): Readonly<ToolDefinition> {
  if (!TOOL_ID_PATTERN.test(tool.id)) {
    throw new ToolDefinitionError(
      `Tool id "${tool.id}" must be kebab-case (e.g. "json-formatter").`,
    );
  }
  if (!tool.name.trim()) {
    throw new ToolDefinitionError(`Tool "${tool.id}" needs a name.`);
  }
  if (!tool.description.trim()) {
    throw new ToolDefinitionError(`Tool "${tool.id}" needs a description.`);
  }
  const commandIds = new Set<string>();
  for (const command of tool.commands ?? []) {
    if (commandIds.has(command.id)) {
      throw new ToolDefinitionError(`Tool "${tool.id}" has duplicate command id "${command.id}".`);
    }
    commandIds.add(command.id);
  }
  return Object.freeze({ ...tool });
}
