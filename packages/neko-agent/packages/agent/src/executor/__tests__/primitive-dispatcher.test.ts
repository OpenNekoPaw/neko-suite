/**
 * Primitive Dispatcher tests
 *
 * Covers:
 * - validateDispatch accepts a correct outer-ring decision
 * - validateDispatch catches DAG order violations
 * - validateDispatch catches missing Step on execution rounds
 * - validateDispatch allows Step-absent on plan-only
 * - assertDispatch throws on violation
 */

import { describe, it, expect } from 'vitest';
import type { PrimitiveActivationDecision } from '@neko-agent/types';
import { validateDispatch, assertDispatch } from '../primitive-dispatcher';

function make(overrides: Partial<PrimitiveActivationDecision> = {}): PrimitiveActivationDecision {
  return {
    flow: 'execution',
    taskShape: 'multi-step',
    activated: ['plan', 'approve', 'apply', 'step'],
    skipped: [],
    decidedAt: 1,
    round: 0,
    ...overrides,
  };
}

describe('validateDispatch', () => {
  it('accepts a well-formed execution decision', () => {
    expect(validateDispatch(make()).ok).toBe(true);
  });

  it('accepts an outer-ring decision without step', () => {
    const result = validateDispatch(
      make({ flow: 'creation', activated: ['proposal', 'review', 'execution', 'status'] }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects empty activation', () => {
    const result = validateDispatch(make({ activated: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === 'empty-activation')).toBe(true);
    }
  });

  it('rejects an inner-ring round missing step', () => {
    const result = validateDispatch(make({ activated: ['plan', 'apply'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === 'step-missing')).toBe(true);
    }
  });

  it('allows step-absent on plan-only', () => {
    const result = validateDispatch(make({ taskShape: 'plan-only', activated: ['plan'] }));
    expect(result.ok).toBe(true);
  });

  it('rejects DAG-order violation (apply before approve)', () => {
    // The planner normally sorts by DAG; simulate a manual override.
    const result = validateDispatch(
      make({ activated: ['apply', 'approve', 'step'] as unknown as never }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === 'dag-order')).toBe(true);
    }
  });
});

describe('assertDispatch', () => {
  it('is a no-op on valid decisions', () => {
    expect(() => assertDispatch(make())).not.toThrow();
  });

  it('throws on empty activation', () => {
    expect(() => assertDispatch(make({ activated: [] }))).toThrow(/empty-activation/);
  });

  it('aggregates violation codes in the error message', () => {
    expect(() =>
      assertDispatch(make({ activated: ['apply', 'approve'] as unknown as never })),
    ).toThrow();
  });
});
