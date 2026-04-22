/**
 * ProposalWriteTool — persists a Specify-stage Proposal to
 * `.neko/proposals/<id>.nkproposal.md` (ADR §5, §7.5).
 *
 * Contract mirrors TodoWriteTool:
 *   - AI supplies the full artifact each call (no diffs).
 *   - `createdAt` is preserved across rewrites by parsing the existing
 *     frontmatter. First write seeds it with `now()`.
 *   - The tool validates frontmatter shape at the boundary so
 *     malformed payloads surface immediately instead of producing
 *     unreadable files.
 *   - Unlike TodoWrite, the Proposal id is a caller-supplied
 *     identifier — it's NOT the SddRun id. One run may produce
 *     multiple proposals (fork-and-compare flow in ADR §9.3).
 */

import * as fs from 'node:fs/promises';
import type { ToolResult, ToolCategory } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import type { Proposal, ProposalStatus } from '@neko-agent/types';
import type { INekoPaths } from '../../workspace';
import { serializeProposal } from '../../workspace';

const VALID_STATUS: ReadonlySet<ProposalStatus> = new Set([
  'draft',
  'pending_review',
  'approved',
  'refined',
  'rejected',
]);

export interface ProposalWriteToolOptions {
  /** Resolves `.neko/proposals/<id>.nkproposal.md`. */
  paths: INekoPaths;
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export class ProposalWriteTool extends BuiltinTool {
  private readonly _paths: INekoPaths;
  private readonly _now: () => number;

  constructor(options: ProposalWriteToolOptions) {
    super();
    this._paths = options.paths;
    this._now = options.now ?? (() => Date.now());
  }

  readonly name = 'ProposalWrite';
  readonly description =
    'Write a Specify-stage Proposal to `.neko/proposals/<id>.nkproposal.md`. ' +
    'Provide the full artifact (frontmatter fields + intent / approach / artifact ' +
    'bodies). The file is replaced on each call; createdAt is preserved across ' +
    'rewrites. Use status = draft while composing, pending_review when handing ' +
    'to the user, approved/refined/rejected on user response.';
  readonly parameters = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Stable proposal id, e.g. "cut-tiktok-001". Used as the filename stem.',
      },
      title: { type: 'string', description: 'Short headline shown in review UIs.' },
      status: {
        type: 'string',
        enum: ['draft', 'pending_review', 'approved', 'refined', 'rejected'],
        description: 'Lifecycle status.',
      },
      domain: {
        type: 'string',
        description: 'Domain tag (cut / canvas / story / puppet / ...).',
      },
      intent: {
        type: 'string',
        description: 'Layer 1 — what the user asked for, restated.',
      },
      approach: {
        type: 'string',
        description: 'Layer 2 — which atomic tools / stages you chose, and why.',
      },
      artifact: {
        type: 'string',
        description:
          'Layer 3 — the concrete deliverable (shot list, prompt list, style sheet, ...).',
      },
      referenceChain: {
        type: 'array',
        description: 'Optional asset:// URIs the proposal depends on.',
        items: { type: 'string' },
      },
    },
    required: ['id', 'title', 'status', 'domain', 'intent', 'approach', 'artifact'],
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

    const filePath = this._paths.file('proposals', parsed.id);
    const now = this._now();
    const createdAt = await this._readCreatedAt(filePath, now);

    const proposal: Proposal = {
      ...parsed,
      createdAt,
      updatedAt: now,
    };
    const markdown = serializeProposal(proposal);

    try {
      await fs.mkdir(this._paths.dir('proposals'), { recursive: true });
      await fs.writeFile(filePath, markdown, 'utf-8');
      return this.success({
        path: filePath,
        id: parsed.id,
        status: parsed.status,
        bytesWritten: Buffer.byteLength(markdown, 'utf-8'),
      });
    } catch (err) {
      return this.error(
        `ProposalWrite: failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _parseArgs(
    args: Record<string, unknown>,
  ): Omit<Proposal, 'createdAt' | 'updatedAt'> | string {
    const id = args.id;
    const title = args.title;
    const status = args.status;
    const domain = args.domain;
    const intent = args.intent;
    const approach = args.approach;
    const artifact = args.artifact;
    const referenceChain = args.referenceChain;

    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
      return 'ProposalWrite: "id" must be a non-empty token (letters, numbers, - _ . allowed)';
    }
    if (typeof title !== 'string' || title.length === 0) {
      return 'ProposalWrite: "title" must be a non-empty string';
    }
    if (typeof status !== 'string' || !VALID_STATUS.has(status as ProposalStatus)) {
      return 'ProposalWrite: "status" must be one of draft|pending_review|approved|refined|rejected';
    }
    if (typeof domain !== 'string' || domain.length === 0) {
      return 'ProposalWrite: "domain" must be a non-empty string';
    }
    for (const [key, val] of [
      ['intent', intent],
      ['approach', approach],
      ['artifact', artifact],
    ] as const) {
      if (typeof val !== 'string' || val.length === 0) {
        return `ProposalWrite: "${key}" must be a non-empty string`;
      }
    }

    const out: Omit<Proposal, 'createdAt' | 'updatedAt'> = {
      id,
      title,
      status: status as ProposalStatus,
      domain,
      intent: intent as string,
      approach: approach as string,
      artifact: artifact as string,
    };
    if (Array.isArray(referenceChain)) {
      const chain: string[] = [];
      for (const entry of referenceChain) {
        if (typeof entry !== 'string' || entry.length === 0) {
          return 'ProposalWrite: referenceChain entries must be non-empty strings';
        }
        chain.push(entry);
      }
      if (chain.length > 0) out.referenceChain = chain;
    }
    return out;
  }

  /**
   * Preserve the existing `createdAt` across rewrites so audit rows
   * can reason about proposal age. Parse failure falls back to `now()`.
   */
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
