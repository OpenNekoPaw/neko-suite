/**
 * Activation Planner Tests
 *
 * Covers ADR §3.4 three modes × §3.2 / §3.3 skip scenarios.
 *
 * Structure:
 *   - Creation flow, per mode + per task shape
 *   - Execution flow, per mode + per task shape
 *   - DAG ordering invariants
 *   - Retry hint override
 */

import { describe, it, expect } from 'vitest';
import { plan } from '../activation/activation-planner';
import {
  PRIMITIVE_REGISTRY,
  validateDag,
  sortByDag,
  getPrimitivesByFlow,
} from '../activation/primitive-registry';
import { MODE_ACTIVATION_MATRIX, isModeAllowed } from '../activation/mode-activation-matrix';
import type { Primitive } from '@neko-agent/types';

const clock = () => 12345;

describe('activation planner', () => {
  describe('creation flow', () => {
    it('AskMode + multi-step → enables proposal/review/execution/status', () => {
      const d = plan({
        mode: 'ask',
        flowContext: { kind: 'creation', reason: 'session-start' },
        taskShape: 'multi-step',
        round: 0,
        now: clock,
      });
      expect(d.activated).toEqual(['proposal', 'review', 'execution', 'status']);
      expect(d.skipped.map((s) => s.primitive)).toContain('orchestration');
      expect(d.skipped.find((s) => s.primitive === 'orchestration')?.reason).toBe('mode');
    });

    it('AutoMode + single-read → drops orchestration/proposal/review, keeps execution/status', () => {
      const d = plan({
        mode: 'auto',
        flowContext: { kind: 'creation', reason: 'session-start' },
        taskShape: 'single-read',
        round: 0,
        now: clock,
      });
      expect(d.activated).toEqual(['execution', 'status']);
      const skippedMap = Object.fromEntries(d.skipped.map((s) => [s.primitive, s.reason]));
      expect(skippedMap['orchestration']).toBe('task-shape');
      expect(skippedMap['proposal']).toBe('task-shape');
      expect(skippedMap['review']).toBe('task-shape');
    });

    it('PlanMode + multi-step → orchestration/proposal/review only (no execution/status)', () => {
      const d = plan({
        mode: 'plan',
        flowContext: { kind: 'creation', reason: 'session-start' },
        taskShape: 'multi-step',
        round: 0,
        now: clock,
      });
      expect(d.activated).toEqual(['orchestration', 'proposal', 'review']);
      const skippedMap = Object.fromEntries(d.skipped.map((s) => [s.primitive, s.reason]));
      expect(skippedMap['execution']).toBe('mode');
      expect(skippedMap['status']).toBe('mode');
    });

    it('clarification task → only execution/status (all outer business primitives skipped)', () => {
      const d = plan({
        mode: 'auto',
        flowContext: { kind: 'creation', reason: 'session-start' },
        taskShape: 'clarification',
        round: 3,
        now: clock,
      });
      expect(d.activated).toEqual(['execution', 'status']);
    });
  });

  describe('execution flow', () => {
    it('AskMode + multi-step → full chain plan→todo→approve→apply→step', () => {
      const d = plan({
        mode: 'ask',
        flowContext: { kind: 'execution', reason: 'apply-triggered' },
        taskShape: 'multi-step',
        round: 0,
        now: clock,
      });
      expect(d.activated).toEqual(['plan', 'todo', 'approve', 'apply', 'step']);
      expect(d.skipped).toEqual([]);
    });

    it('AutoMode + single-read → apply+step only, approve auto-approved, plan/todo skipped by shape', () => {
      const d = plan({
        mode: 'auto',
        flowContext: { kind: 'execution', reason: 'apply-triggered' },
        taskShape: 'single-read',
        round: 0,
        now: clock,
      });
      expect(d.activated).toEqual(['apply', 'step']);
      const skippedMap = Object.fromEntries(d.skipped.map((s) => [s.primitive, s.reason]));
      expect(skippedMap['plan']).toBe('task-shape');
      expect(skippedMap['todo']).toBe('task-shape');
      expect(skippedMap['approve']).toBe('auto-approved');
    });

    it('PlanMode → plan only, apply-chain forbidden', () => {
      const d = plan({
        mode: 'plan',
        flowContext: { kind: 'execution', reason: 'apply-triggered' },
        taskShape: 'plan-only',
        round: 0,
        now: clock,
      });
      expect(d.activated).toEqual(['plan']);
      for (const forbidden of ['todo', 'approve', 'apply', 'step'] as Primitive[]) {
        expect(d.activated).not.toContain(forbidden);
        expect(d.skipped.map((s) => s.primitive)).toContain(forbidden);
      }
    });

    it('pure-think round → step only (no apply, no plan/todo)', () => {
      const d = plan({
        mode: 'auto',
        flowContext: { kind: 'execution', reason: 'apply-triggered' },
        taskShape: 'pure-think',
        round: 1,
        now: clock,
      });
      expect(d.activated).toEqual(['step']);
      const skippedMap = Object.fromEntries(d.skipped.map((s) => [s.primitive, s.reason]));
      expect(skippedMap['apply']).toBe('task-shape');
      expect(skippedMap['plan']).toBe('task-shape');
      expect(skippedMap['todo']).toBe('task-shape');
    });

    it('retry round → reuses plan (skip plan/todo/approve with retry-reuse reason)', () => {
      const d = plan({
        mode: 'auto',
        flowContext: { kind: 'execution', reason: 'apply-triggered' },
        taskShape: 'retry',
        round: 2,
        now: clock,
      });
      expect(d.activated).toContain('apply');
      expect(d.activated).toContain('step');
      expect(d.activated).not.toContain('plan');
      expect(d.activated).not.toContain('todo');
      const skippedMap = Object.fromEntries(d.skipped.map((s) => [s.primitive, s.reason]));
      expect(skippedMap['plan']).toBe('retry-reuse');
      expect(skippedMap['todo']).toBe('retry-reuse');
      expect(skippedMap['approve']).toBe('retry-reuse');
    });

    it('lastObserveHint=retry overrides multi-step default into plan-reuse', () => {
      const d = plan({
        mode: 'ask',
        flowContext: { kind: 'execution', reason: 'apply-triggered' },
        taskShape: 'multi-step',
        round: 3,
        now: clock,
        lastObserveHint: 'retry',
      });
      const skippedMap = Object.fromEntries(d.skipped.map((s) => [s.primitive, s.reason]));
      expect(skippedMap['plan']).toBe('retry-reuse');
      expect(skippedMap['approve']).toBe('retry-reuse');
      expect(d.activated).toContain('apply');
      expect(d.activated).toContain('step');
    });
  });

  describe('DAG ordering invariants', () => {
    it('every emitted activation set respects the DAG', () => {
      const shapes = [
        'single-read',
        'single-write',
        'multi-step',
        'pure-think',
        'retry',
        'plan-only',
        'clarification',
      ] as const;
      const modes = ['plan', 'ask', 'auto'] as const;
      const flows = ['creation', 'execution'] as const;
      for (const m of modes) {
        for (const s of shapes) {
          for (const f of flows) {
            const d = plan({
              mode: m,
              flowContext: { kind: f, reason: 'session-start' },
              taskShape: s,
              round: 0,
              now: clock,
            });
            const v = validateDag(d.activated);
            expect(v.ok, `mode=${m} shape=${s} flow=${f} failed DAG: ${JSON.stringify(v)}`).toBe(
              true,
            );
          }
        }
      }
    });

    it('decidedAt comes from injected clock', () => {
      const d = plan({
        mode: 'ask',
        flowContext: { kind: 'creation', reason: 'session-start' },
        taskShape: 'multi-step',
        round: 7,
        now: () => 99999,
      });
      expect(d.decidedAt).toBe(99999);
      expect(d.round).toBe(7);
    });
  });
});

describe('primitive-registry helpers', () => {
  it('has entries for all 10 primitives', () => {
    expect(Object.keys(PRIMITIVE_REGISTRY)).toHaveLength(10);
  });

  it('sortByDag is stable + total', () => {
    const shuffled: Primitive[] = ['step', 'plan', 'apply', 'todo', 'approve'];
    expect(sortByDag(shuffled)).toEqual(['plan', 'todo', 'approve', 'apply', 'step']);
  });

  it('validateDag accepts missing prereqs (skipping is allowed)', () => {
    // Apply without Plan/Approve is allowed — those prereqs can be skipped.
    expect(validateDag(['apply', 'step'])).toEqual({ ok: true });
  });

  it('validateDag rejects out-of-order dependencies', () => {
    // apply depends on approve; placing apply before approve is a violation.
    const result = validateDag(['apply', 'approve']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0]).toEqual({
        primitive: 'apply',
        dependency: 'approve',
        reason: 'out-of-order',
      });
    }
  });

  it('getPrimitivesByFlow returns ring members in canonical order', () => {
    expect(getPrimitivesByFlow('creation')).toEqual([
      'orchestration',
      'proposal',
      'review',
      'execution',
      'status',
    ]);
    expect(getPrimitivesByFlow('execution')).toEqual(['plan', 'todo', 'approve', 'apply', 'step']);
  });
});

describe('mode-activation-matrix', () => {
  it('PlanMode forbids apply-chain primitives', () => {
    for (const p of ['todo', 'approve', 'apply', 'step'] as Primitive[]) {
      expect(isModeAllowed('plan', p)).toBe(false);
    }
    expect(isModeAllowed('plan', 'plan')).toBe(true);
  });

  it('AskMode disables autoApproveEligible', () => {
    expect(MODE_ACTIVATION_MATRIX.ask.autoApproveEligible).toBe(false);
  });

  it('AutoMode enables autoApproveEligible', () => {
    expect(MODE_ACTIVATION_MATRIX.auto.autoApproveEligible).toBe(true);
  });
});
