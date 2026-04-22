/**
 * Creation strategy pack — approval rules for declarative-paradigm subjects
 * (Draft-stage artifacts + upstream business decisions).
 *
 * Maps to ADR §6.1 "CreationStrategyPack: Draft/Review decisions". The
 * pack operates on `paradigm: 'declarative'` subjects — draft reviews
 * and read-only probing done during Draft / Plan.
 *
 * See: docs/architecture/agent-unified-workflow.md §6.1 (ApprovalEngine)
 *      §4.2 (declarative vs imperative split)
 *
 * Default posture:
 *   - draft-review: user-driven; pack does NOT auto-decide unless the
 *     draft is marked idempotent + non-destructive (e.g. preview-only).
 *   - permission (tool calls initiated during Draft / Plan — typically
 *     read-only probing): allowed if non-destructive; ask user otherwise.
 *   - quality-gate: never auto-decides here; caller routes to the
 *     execution strategy pack.
 *
 * These are defaults — sites can swap via createApprovalEngine({ strategyPacks }).
 */

import type { ApprovalRequest, ApprovalResponse, StrategyPack } from '../approval-types';

export const creationStrategyPack: StrategyPack = {
  name: 'creation-default',
  scope: 'declarative',
  evaluate(request: ApprovalRequest): ApprovalResponse | undefined {
    const { subject, channel } = request;

    if (channel === 'draft-review') {
      if (subject.idempotent && !subject.destructive) {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'preview-only-draft',
          note: 'Draft is idempotent + non-destructive; auto-accept for preview.',
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
