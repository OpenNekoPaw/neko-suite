import { describe, expect, it } from 'vitest';
import {
  classifyIdcEntrySignal,
  classifyIdcTaskShape,
  resolveIdcRunKind,
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
    expect(resolveIdcRunKind(context)).toBe('skill:launch-workflow');
    expect(resolveIdcWorkflowId(context)).toBe('skill:launch-workflow');
  });

  it('escapes workflow skill names before building runKind', () => {
    const context = planningContext({
      activeSkill: {
        name: '剪辑: 快速 workflow',
        description: 'workflow',
        content: '',
        source: 'builtin',
        enabled: true,
        command: 'edit-fast',
        phases: [{ name: 'draft' }],
      } as never,
    });

    expect(resolveIdcRunKind(context)).toBe(
      'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
    );
    expect(resolveIdcWorkflowId(context)).toBe(
      'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
    );
  });

  it('detects referenced artifacts and resumes from the artifact path', () => {
    const context = planningContext({
      input: 'Continue from @draft-tiktok-001 and polish the timeline',
    });

    const taskShape = classifyIdcTaskShape(signals(), context);
    const entrySignal = classifyIdcEntrySignal({ ...signals(), taskShape }, context);

    expect(entrySignal).toBe('referenced-artifact');
    expect(resolveIdcRunKind(context)).toBe('artifact-resume');
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
          runKind: 'custom-run-kind',
          workflowId: 'custom-workflow',
        },
      },
    });

    const taskShape = classifyIdcTaskShape(signals(), context);
    const entrySignal = classifyIdcEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('plan-only');
    expect(entrySignal).toBe('workflow-template');
    expect(resolveIdcRunKind(context)).toBe('custom-run-kind');
    expect(resolveIdcWorkflowId(context)).toBe('custom-run-kind');
  });

  it('falls back to legacy workflowId metadata when runKind is absent', () => {
    const context = planningContext({
      metadata: {
        idc: {
          workflowId: 'legacy-workflow-only',
        },
      },
    });

    expect(resolveIdcRunKind(context)).toBe('legacy-workflow-only');
    expect(resolveIdcWorkflowId(context)).toBe('legacy-workflow-only');
  });

  it('uses plan-mode run kind when the turn is forced into plan execution mode', () => {
    const context = planningContext({
      input: 'Outline the migration plan',
      executionMode: 'plan',
    });

    expect(resolveIdcRunKind(context)).toBe('plan-mode');
    expect(resolveIdcWorkflowId(context)).toBe('plan-mode');
  });
});
