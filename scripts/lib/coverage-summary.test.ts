import { describe, expect, it } from 'vitest';
import { coverageMarkdown } from './coverage-summary';

describe('coverageMarkdown', () => {
  it('renders a table of totals', () => {
    const pct = (value: number) => ({ pct: value });
    const markdown = coverageMarkdown({
      total: { lines: pct(99.123), statements: pct(98), functions: pct(97.5), branches: pct(90) },
    });
    expect(markdown).toContain('| lines | 99.12% |');
    expect(markdown).toContain('| branches | 90.00% |');
    expect(markdown.startsWith('### Frontend coverage')).toBe(true);
  });
});
