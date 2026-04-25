/**
 * ExecutionPlan markdown serialiser (ADR §4.2, §7.5).
 *
 * Canonical layout (file: `.neko/plans/plan-<runId>.md`):
 *
 *   ---
 *   id: cut-tiktok-001-plan
 *   kind: plan
 *   draftId: cut-tiktok-001
 *   title: <title>
 *   status: ready
 *   createdAt: <ISO 8601>
 *   updatedAt: <ISO 8601>
 *   ---
 *
 *   # <title>
 *
 *   > Compiled from draft `<draftId>`.
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
import {
  getFrontmatterString,
  parseMarkdownArtifact,
  parseRequiredTimestamp,
} from './artifact-markdown-parser';

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
    'kind: plan',
    `draftId: ${plan.draftId}`,
    `title: ${escapeYamlScalar(plan.title)}`,
    `status: ${plan.status}`,
    `createdAt: ${new Date(plan.createdAt).toISOString()}`,
    `updatedAt: ${new Date(plan.updatedAt).toISOString()}`,
    '---',
    '',
  ];

  const body: string[] = [];
  body.push(`# ${escapeInline(plan.title)}`, '');
  body.push(`> Compiled from draft \`${plan.draftId}\`.`, '');
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

export function parseExecutionPlan(markdown: string): ExecutionPlan {
  const parsed = parseMarkdownArtifact(markdown);
  const id = getFrontmatterString(parsed.frontmatter, 'id');
  const draftId = getFrontmatterString(parsed.frontmatter, 'draftId');
  const title = getFrontmatterString(parsed.frontmatter, 'title');
  const status = getFrontmatterString(parsed.frontmatter, 'status');

  if (!id || !draftId || !title || !status) {
    throw new Error('ExecutionPlan markdown is missing required frontmatter fields');
  }

  const notesMatch = /\n## Notes\r?\n([\s\S]*)$/.exec(parsed.body);
  const stepsBody = notesMatch ? parsed.body.slice(0, notesMatch.index) : parsed.body;
  const notes = notesMatch?.[1]?.trim();

  return {
    id,
    draftId,
    title,
    status: parsePlanStatus(status),
    createdAt: parseRequiredTimestamp(
      getFrontmatterString(parsed.frontmatter, 'createdAt'),
      'createdAt',
    ),
    updatedAt: parseRequiredTimestamp(
      getFrontmatterString(parsed.frontmatter, 'updatedAt'),
      'updatedAt',
    ),
    steps: parsePlanSteps(id, stepsBody),
    ...(notes && notes.length > 0 ? { notes } : {}),
  };
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

function parsePlanSteps(planId: string, body: string): readonly ExecutionPlanStep[] {
  const marker = '\n## Steps\n';
  const markerIndex = body.indexOf(marker);
  if (markerIndex === -1) {
    return [];
  }

  const raw = body.slice(markerIndex + marker.length + 1).trim();
  if (!raw || raw === '_No steps._') {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const steps: ExecutionPlanStep[] = [];
  let index = 0;

  while (index < lines.length) {
    const header = lines[index]?.match(/^###\s+(\d+)\.\s+\[([^\]]+)\]\s+(.+)$/);
    if (!header) {
      index += 1;
      continue;
    }

    const ordinal = Number.parseInt(header[1] ?? '0', 10);
    const status = parseStepStatusLabel((header[2] ?? '').trim());
    const step: ExecutionPlanStep = {
      id: `${planId}.step.${ordinal}`,
      tool: (header[3] ?? '').trim(),
      rationale: '',
      args: '',
      ...(status === 'pending' ? {} : { status }),
    };
    index += 1;

    const rationaleLines: string[] = [];
    while (index < lines.length && lines[index] !== '```yaml') {
      const line = lines[index];
      if (line?.startsWith('### ')) {
        break;
      }
      if (line?.trim() === '' && rationaleLines.length === 0) {
        index += 1;
        continue;
      }
      if (line !== undefined) {
        rationaleLines.push(line);
      }
      index += 1;
    }
    step.rationale = rationaleLines.join('\n').trim();

    if (lines[index] === '```yaml') {
      index += 1;
      const argsLines: string[] = [];
      while (index < lines.length && lines[index] !== '```') {
        argsLines.push(lines[index] ?? '');
        index += 1;
      }
      step.args = argsLines.join('\n').replace(/\r/g, '');
      if (lines[index] === '```') {
        index += 1;
      }
    }

    while (index < lines.length && lines[index]?.trim() === '') {
      index += 1;
    }

    const errorMatch = lines[index]?.match(/^_error:\s+(.+)_$/);
    if (errorMatch) {
      step.error = (errorMatch[1] ?? '').trim();
      index += 1;
    }

    steps.push(step);
  }

  return steps;
}

function parsePlanStatus(status: string): ExecutionPlan['status'] {
  switch (status) {
    case 'draft':
    case 'ready':
    case 'in_progress':
    case 'completed':
    case 'failed':
    case 'aborted':
      return status;
    default:
      throw new Error(`ExecutionPlan markdown has invalid status: ${status}`);
  }
}

function parseStepStatusLabel(label: string): ExecutionPlanStepStatus {
  switch (label) {
    case 'pending':
      return 'pending';
    case 'in progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      throw new Error(`ExecutionPlan markdown has invalid step status: ${label}`);
  }
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
