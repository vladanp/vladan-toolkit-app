/**
 * Scaffolds a new tool: `pnpm new:tool <tool-id> [--name "Display Name"] [--rust]`.
 * See CLAUDE.md → "Adding a tool".
 */
import { fileURLToPath } from 'node:url';
import { parseArgs, scaffoldTool } from './lib/scaffold.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

try {
  const spec = parseArgs(process.argv.slice(2));
  const files = scaffoldTool(spec, root);
  console.info(`Created "${spec.name}" (${spec.id}):\n${files.map((f) => `  ${f}`).join('\n')}`);
  console.info(
    spec.rust
      ? '\nNext: `pnpm bindings` to regenerate src/bindings.ts, then `pnpm dev`.'
      : '\nNext: `pnpm dev` and open it from the sidebar or ⌘K.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
