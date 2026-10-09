/** Usage: node scripts/check-dashes.ts [files...] (default: every tracked file) */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findDashes, isChecked } from './lib/dashes.ts';

const args = process.argv.slice(2);
const files = (
  args.length > 0 ? args : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
).filter(isChecked);

let count = 0;
for (const file of files) {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted or not a regular file
  }
  if (content.includes('\0')) continue; // binary
  for (const finding of findDashes(file, content)) {
    console.error(`${file}:${finding.line}:${finding.column}  ${finding.text}`);
    count++;
  }
}

if (count > 0) {
  console.error(
    `\n${count} dash(es) used as punctuation. Use a period, comma, colon or parentheses instead.`,
  );
  process.exit(1);
}
