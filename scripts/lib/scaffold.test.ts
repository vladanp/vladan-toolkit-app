import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  frontendFiles,
  insertAboveMarker,
  insertModule,
  parseArgs,
  RUST_COMMAND_MARKER,
  RUST_MOD_MARKER,
  rustModule,
  scaffoldTool,
  toPascalCase,
  toSnakeCase,
  toTitle,
} from './scaffold';

describe('name helpers', () => {
  it('convert kebab-case ids', () => {
    expect(toPascalCase('json-formatter')).toBe('JsonFormatter');
    expect(toSnakeCase('json-formatter')).toBe('json_formatter');
    expect(toTitle('json-formatter')).toBe('Json Formatter');
  });
});

describe('parseArgs', () => {
  it('reads id, name and --rust', () => {
    expect(parseArgs(['color-picker', '--name', 'Color Picker', '--rust'])).toEqual({
      id: 'color-picker',
      name: 'Color Picker',
      rust: true,
    });
    expect(parseArgs(['uuid'])).toEqual({ id: 'uuid', name: 'Uuid', rust: false });
  });

  it('rejects bad input', () => {
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseArgs(['Bad_Id'])).toThrow(/kebab-case/);
    expect(() => parseArgs(['ok', '--name'])).toThrow(/--name needs a value/);
    expect(() => parseArgs(['ok', '--name', '--rust'])).toThrow(/--name needs a value/);
  });
});

describe('insertAboveMarker', () => {
  const source = 'a\n    // marker\nb';

  it('inserts with the marker indentation', () => {
    expect(insertAboveMarker(source, '// marker', 'x,')).toBe('a\n    x,\n    // marker\nb');
  });

  it('is idempotent and requires the marker', () => {
    const once = insertAboveMarker(source, '// marker', 'x,');
    expect(insertAboveMarker(once, '// marker', 'x,')).toBe(once);
    expect(() => insertAboveMarker('nothing', '// marker', 'x')).toThrow(/not found/);
  });
});

describe('insertModule', () => {
  it('keeps module declarations sorted like rustfmt', () => {
    const source = `//! docs\n\npub mod b;\npub mod d;\n${RUST_MOD_MARKER}\n`;
    expect(insertModule(source, RUST_MOD_MARKER, 'c')).toBe(
      `//! docs\n\npub mod b;\npub mod c;\npub mod d;\n${RUST_MOD_MARKER}\n`,
    );
    expect(insertModule(source, RUST_MOD_MARKER, 'a')).toContain('pub mod a;\npub mod b;');
    expect(insertModule(source, RUST_MOD_MARKER, 'b')).toBe(source);
    expect(() => insertModule('x', RUST_MOD_MARKER, 'a')).toThrow(/not found/);
  });
});

describe('templates', () => {
  it('generate a lazy tool, a component and a test', () => {
    const files = frontendFiles({ id: 'qr-code', name: "Vladan's QR", rust: false });
    expect(files.map((f) => f.path)).toEqual([
      'src/tools/qr-code/index.ts',
      'src/tools/qr-code/QrCode.tsx',
      'src/tools/qr-code/QrCode.test.tsx',
    ]);
    expect(files[0]?.content).toContain("id: 'qr-code'");
    expect(files[0]?.content).toContain("name: 'Vladan\\'s QR'");
    expect(files[1]?.content).not.toContain('commands.');
  });

  it('wire the Rust command into the component when --rust is used', () => {
    const [, component] = frontendFiles({ id: 'qr-code', name: 'QR', rust: true });
    expect(component?.content).toContain('commands.qrCodeHello');
    const rust = rustModule({ id: 'qr-code', name: 'QR', rust: true });
    expect(rust.path).toBe('src-tauri/src/tools/qr_code.rs');
    expect(rust.content).toContain('pub fn qr_code_hello(name: String) -> String');
  });
});

describe('scaffoldTool', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vt-scaffold-'));
    mkdirSync(join(root, 'src-tauri/src/tools'), { recursive: true });
    writeFileSync(join(root, 'src-tauri/src/tools/mod.rs'), `pub mod z;\n${RUST_MOD_MARKER}\n`);
    writeFileSync(
      join(root, 'src-tauri/src/lib.rs'),
      `collect_commands![\n    tools::a::a,\n    ${RUST_COMMAND_MARKER}\n]`,
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes frontend-only tools', () => {
    const written = scaffoldTool({ id: 'notes', name: 'Notes', rust: false }, root);
    expect(written).toHaveLength(3);
    expect(readFileSync(join(root, 'src/tools/notes/Notes.tsx'), 'utf8')).toContain(
      'function Notes',
    );
    expect(readFileSync(join(root, 'src-tauri/src/tools/mod.rs'), 'utf8')).not.toContain('notes');
  });

  it('registers Rust modules and commands', () => {
    scaffoldTool({ id: 'disk-usage', name: 'Disk Usage', rust: true }, root);
    expect(readFileSync(join(root, 'src-tauri/src/tools/mod.rs'), 'utf8')).toBe(
      `pub mod disk_usage;\npub mod z;\n${RUST_MOD_MARKER}\n`,
    );
    expect(readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8')).toContain(
      `    tools::disk_usage::disk_usage_hello,\n    ${RUST_COMMAND_MARKER}`,
    );
    expect(readFileSync(join(root, 'src-tauri/src/tools/disk_usage.rs'), 'utf8')).toContain(
      'disk_usage_hello',
    );
  });

  it('refuses to overwrite an existing tool', () => {
    scaffoldTool({ id: 'notes', name: 'Notes', rust: false }, root);
    expect(() => scaffoldTool({ id: 'notes', name: 'Notes', rust: false }, root)).toThrow(
      /already exists/,
    );
  });
});
