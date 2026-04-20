/**
 * Execution strategy pack — inner-ring approval rules.
 *
 * See: docs/architecture/dual-flow-architecture.md §5.2
 *      plan v2 P4
 *
 * Default posture on the execution ring:
 *   - Permission: auto-accept idempotent non-destructive tools,
 *     ask user on destructive, auto-reject when both `destructive`
 *     and `idempotent === false` (we can't recover from a bad apply).
 *   - Quality gate: auto-accept when context carries a 'pass' verdict,
 *     escalate on 'warn', auto-reject on 'fail'.
 *   - Plan review: not our scope (creation ring owns it).
 */

import type { ApprovalRequest, ApprovalResponse, StrategyPack } from '../approval-types';

export const executionStrategyPack: StrategyPack = {
  name: 'execution-default',
  scope: 'execution',
  evaluate(request: ApprovalRequest): ApprovalResponse | undefined {
    const { subject, channel, context } = request;

    if (channel === 'permission') {
      if (!subject.destructive && subject.idempotent !== false) {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'idempotent-non-destructive',
          decidedAt: 0,
        };
      }
      if (subject.destructive && subject.idempotent === false) {
        return {
          requestId: request.id,
          resolution: 'auto-reject',
          reason: 'destructive-and-non-idempotent',
          note: 'Cannot safely run a destructive + non-idempotent tool without user confirmation.',
          decidedAt: 0,
        };
      }
      return undefined; // ask user
    }

    if (channel === 'quality-gate') {
      const verdict = typeof context?.verdict === 'string' ? context.verdict : undefined;
      if (verdict === 'pass') {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'quality-pass',
          decidedAt: 0,
        };
      }
      if (verdict === 'fail') {
        return {
          requestId: request.id,
          resolution: 'auto-reject',
          reason: 'quality-fail',
          decidedAt: 0,
        };
      }
      // 'warn' → escalate
      return {
        requestId: request.id,
        resolution: 'escalate',
        reason: 'quality-warn',
        decidedAt: 0,
      };
    }

    // Plan review not handled here.
    return undefined;
  },
};
