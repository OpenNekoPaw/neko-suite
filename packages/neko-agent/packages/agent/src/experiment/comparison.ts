/**
 * Comparison Table — Build and format experiment comparison data
 *
 * Responsibility: Transform VariantResult[] into ComparisonEntry[]
 * and optionally render as markdown table.
 */

import type { ComparisonEntry, VariantResult } from './types';

/**
 * Build comparison entries from variant results.
 */
export function buildComparison(variants: VariantResult[]): ComparisonEntry[] {
  return variants.map((v) => {
    const avg = v.averageMetrics;
    const totalRuns = v.runs.length;
    const successRuns = v.runs.filter((r) => r.success).length;
    const toolSuccessRate =
      avg.toolSummary.totalCalls > 0
        ? avg.toolSummary.successCount / avg.toolSummary.totalCalls
        : 1;

    return {
      variantName: v.variant.name,
      avgTotalTokens: avg.totalTokens.totalTokens,
      avgLatencyMs: avg.totalLatencyMs,
      avgIterations: avg.iterations,
      avgToolCalls: avg.toolSummary.totalCalls,
      toolSuccessRate: Math.round(toolSuccessRate * 1000) / 10,
      successRate: totalRuns > 0 ? Math.round((successRuns / totalRuns) * 1000) / 10 : 0,
    };
  });
}

/**
 * Format comparison entries as a markdown table.
 */
export function formatComparisonMarkdown(entries: ComparisonEntry[]): string {
  const header =
    '| Variant | Avg Tokens | Avg Latency | Iterations | Tool Calls | Tool Success | Run Success |';
  const separator =
    '|---------|------------|-------------|------------|------------|--------------|-------------|';

  const rows = entries.map(
    (e) =>
      `| ${e.variantName} | ${formatNumber(e.avgTotalTokens)} | ${formatMs(e.avgLatencyMs)} | ${e.avgIterations} | ${e.avgToolCalls} | ${e.toolSuccessRate}% | ${e.successRate}% |`,
  );

  return [header, separator, ...rows].join('\n');
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
