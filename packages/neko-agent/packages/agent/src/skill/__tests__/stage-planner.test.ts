/**
 * Stage Planner Tests
 *
 * Covers agent-unified-workflow.md §3 (entry rules) × §4 (four SDD stages).
 *
 * Structure:
 *   - Entry-stage resolution per §3.2 rules 1–6
 *   - Mode allow-list enforcement (PlanMode drops Implement)
 *   - Task-shape skip table
 *   - Retry hint override
 *   - DAG ordering invariants
 */

import { describe, it, expect } from 'vitest';
import { planStages, type StageEntrySignal } from '../activation/stage-planner';
import {
  STAGE_REGISTRY,
  sortStagesByDag,
  validateStageDag,
  allStagesInOrder,
} from '../activation/stage-registry';
import {
  STAGE_MODE_MATRIX,
  isStageModeAllowed,
  type StageMode,
} from '../activation/stage-activation-matrix';
import type { SddStage } from '@neko-agent/types';

const clock = () => 12345;

function baseInputs(overrides: {
  mode?: StageMode;
  entrySignal?: StageEntrySignal;
  taskShape?: Parameters<typeof planStages>[0]['taskShape'];
  lastObserveHint?: Parameters<typeof planStages>[0]['lastObserveHint'];
}): Parameters<typeof planStages>[0] {
  return {
    mode: overrides.mode ?? 'auto',
    taskShape: overrides.taskShape ?? 'multi-step',
    entrySignal: overrides.entrySignal ?? 'multi-step',
    round: 0,
    now: clock,
    lastObserveHint: overrides.lastObserveHint,
  };
}

describe('stage planner — entry resolution (§3.2)', () => {
  it('PlanMode always enters at Specify regardless of signal', () => {
    for (const signal of [
      'atomic-instruction',
      'multi-step',
      'vague-creative',
      'referenced-artifact',
      'workflow-template',
      'high-risk-forced',
    ] as StageEntrySignal[]) {
      const d = planStages(baseInputs({ mode: 'plan', entrySignal: signal }));
      expect(d.activated[0]).toBe('specify');
    }
  });

  it('AutoMode + high-risk-forced → enters at Specify (rule 1)', () => {
    const d = planStages(baseInputs({ mode: 'auto', entrySignal: 'high-risk-forced' }));
    expect(d.activated).toContain('specify');
  });

  it('AutoMode + atomic-instruction → enters at Implement (rule 4)', () => {
    const d = planStages(
      baseInputs({ mode: 'auto', entrySignal: 'atomic-instruction', taskShape: 'single-write' }),
    );
    expect(d.activated).toEqual(['implement']);
    expect(d.skipped.map((s) => s.stage)).toContain('specify');
    expect(d.skipped.find((s) => s.stage === 'plan')?.reason).toBe('entry-rule');
  });

  it('AutoMode + multi-step → enters at Plan (rule 5)', () => {
    const d = planStages(baseInputs({ mode: 'auto', entrySignal: 'multi-step' }));
    expect(d.activated).toEqual(['plan', 'tasks', 'implement']);
    expect(d.skipped.find((s) => s.stage === 'specify')?.reason).toBe('entry-rule');
  });

  it('AutoMode + vague-creative → enters at Specify (rule 6 fallback)', () => {
    const d = planStages(baseInputs({ mode: 'auto', entrySignal: 'vague-creative' }));
    expect(d.activated).toEqual(['specify', 'plan', 'tasks', 'implement']);
  });

  it('AutoMode + referenced-artifact → continues at Plan (rule 2)', () => {
    const d = planStages(baseInputs({ mode: 'auto', entrySignal: 'referenced-artifact' }));
    expect(d.activated[0]).toBe('plan');
    expect(d.skipped.find((s) => s.stage === 'specify')?.reason).toBe('entry-rule');
  });
});

describe('stage planner — mode allow-list', () => {
  it('PlanMode drops Implement even if entry signal allows it', () => {
    const d = planStages(baseInputs({ mode: 'plan', entrySignal: 'multi-step' }));
    expect(d.activated).not.toContain('implement');
    const implementSkip = d.skipped.find((s) => s.stage === 'implement');
    expect(implementSkip?.reason).toBeDefined();
  });

  it('AskMode allows all four stages', () => {
    const d = planStages(baseInputs({ mode: 'ask', entrySignal: 'vague-creative' }));
    expect(d.activated).toEqual(['specify', 'plan', 'tasks', 'implement']);
  });
});

describe('stage planner — task-shape skips', () => {
  it('single-read → Implement only', () => {
    const d = planStages(
      baseInputs({ mode: 'auto', entrySignal: 'vague-creative', taskShape: 'single-read' }),
    );
    expect(d.activated).toEqual(['implement']);
  });

  it('pure-think → Specify only, no Implement', () => {
    const d = planStages(
      baseInputs({ mode: 'auto', entrySignal: 'vague-creative', taskShape: 'pure-think' }),
    );
    expect(d.activated).toEqual(['specify']);
    expect(d.skipped.find((s) => s.stage === 'implement')?.reason).toBe('task-shape');
  });

  it('plan-only → stops after Tasks', () => {
    const d = planStages(
      baseInputs({ mode: 'auto', entrySignal: 'vague-creative', taskShape: 'plan-only' }),
    );
    expect(d.activated).toEqual(['specify', 'plan', 'tasks']);
    expect(d.skipped.find((s) => s.stage === 'implement')?.reason).toBe('task-shape');
  });

  it('clarification → Implement only', () => {
    const d = planStages(
      baseInputs({ mode: 'auto', entrySignal: 'vague-creative', taskShape: 'clarification' }),
    );
    expect(d.activated).toEqual(['implement']);
  });
});

describe('stage planner — retry hint', () => {
  it('retry hint drops Specify/Plan/Tasks, keeps Implement', () => {
    const d = planStages(
      baseInputs({
        mode: 'auto',
        entrySignal: 'vague-creative',
        taskShape: 'multi-step',
        lastObserveHint: 'retry',
      }),
    );
    expect(d.activated).toEqual(['implement']);
    for (const s of ['specify', 'plan', 'tasks'] as SddStage[]) {
      expect(d.skipped.find((x) => x.stage === s)?.reason).toBe('retry-reuse');
    }
  });
});

describe('stage planner — DAG invariants', () => {
  it('activated set is always DAG-valid', () => {
    const cases: Parameters<typeof baseInputs>[0][] = [
      { mode: 'auto', entrySignal: 'vague-creative', taskShape: 'multi-step' },
      { mode: 'auto', entrySignal: 'atomic-instruction', taskShape: 'single-write' },
      { mode: 'plan', entrySignal: 'vague-creative', taskShape: 'multi-step' },
      { mode: 'ask', entrySignal: 'multi-step', taskShape: 'multi-step' },
    ];
    for (const c of cases) {
      const d = planStages(baseInputs(c));
      expect(validateStageDag(d.activated)).toEqual({ ok: true });
      expect(d.activated).toEqual(sortStagesByDag(d.activated));
    }
  });
});

describe('stage registry', () => {
  it('canonical order is specify → plan → tasks → implement', () => {
    expect(allStagesInOrder()).toEqual(['specify', 'plan', 'tasks', 'implement']);
  });

  it('only Implement is default-mandatory', () => {
    const mandatory = (
      Object.values(STAGE_REGISTRY) as { name: SddStage; defaultMandatory: boolean }[]
    )
      .filter((m) => m.defaultMandatory)
      .map((m) => m.name);
    expect(mandatory).toEqual(['implement']);
  });

  it('only Specify has a default approval gate', () => {
    const withGate = (
      Object.values(STAGE_REGISTRY) as { name: SddStage; hasApprovalGate: boolean }[]
    )
      .filter((m) => m.hasApprovalGate)
      .map((m) => m.name);
    expect(withGate).toEqual(['specify']);
  });
});

describe('stage mode matrix', () => {
  it('PlanMode disallows Implement', () => {
    expect(isStageModeAllowed('plan', 'implement')).toBe(false);
    expect(STAGE_MODE_MATRIX.plan.allowsImplement).toBe(false);
  });

  it('AutoMode is the only auto-approve eligible mode', () => {
    expect(STAGE_MODE_MATRIX.auto.autoApproveEligible).toBe(true);
    expect(STAGE_MODE_MATRIX.ask.autoApproveEligible).toBe(false);
    expect(STAGE_MODE_MATRIX.plan.autoApproveEligible).toBe(false);
  });
});
