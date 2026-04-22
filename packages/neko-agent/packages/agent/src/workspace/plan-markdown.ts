/**
 * ExecutionPlan markdown serialiser (ADR §4.2, §7.5).
 *
 * Canonical layout:
 *
 *   ---
 *   id: cut-tiktok-001-plan
 *   kind: execution-plan
 *   proposalId: cut-tiktok-001
 *   title: <title>
 *   status: ready
 *   createdAt: <ISO 8601>
 *   updatedAt: <ISO 8601>
 *   ---
 *
 *   # <title>
 *
 *   > Compiled from proposal `<proposalId>`.
 *
 *   ## Steps
 *
 *   ### 1. [pending] <tool>
 *   <rationale>
 *
 *   ```yaml
 *   <args>
 *   ```
 *
 *   ### 2. [completed] <tool>
 *   ...
 *
 *   ## Notes   (optional)
 *   <notes>
 */

import type { ExecutionPlan, ExecutionPlanStep, ExecutionPlanStepStatus } from '@neko-agent/types';

const STEP_STATUS_LABEL: Record<ExecutionPlanStepStatus, string> = {
  pending: 'pending',
  in_progress: 'in progress',
  completed: 'completed',
  failed: 'failed',
};

export function serializeExecutionPlan(plan: ExecutionPlan): string {
  const frontmatter = [
    '---',
    `id: ${plan.id}`,
    'kind: execution-plan',
    `proposalId: ${plan.proposalId}`,
    `title: ${escapeYamlScalar(plan.title)}`,
    `status: ${plan.status}`,
    `createdAt: ${new Date(plan.createdAt).toISOString()}`,
    `updatedAt: ${new Date(plan.updatedAt).toISOString()}`,
    '---',
    '',
  ];

  const body: string[] = [];
  body.push(`# ${escapeInline(plan.title)}`, '');
  body.push(`> Compiled from proposal \`${plan.proposalId}\`.`, '');
  body.push('## Steps', '');

  if (plan.steps.length === 0) {
    body.push('_No steps._', '');
  } else {
    plan.steps.forEach((step, idx) => {
      body.push(...renderStep(step, idx + 1));
    });
  }

  if (plan.notes && plan.notes.trim().length > 0) {
    body.push('## Notes', '', plan.notes.trimEnd(), '');
  }

  return `${frontmatter.join('\n')}\n${body.join('\n')}`;
}

function renderStep(step: ExecutionPlanStep, ordinal: number): string[] {
  const status = step.status ?? 'pending';
  const lines: string[] = [];
  lines.push(`### ${ordinal}. [${STEP_STATUS_LABEL[status]}] ${escapeInline(step.tool)}`, '');
  if (step.rationale && step.rationale.trim().length > 0) {
    lines.push(step.rationale.trim(), '');
  }
  // Args go in a fenced block so the markdown stays readable even
  // when the blob has curly braces / colons. YAML-or-JSON ambiguous
  // hint — the AI picks whichever suits the tool.
  lines.push('```yaml', step.args.replace(/\r?\n$/, ''), '```', '');
  if (status === 'failed' && step.error) {
    lines.push(`_error: ${escapeInline(step.error)}_`, '');
  }
  return lines;
}

// =============================================================================
// Escaping
// =============================================================================

function escapeYamlScalar(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ');
  if (clean.length === 0) return '""';
  const trimmed = clean.trim();
  if (trimmed.length === 0) return '""';
  const leadingHazard = /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(trimmed);
  const pairHazard = /: /.test(trimmed);
  const quoteHazard = /["'`]/.test(trimmed);
  const edgeHazard = clean !== trimmed;
  if (leadingHazard || pairHazard || quoteHazard || edgeHazard) {
    return `"${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return trimmed;
}

function escapeInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
