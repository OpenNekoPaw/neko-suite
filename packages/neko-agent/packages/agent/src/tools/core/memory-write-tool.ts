/**
 * MemoryWrite Tool
 *
 * Allows the Agent to propose facts, decisions, and preferences for the
 * project-level memory file. The Agent does not commit `.neko/memory.md`
 * directly; clients or domain runtimes validate and persist accepted proposals.
 */

import type { ToolResult, ToolCategory, ToolParameters } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';

export type ProjectMemoryMutationAction = 'upsert' | 'remove';

export interface ProjectMemoryMutationProposal {
  readonly kind: 'project-memory-mutation';
  readonly action: ProjectMemoryMutationAction;
  readonly key: string;
  readonly content?: string;
}

export interface ProjectMemoryMutationProposalSink {
  proposeProjectMemoryMutation(
    proposal: ProjectMemoryMutationProposal,
  ): Promise<{ readonly proposalId?: string; readonly message?: string } | void>;
}

export interface MemoryWriteToolOptions {
  readonly proposalSink?: ProjectMemoryMutationProposalSink;
}

export class MemoryWriteTool extends BuiltinTool {
  readonly name = 'MemoryWrite';
  readonly description =
    'Propose a fact, decision, or preference update for project memory. The Agent does not write .neko/memory.md directly; the client or entity/runtime owner validates and commits accepted proposals. ' +
    'Use `upsert` to propose creating or updating a named section; use `remove` to propose deleting one. ' +
    'Good sections: "User Preferences", "Project Architecture", "Recent Decisions", "Key Conventions".';

  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['upsert', 'remove'],
        description: '`upsert` creates or replaces the section; `remove` deletes it.',
      },
      key: {
        type: 'string',
        description:
          'Section heading (e.g. "User Preferences"). Used as the ## heading in memory.md.',
      },
      content: {
        type: 'string',
        description:
          'Markdown body for the section. Required when action is `upsert`. ' +
          'Use bullet points for lists of facts.',
      },
    },
    required: ['action', 'key'],
  };

  readonly category: ToolCategory = 'system';
  override readonly requiresConfirmation = false;

  constructor(private readonly options: MemoryWriteToolOptions = {}) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const action = args.action as 'upsert' | 'remove';
    const key = args.key as string;

    if (!key.trim()) {
      return this.error('`key` must not be empty');
    }

    const proposal = createProjectMemoryMutationProposal(action, key, args.content);
    if (!proposal) {
      return this.error('`content` is required for action `upsert`');
    }

    try {
      const sinkResult = await this.options.proposalSink?.proposeProjectMemoryMutation(proposal);
      return this.success({
        proposal,
        committed: false,
        ...(sinkResult?.proposalId ? { proposalId: sinkResult.proposalId } : {}),
        message:
          sinkResult?.message ??
          `Project memory ${action} proposal created for section "${key}". Client/domain runtime must validate and commit it.`,
      });
    } catch (err) {
      return this.error(
        `Failed to propose project memory update: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function createProjectMemoryMutationProposal(
  action: ProjectMemoryMutationAction,
  key: string,
  rawContent: unknown,
): ProjectMemoryMutationProposal | undefined {
  if (action === 'upsert') {
    if (rawContent === undefined || rawContent === null) {
      return undefined;
    }
    return {
      kind: 'project-memory-mutation',
      action,
      key,
      content: String(rawContent),
    };
  }
  return {
    kind: 'project-memory-mutation',
    action,
    key,
  };
}
