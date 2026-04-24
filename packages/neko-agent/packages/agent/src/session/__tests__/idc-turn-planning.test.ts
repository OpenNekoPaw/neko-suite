import { describe, expect, it } from 'vitest';
import {
  classifyIdcEntrySignal,
  classifyIdcTaskShape,
  resolveIdcWorkflowId,
  type IdcTurnPlanningContext,
} from '../idc-turn-planning';

function signals(
  overrides: Partial<import('../../executor/react-loop-runner').TaskShapeSignals> = {},
) {
  return {
    round: 0,
    lastToolResults: [],
    lastHadError: false,
    lastHadToolCalls: false,
    ...overrides,
  };
}

function planningContext(overrides: Partial<IdcTurnPlanningContext> = {}): IdcTurnPlanningContext {
  return {
    input: 'Create a TikTok launch video',
    executionMode: 'auto',
    ...overrides,
  };
}

describe('idc-turn-planning', () => {
  it('uses workflow-template when the active skill declares workflow metadata', () => {
    const context = planningContext({
      input: 'Use the workflow skill for this campaign',
      activeSkill: {
        name: 'launch-workflow',
        description: 'workflow',
        content: '',
        source: 'builtin',
        enabled: true,
        command: 'launch',
        phases: [{ name: 'draft' }],
      } as never,
    });

    const taskShape = classifyIdcTaskShape(signals(), context);
    const entrySignal = classifyIdcEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('multi-step');
    expect(entrySignal).toBe('workflow-template');
    expect(resolveIdcWorkflowId(context)).toBe('skill:launch-workflow');
  });

  it('detects referenced artifacts and resumes from the artifact path', () => {
    const context = planningContext({
      input: 'Continue from @draft-tiktok-001 and polish the timeline',
    });

    const taskShape = classifyIdcTaskShape(signals(), context);
    const entrySignal = classifyIdcEntrySignal({ ...signals(), taskShape }, context);

    expect(entrySignal).toBe('referenced-artifact');
    expect(resolveIdcWorkflowId(context)).toBe('artifact-resume');
  });

  it('treats vague creative asks as draft-first IDC entries', () => {
    const context = planningContext({
      input: '做一个品牌发布视频，风格更年轻一点',
    });

    const taskShape = classifyIdcTaskShape(signals(), context);
    const entrySignal = classifyIdcEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('single-write');
    expect(entrySignal).toBe('vague-creative');
  });

  it('respects explicit metadata overrides from the caller', () => {
    const context = planningContext({
      input: 'anything',
      metadata: {
        idc: {
          taskShape: 'plan-only',
          entrySignal: 'workflow-template',
          workflowId: 'custom-workflow',
        },
      },
    });

    const taskShape = classifyIdcTaskShape(signals(), context);
    const entrySignal = classifyIdcEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('plan-only');
    expect(entrySignal).toBe('workflow-template');
    expect(resolveIdcWorkflowId(context)).toBe('custom-workflow');
  });

  it('uses plan-mode workflow id when the turn is forced into plan execution mode', () => {
    const context = planningContext({
      input: 'Outline the migration plan',
      executionMode: 'plan',
    });

    expect(resolveIdcWorkflowId(context)).toBe('plan-mode');
  });
});
