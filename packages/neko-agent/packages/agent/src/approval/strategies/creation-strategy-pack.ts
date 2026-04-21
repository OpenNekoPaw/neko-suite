/**
 * Creation strategy pack — approval rules for declarative-paradigm subjects
 * (Specify-stage Proposals + upstream business decisions).
 *
 * Maps to ADR §6.1 "CreationStrategyPack: Proposal/Review decisions". The
 * pack operates on `paradigm: 'declarative'` subjects — proposal reviews
 * and read-only probing done during Specify / Plan / Tasks.
 *
 * See: docs/architecture/agent-unified-workflow.md §6.1 (ApprovalEngine)
 *      §4.2 (declarative vs imperative split)
 *
 * Default posture:
 *   - proposal-review: user-driven; pack does NOT auto-decide unless the
 *     proposal is marked idempotent + non-destructive (e.g. preview-only).
 *   - permission (tool calls initiated during Specify / Plan / Tasks —
 *     typically read-only probing): allowed if non-destructive;
 *     ask user otherwise.
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
