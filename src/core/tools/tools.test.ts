import { Hammer } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  defineTool,
  TOOL_ID_PATTERN,
  type ToolDefinition,
  ToolDefinitionError,
} from './define-tool';
import { collectTools, createRegistry, registry } from './registry';

const base: ToolDefinition = {
  id: 'json-formatter',
  name: 'JSON Formatter',
  description: 'Pretty-prints JSON.',
  icon: Hammer,
  component: () => null,
};

describe('defineTool', () => {
  it('returns a frozen copy of a valid definition', () => {
    const tool = defineTool(base);
    expect(tool).toEqual(base);
    expect(tool).not.toBe(base);
    expect(Object.isFrozen(tool)).toBe(true);
  });

  it.each(['JSON', 'json_formatter', '-json', 'json-', '1json', ''])('rejects id "%s"', (id) => {
    expect(() => defineTool({ ...base, id })).toThrow(ToolDefinitionError);
  });

  it.each(['a', 'json', 'json-formatter', 'base64-v2'])('accepts id "%s"', (id) => {
    expect(TOOL_ID_PATTERN.test(id)).toBe(true);
  });

  it('requires a name and description', () => {
    expect(() => defineTool({ ...base, name: ' ' })).toThrow(/needs a name/);
    expect(() => defineTool({ ...base, description: '' })).toThrow(/needs a description/);
  });

  it('rejects duplicate command ids', () => {
    const run = () => {};
    expect(() =>
      defineTool({
        ...base,
        commands: [
          { id: 'go', title: 'Go', run },
          { id: 'go', title: 'Go again', run },
        ],
      }),
    ).toThrow(/duplicate command id "go"/);
  });
});

describe('createRegistry', () => {
  const tool = (id: string, name: string, order?: number): ToolDefinition => ({
    ...base,
    id,
    name,
    order,
  });

  it('sorts by order, then name', () => {
    const r = createRegistry([tool('c', 'Charlie'), tool('b', 'Bravo', 5), tool('a', 'Alpha')]);
    expect(r.tools.map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('looks tools up by id', () => {
    const r = createRegistry([tool('a', 'Alpha')]);
    expect(r.get('a')?.name).toBe('Alpha');
    expect(r.get('missing')).toBeUndefined();
  });

  it('rejects duplicate ids', () => {
    expect(() => createRegistry([tool('a', 'One'), tool('a', 'Two')])).toThrow(
      /Duplicate tool id "a"/,
    );
  });
});

describe('collectTools', () => {
  it('returns default exports', () => {
    expect(collectTools({ './x/index.ts': { default: base } })).toEqual([base]);
  });

  it('fails loudly when a module has no default export', () => {
    expect(() => collectTools({ './broken/index.ts': {} })).toThrow(/broken\/index.ts must/);
  });
});

describe('the app registry', () => {
  it('discovers every folder in src/tools', () => {
    expect(registry.get('system-info')?.name).toBe('System Info');
  });
});
