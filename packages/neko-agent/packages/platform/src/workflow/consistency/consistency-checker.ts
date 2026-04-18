/**
 * ConsistencyChecker — composes rule modules and produces a unified
 * { constraints, violations } report.
 *
 * Phase 2 chain: character_lock + time_progression.
 * Phase 5+ will add costume_continuity / style_lock / prop_consistency.
 *
 * See docs/architecture/creative-consistency.md.
 */

import type {
  CheckContext,
  ConsistencyChecker,
  ConsistencyCheckResult,
  ConsistencyRule,
} from './types';
import { characterLockRule } from './character-lock';
import { timeProgressionRule } from './time-progression';

const DEFAULT_RULES: readonly ConsistencyRule[] = [characterLockRule, timeProgressionRule];

export class ConsistencyCheckerImpl implements ConsistencyChecker {
  constructor(private readonly rules: readonly ConsistencyRule[] = DEFAULT_RULES) {}

  check(ctx: CheckContext): ConsistencyCheckResult {
    const constraints: ConsistencyCheckResult['constraints'] = [];
    const violations: ConsistencyCheckResult['violations'] = [];
    for (const rule of this.rules) {
      const res = rule.check(ctx);
      constraints.push(...res.constraints);
      violations.push(...res.violations);
    }
    return { constraints, violations };
  }
}

export function createConsistencyChecker(rules?: readonly ConsistencyRule[]): ConsistencyChecker {
  return new ConsistencyCheckerImpl(rules);
}

// Re-exports
export { characterLockRule } from './character-lock';
export { timeProgressionRule } from './time-progression';
export type {
  CheckContext,
  ConsistencyChecker,
  ConsistencyCheckResult,
  ConsistencyRule,
  Constraint,
  ConstraintKind,
  Violation,
  ViolationFix,
  ViolationSeverity,
} from './types';
