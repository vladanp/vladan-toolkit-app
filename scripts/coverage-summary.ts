/** Usage: node scripts/coverage-summary.ts coverage/coverage-summary.json >> "$GITHUB_STEP_SUMMARY" */
import { readFileSync } from 'node:fs';
import { coverageMarkdown } from './lib/coverage-summary.ts';

const file = process.argv[2] ?? 'coverage/coverage-summary.json';
try {
  console.info(coverageMarkdown(JSON.parse(readFileSync(file, 'utf8'))));
} catch (error) {
  console.info(`### Frontend coverage\n\nNo coverage report found (${String(error)}).`);
}
