/**
 * PlanWriteTool — persists a Plan-stage ExecutionPlan to
 * `.neko/plans/<id>.nkplan.md` (ADR §4.2, §7.5).
 *
 * Contract mirrors ProposalWriteTool:
 *   - AI supplies the full artifact each call (no diffs / merges).
 *   - `createdAt` is preserved across rewrites.
 *   - Plan id is caller-supplied; proposalId establishes lineage back
 *     to the Specify-stage artifact.
 *   - Step ids are free-form; the serialiser only relies on order.
 */

import * as fs from 'node:fs/promises';
import type { ToolResult, ToolCategory } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import type {
  ExecutionPlan,
  ExecutionPlanStatus,
  ExecutionPlanStep,
  ExecutionPlanStepStatus,
} from '@neko-agent/types';
import type { INekoPaths } from '../../workspace';
import { serializeExecutionPlan } from '../../workspace';

const VALID_STATUS: ReadonlySet<ExecutionPlanStatus> = new Set([
  'draft',
  'ready',
  'in_progress',
  'completed',
  'failed',
  'aborted',
]);

const VALID_STEP_STATUS: ReadonlySet<ExecutionPlanStepStatus> = new Set([
  'pending',
  'in_progress',
  'completed',
  'failed',
]);

export interface PlanWriteToolOptions {
  paths: INekoPaths;
  now?: () => number;
}

export class PlanWriteTool extends BuiltinTool {
  private readonly _paths: INekoPaths;
  private readonly _now: () => number;

  constructor(options: PlanWriteToolOptions) {
    super();
    this._paths = options.paths;
    this._now = options.now ?? (() => Date.now());
  }

  readonly name = 'PlanWrite';
  readonly description =
    'Write a Plan-stage ExecutionPlan to `.neko/plans/<id>.nkplan.md`. ' +
    'Provide the full artifact — frontmatter fields plus an ordered `steps` ' +
    'array. Each step carries a tool name, rationale, and args blob (YAML/JSON ' +
    'in a fence). The file is replaced on each call; createdAt is preserved.';
  readonly parameters = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Stable plan id (often `<proposalId>-plan`). Used as the filename stem.',
      },
      proposalId: {
        type: 'string',
        description: 'Id of the Proposal this plan compiles from. Establishes lineage.',
      },
      title: { type: 'string', description: 'Human-readable title.' },
      status: {
        type: 'string',
        enum: ['draft', 'ready', 'in_progress', 'completed', 'failed', 'aborted'],
        description: 'Lifecycle status.',
      },
      steps: {
        type: 'array',
        description: 'Ordered tool-call sequence.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            tool: { type: 'string', description: 'Canonical tool name.' },
            rationale: { type: 'string', description: 'One-paragraph reasoning.' },
            args: { type: 'string', description: 'Args blob (YAML/JSON) as a string.' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'failed'],
              description: 'Step status; defaults to pending.',
            },
            error: { type: 'string', description: 'Failure reason when status=failed.' },
          },
          required: ['id', 'tool', 'rationale', 'args'],
        },
      },
      notes: {
        type: 'string',
        description: 'Optional free-form notes (guardrails, policy reminders).',
      },
    },
    required: ['id', 'proposalId', 'title', 'status', 'steps'],
  };
  readonly category: ToolCategory = 'file';
  override readonly isConcurrencySafe = false;

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const parsed = this._parseArgs(args);
    if (typeof parsed === 'string') return this.error(parsed);

    const filePath = this._paths.file('plans', parsed.id);
    const now = this._now();
    const createdAt = await this._readCreatedAt(filePath, now);

    const plan: ExecutionPlan = {
      ...parsed,
      createdAt,
      updatedAt: now,
    };
    const markdown = serializeExecutionPlan(plan);

    try {
      await fs.mkdir(this._paths.dir('plans'), { recursive: true });
      await fs.writeFile(filePath, markdown, 'utf-8');
      return this.success({
        path: filePath,
        id: parsed.id,
        proposalId: parsed.proposalId,
        status: parsed.status,
        stepCount: parsed.steps.length,
        bytesWritten: Buffer.byteLength(markdown, 'utf-8'),
      });
    } catch (err) {
      return this.error(
        `PlanWrite: failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _parseArgs(
    args: Record<string, unknown>,
  ): Omit<ExecutionPlan, 'createdAt' | 'updatedAt'> | string {
    const id = args.id;
    const proposalId = args.proposalId;
    const title = args.title;
    const status = args.status;
    const rawSteps = args.steps;
    const notes = args.notes;

    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
      return 'PlanWrite: "id" must be a non-empty token (letters, numbers, - _ . allowed)';
    }
    if (typeof proposalId !== 'string' || proposalId.length === 0) {
      return 'PlanWrite: "proposalId" must be a non-empty string';
    }
    if (typeof title !== 'string' || title.length === 0) {
      return 'PlanWrite: "title" must be a non-empty string';
    }
    if (typeof status !== 'string' || !VALID_STATUS.has(status as ExecutionPlanStatus)) {
      return 'PlanWrite: "status" must be one of draft|ready|in_progress|completed|failed|aborted';
    }
    if (!Array.isArray(rawSteps)) {
      return 'PlanWrite: "steps" must be an array';
    }

    const steps: ExecutionPlanStep[] = [];
    for (let i = 0; i < rawSteps.length; i++) {
      const step = this._parseStep(rawSteps[i], i);
      if (typeof step === 'string') return step;
      steps.push(step);
    }

    const out: Omit<ExecutionPlan, 'createdAt' | 'updatedAt'> = {
      id,
      proposalId,
      title,
      status: status as ExecutionPlanStatus,
      steps,
    };
    if (typeof notes === 'string' && notes.length > 0) out.notes = notes;
    return out;
  }

  private _parseStep(raw: unknown, index: number): ExecutionPlanStep | string {
    if (typeof raw !== 'object' || raw === null) {
      return `PlanWrite: steps[${index}] must be an object`;
    }
    const rec = raw as Record<string, unknown>;
    const id = rec.id;
    const tool = rec.tool;
    const rationale = rec.rationale;
    const argsStr = rec.args;
    if (typeof id !== 'string' || id.length === 0) {
      return `PlanWrite: steps[${index}].id must be a non-empty string`;
    }
    if (typeof tool !== 'string' || tool.length === 0) {
      return `PlanWrite: steps[${index}].tool must be a non-empty string`;
    }
    if (typeof rationale !== 'string') {
      return `PlanWrite: steps[${index}].rationale must be a string`;
    }
    if (typeof argsStr !== 'string') {
      return `PlanWrite: steps[${index}].args must be a string (YAML/JSON blob)`;
    }
    const step: ExecutionPlanStep = { id, tool, rationale, args: argsStr };
    if (rec.status !== undefined) {
      if (
        typeof rec.status !== 'string' ||
        !VALID_STEP_STATUS.has(rec.status as ExecutionPlanStepStatus)
      ) {
        return `PlanWrite: steps[${index}].status must be one of pending|in_progress|completed|failed`;
      }
      step.status = rec.status as ExecutionPlanStepStatus;
    }
    if (typeof rec.error === 'string') step.error = rec.error;
    return step;
  }

  private async _readCreatedAt(filePath: string, fallbackNow: number): Promise<number> {
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      const match = /^createdAt:\s*(.+)$/m.exec(existing);
      if (match?.[1]) {
        const parsed = Date.parse(match[1].trim());
        if (!Number.isNaN(parsed)) return parsed;
      }
    } catch {
      // First write for this id.
    }
    return fallbackNow;
  }
}
