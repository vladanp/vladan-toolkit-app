import { describe, expect, it } from 'vitest';
import { EM_DASH as EM, EN_DASH as EN, findDashes, isChecked } from './dashes';

describe('findDashes', () => {
  it('flags em and en dashes anywhere, with their position', () => {
    expect(findDashes('src/a.ts', `const label = 'a ${EM} b';\nok\nrange 1${EN}9`)).toEqual([
      { line: 1, column: 18, text: `const label = 'a ${EM} b';` },
      { line: 3, column: 8, text: `range 1${EN}9` },
    ]);
  });

  it('flags spaced hyphens in Markdown prose', () => {
    const doc = ['Fast - simple', 'Fast -- simple', 'One thing) - another'].join('\n');
    expect(findDashes('README.md', doc).map((f) => f.line)).toEqual([1, 2, 3]);
  });

  it('allows list markers, tables, hyphenated words, flags and code in Markdown', () => {
    const doc = [
      '- a list item',
      '  - a nested item',
      '| --- | --- |',
      'A dark-first, cross-platform app.',
      'Skip with --no-verify, or run `cargo fmt -- file` and `a - b`.',
      '<!-- comment -->',
      '```sh',
      'echo a - b',
      '```',
    ].join('\n');
    expect(findDashes('docs/x.md', doc)).toEqual([]);
  });

  it('checks comments in code but not the code itself', () => {
    const code = [
      'const diff = timestamp - now;',
      '// Fast - simple',
      '  # yaml comment - here',
      ' * JSDoc line - here',
      '// subtract `len - 1` here',
    ].join('\n');
    expect(findDashes('src/a.ts', code).map((f) => f.line)).toEqual([2, 3, 4]);
  });

  it('handles Windows line endings', () => {
    expect(findDashes('a.md', 'ok\r\nnot - ok\r\n')).toEqual([
      { line: 2, column: 4, text: 'not - ok' },
    ]);
  });
});

describe('isChecked', () => {
  it.each([
    ['README.md', true],
    ['src/app/App.tsx', true],
    ['', false],
    ['pnpm-lock.yaml', false],
    ['src-tauri/Cargo.lock', false],
    ['CHANGELOG.md', false],
    ['src/bindings.ts', false],
    ['src-tauri/gen/schemas/desktop-schema.json', false],
    ['src-tauri/icons/icon.png', false],
  ])('%s → %s', (path, expected) => {
    expect(isChecked(path)).toBe(expected);
  });
});
