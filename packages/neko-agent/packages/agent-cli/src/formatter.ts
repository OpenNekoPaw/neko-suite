/**
 * Output Formatter
 *
 * Formats agent output for different output modes.
 */

import type { CLIResult } from './types';

/**
 * Format result as plain text
 */
export function formatText(result: CLIResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  let output = result.output ?? '';

  if (result.agentResult?.steps && result.agentResult.steps.length > 0) {
    output += '\n\n--- Execution Steps ---\n';
    for (const step of result.agentResult.steps) {
      output += `\n[${step.type}] ${step.content ?? ''}\n`;
    }
  }

  output += `\n\n(Completed in ${result.duration}ms)`;

  return output;
}

/**
 * Format result as JSON
 */
export function formatJson(result: CLIResult): string {
  return JSON.stringify(
    {
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.duration,
      steps: result.agentResult?.steps,
      tokens: result.agentResult?.totalTokens,
    },
    null,
    2
  );
}

/**
 * Format result as Markdown
 */
export function formatMarkdown(result: CLIResult): string {
  if (!result.success) {
    return `## Error\n\n\`\`\`\n${result.error}\n\`\`\``;
  }

  let output = `## Result\n\n${result.output ?? ''}\n`;

  if (result.agentResult?.steps && result.agentResult.steps.length > 0) {
    output += '\n## Execution Steps\n\n';
    for (const step of result.agentResult.steps) {
      output += `### ${step.type}\n\n`;
      if (step.content) {
        output += `${step.content}\n\n`;
      }
    }
  }

  output += `\n---\n*Completed in ${result.duration}ms*`;

  return output;
}

/**
 * Format result based on output format
 */
export function formatResult(
  result: CLIResult,
  format: 'text' | 'json' | 'markdown'
): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'markdown':
      return formatMarkdown(result);
    case 'text':
    default:
      return formatText(result);
  }
}
