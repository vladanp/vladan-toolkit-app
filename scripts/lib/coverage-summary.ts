export interface CoverageTotals {
  total: Record<'lines' | 'statements' | 'functions' | 'branches', { pct: number }>;
}

/** Renders Istanbul's json-summary totals as a Markdown table for the CI job summary. */
export function coverageMarkdown(summary: CoverageTotals): string {
  const rows = (['lines', 'statements', 'functions', 'branches'] as const).map(
    (metric) => `| ${metric} | ${summary.total[metric].pct.toFixed(2)}% |`,
  );
  return ['### Frontend coverage', '', '| Metric | Covered |', '| --- | ---: |', ...rows, ''].join(
    '\n',
  );
}
