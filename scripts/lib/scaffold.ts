import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Same rule as `TOOL_ID_PATTERN` in src/core/tools/define-tool.ts. */
const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Marker lines in Rust sources that the generator inserts above. Keep them in place. */
export const RUST_MOD_MARKER = '// new-tool:modules';
export const RUST_COMMAND_MARKER = '// new-tool:commands';

export interface ToolSpec {
  id: string;
  name: string;
  rust: boolean;
}

export interface FileChange {
  path: string;
  content: string;
}

export function toPascalCase(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function toSnakeCase(id: string): string {
  return id.replaceAll('-', '_');
}

export function toTitle(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function parseArgs(argv: readonly string[]): ToolSpec {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const id = positional[0];
  if (!id) throw new Error('Usage: pnpm new:tool <tool-id> [--name "Display Name"] [--rust]');
  if (!ID_PATTERN.test(id)) {
    throw new Error(`Tool id "${id}" must be kebab-case, e.g. "json-formatter".`);
  }
  const nameIndex = argv.indexOf('--name');
  const name = nameIndex >= 0 ? argv[nameIndex + 1] : undefined;
  if (nameIndex >= 0 && (!name || name.startsWith('--'))) {
    throw new Error('--name needs a value, e.g. --name "JSON Formatter".');
  }
  return { id, name: name ?? toTitle(id), rust: argv.includes('--rust') };
}

/** Inserts `line` right above `marker`, matching the marker's indentation. */
export function insertAboveMarker(source: string, marker: string, line: string): string {
  const lines = source.split('\n');
  const index = lines.findIndex((l) => l.trim() === marker);
  if (index < 0) throw new Error(`Marker "${marker}" not found.`);
  const indent = lines[index]?.match(/^\s*/)?.[0] ?? '';
  if (lines.some((l) => l.trim() === line.trim())) return source;
  lines.splice(index, 0, `${indent}${line.trim()}`);
  return lines.join('\n');
}

export function frontendFiles(spec: ToolSpec): FileChange[] {
  const component = toPascalCase(spec.id);
  const dir = `src/tools/${spec.id}`;
  const rustCall = spec.rust
    ? `
  const [greeting, setGreeting] = useState<string>();
  useEffect(() => {
    if (isTauri()) commands.${toCamelCase(spec.id)}Hello('Vladan').then(setGreeting, console.error);
  }, []);
`
    : '';
  const rustImports = spec.rust
    ? `import { useEffect, useState } from 'react';\nimport { commands, isTauri } from '@/core/ipc';\n`
    : '';
  const rustMarkup = spec.rust
    ? `\n      {greeting && <p className="text-fg-muted">{greeting}</p>}`
    : '';

  return [
    {
      path: `${dir}/index.ts`,
      content: `import { Wrench } from 'lucide-react';
import { lazy } from 'react';
import { defineTool } from '@/core/tools/define-tool';

export default defineTool({
  id: '${spec.id}',
  name: '${spec.name.replaceAll("'", "\\'")}',
  description: 'TODO: one line about what ${spec.name.replaceAll("'", "\\'")} does.',
  icon: Wrench,
  keywords: [],
  component: lazy(() => import('./${component}')),
});
`,
    },
    {
      path: `${dir}/${component}.tsx`,
      content: `${rustImports}export default function ${component}() {${rustCall}
  return (
    <div className="space-y-4">
      <p className="text-fg-muted">Build ${spec.name.replaceAll('<', '&lt;')} here.</p>${rustMarkup}
    </div>
  );
}
`,
    },
    {
      path: `${dir}/${component}.test.tsx`,
      content: `import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import ${component} from './${component}';
import tool from './index';

describe('${spec.name.replaceAll("'", "\\'")}', () => {
  it('is registered', () => {
    expect(tool.id).toBe('${spec.id}');
  });

  it('renders', async () => {
    const screen = await render(<${component} />);
    await expect.element(screen.getByText(/Build/)).toBeVisible();
  });
});
`,
    },
  ];
}

function toCamelCase(id: string): string {
  const pascal = toPascalCase(id);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function rustModule(spec: ToolSpec): FileChange {
  const fn = `${toSnakeCase(spec.id)}_hello`;
  return {
    path: `src-tauri/src/tools/${toSnakeCase(spec.id)}.rs`,
    content: `//! Backend for the "${spec.name}" tool (\`src/tools/${spec.id}\`).

/// Example command; replace with real work. Exposed to TypeScript as
/// \`commands.${toCamelCase(spec.id)}Hello\` after \`pnpm bindings\`.
#[tauri::command]
#[specta::specta]
pub fn ${fn}(name: String) -> String {
    format!("Hello, {name}! This is ${spec.name.replaceAll('"', '\\"')} talking from Rust.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greets() {
        assert!(${fn}("Vladan".into()).contains("Vladan"));
    }
}
`,
  };
}

/**
 * Adds a `pub mod x;` line to the block of module declarations right above `marker`,
 * keeping the block sorted the way rustfmt does.
 */
export function insertModule(source: string, marker: string, moduleName: string): string {
  const lines = source.split('\n');
  const markerIndex = lines.findIndex((l) => l.trim() === marker);
  if (markerIndex < 0) throw new Error(`Marker "${marker}" not found.`);
  let start = markerIndex;
  while (start > 0 && /^pub mod \w+;$/.test(lines[start - 1]?.trim() ?? '')) start--;
  const modules = new Set(lines.slice(start, markerIndex));
  modules.add(`pub mod ${moduleName};`);
  lines.splice(start, markerIndex - start, ...[...modules].sort());
  return lines.join('\n');
}

/** Writes the tool's files under `root`. Refuses to overwrite an existing tool. */
export function scaffoldTool(spec: ToolSpec, root: string): string[] {
  const toolDir = join(root, 'src/tools', spec.id);
  if (existsSync(toolDir)) throw new Error(`src/tools/${spec.id} already exists.`);

  const changes = frontendFiles(spec);
  if (spec.rust) {
    changes.push(rustModule(spec));
    const modPath = 'src-tauri/src/tools/mod.rs';
    const libPath = 'src-tauri/src/lib.rs';
    const snake = toSnakeCase(spec.id);
    changes.push(
      {
        path: modPath,
        content: insertModule(readFileSync(join(root, modPath), 'utf8'), RUST_MOD_MARKER, snake),
      },
      {
        path: libPath,
        content: insertAboveMarker(
          readFileSync(join(root, libPath), 'utf8'),
          RUST_COMMAND_MARKER,
          `tools::${snake}::${snake}_hello,`,
        ),
      },
    );
  }

  for (const change of changes) {
    const target = join(root, change.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, change.content);
  }
  return changes.map((c) => c.path);
}
