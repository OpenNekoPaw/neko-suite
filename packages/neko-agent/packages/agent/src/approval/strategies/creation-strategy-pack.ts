/**
 * Creation strategy pack — approval rules for Specify-stage and upstream
 * user-facing decisions.
 *
 * See: docs/architecture/agent-unified-workflow.md §9 (Approval governance)
 *
 * Default posture:
 *   - Proposal review (end of Specify): user-driven; pack does NOT
 *     auto-decide unless the proposal is marked idempotent +
 *     non-destructive (e.g. preview-only).
 *   - Permission (tool calls initiated during Specify / Plan / Tasks —
 *     typically read-only probing): allowed if non-destructive;
 *     ask user otherwise.
 *   - Quality gate: never auto-decides here; caller escalates to the
 *     execution strategy pack.
 *
 * These are defaults — sites can swap via createApprovalEngine({ strategyPacks }).
 */

import type { ApprovalRequest, ApprovalResponse, StrategyPack } from '../approval-types';

export const creationStrategyPack: StrategyPack = {
  name: 'creation-default',
  scope: 'creation',
  evaluate(request: ApprovalRequest): ApprovalResponse | undefined {
    const { subject, channel } = request;

    if (channel === 'proposal-review') {
      if (subject.idempotent && !subject.destructive) {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'preview-only-proposal',
          note: 'Proposal is idempotent + non-destructive; auto-accept for preview.',
          decidedAt: 0,
        };
      }
      return undefined;
    }

    if (channel === 'permission') {
      if (!subject.destructive) {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'non-destructive-read',
          decidedAt: 0,
        };
      }
      return undefined;
    }

    // Quality gate is a technical-layer decision — not our scope.
    return undefined;
  },
};
