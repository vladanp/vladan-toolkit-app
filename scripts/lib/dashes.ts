/**
 * House writing style: no em dashes, en dashes or spaced hyphens as punctuation in docs,
 * comments or UI text. Use a period, comma, colon or parentheses instead. Hyphenated
 * words ("dark-first") and Markdown list markers are fine.
 */

export interface DashFinding {
  line: number;
  column: number;
  text: string;
}

// Built from code points so the source itself stays free of the characters it bans.
export const EM_DASH = String.fromCharCode(0x2014);
export const EN_DASH = String.fromCharCode(0x2013);
const DASH_CHARS = new RegExp(`[${EN_DASH}${EM_DASH}]`, 'g');
/** One or two hyphens standing alone between two words, used as a dash. */
const SPACED_HYPHEN = /(?<=[^\s-]) -{1,2} (?=[^\s-])/g;
/** Lines that are (part of) a comment in TS, Rust, CSS, YAML, TOML or shell. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#)/;
const INLINE_CODE = /`[^`\n]*`/g;
const FENCE = /^\s*(?:```|~~~)/;

/** Lockfiles, generated files and binaries are not ours to style. */
const IGNORED = [
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Cargo\.lock$/,
  /^CHANGELOG\.md$/,
  /^src\/bindings\.ts$/,
  /^src-tauri\/gen\//,
  /\.(?:png|ico|icns|jpe?g|gif|webp|woff2?|ttf|otf)$/i,
];

export function isChecked(path: string): boolean {
  return path !== '' && !IGNORED.some((pattern) => pattern.test(path));
}

export function findDashes(path: string, content: string): DashFinding[] {
  const markdown = /\.mdx?$/i.test(path);
  const findings: DashFinding[] = [];
  let inFence = false;

  content.split(/\r?\n/).forEach((line, index) => {
    const report = (column: number) =>
      findings.push({ line: index + 1, column: column + 1, text: line.trim() });

    for (const match of line.matchAll(DASH_CHARS)) report(match.index);

    if (markdown && FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    const prose = markdown ? !inFence : COMMENT_LINE.test(line);
    if (!prose) return;
    // Hyphens inside `code` are flags or arithmetic, not punctuation.
    const visible = line.replace(INLINE_CODE, (code) => ' '.repeat(code.length));
    for (const match of visible.matchAll(SPACED_HYPHEN)) report(match.index);
  });

  return findings;
}
