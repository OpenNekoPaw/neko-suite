/**
 * Creation strategy pack — outer-ring approval rules.
 *
 * See: docs/architecture/dual-flow-architecture.md §5.2
 *      plan v2 P4
 *
 * Default posture on the creation ring:
 *   - Plan review: user-driven; pack does NOT auto-decide unless the
 *     plan is marked idempotent + non-destructive (e.g. preview-only).
 *   - Permission (tool calls initiated during creation): allowed if
 *     non-destructive; ask user otherwise.
 *   - Quality gate: never auto-decides from the creation ring; caller
 *     escalates to execution strategy pack.
 *
 * These are defaults — sites can swap via createApprovalEngine({ strategyPacks }).
 */

import type { ApprovalRequest, ApprovalResponse, StrategyPack } from '../approval-types';

export const creationStrategyPack: StrategyPack = {
  name: 'creation-default',
  scope: 'creation',
  evaluate(request: ApprovalRequest): ApprovalResponse | undefined {
    const { subject, channel } = request;

    if (channel === 'plan-review') {
      if (subject.idempotent && !subject.destructive) {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'preview-only-plan',
          note: 'Plan is idempotent + non-destructive; auto-accept for preview.',
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
