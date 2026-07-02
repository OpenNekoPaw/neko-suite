import { describe, expect, it } from 'vitest';
import {
  classifyCreationEntrySignal,
  classifyCreationTaskShape,
  resolveCreationKind,
  type CreationTurnPlanningContext,
} from '../creation-turn-planning';

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

function planningContext(
  overrides: Partial<CreationTurnPlanningContext> = {},
): CreationTurnPlanningContext {
  return {
    input: 'Create a TikTok launch video',
    executionMode: 'auto',
    ...overrides,
  };
}

describe('creation-turn-planning', () => {
  it('uses prompt-chain-skill when slash skill metadata is supplied', () => {
    const context = planningContext({
      input: 'Use the workflow skill for this campaign',
      metadata: {
        agentCreation: {
          entrySignal: 'prompt-chain-skill',
          taskShape: 'multi-step',
          creationKind: 'skill:launch-workflow',
        },
      },
    });

    const taskShape = classifyCreationTaskShape(signals(), context);
    const entrySignal = classifyCreationEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('multi-step');
    expect(entrySignal).toBe('prompt-chain-skill');
    expect(resolveCreationKind(context)).toBe('skill:launch-workflow');
  });

  it('uses explicit skill creationKind metadata', () => {
    const context = planningContext({
      metadata: {
        agentCreation: {
          creationKind: 'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
        },
      },
    });

    expect(resolveCreationKind(context)).toBe(
      'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
    );
  });

  it('detects referenced artifacts and resumes from the artifact path', () => {
    const context = planningContext({
      input: 'Continue from @draft-tiktok-001 and polish the timeline',
    });

    const taskShape = classifyCreationTaskShape(signals(), context);
    const entrySignal = classifyCreationEntrySignal({ ...signals(), taskShape }, context);

    expect(entrySignal).toBe('referenced-artifact');
    expect(resolveCreationKind(context)).toBe('artifact-resume');
  });

  it('treats vague creative asks as draft-first creation entries', () => {
    const context = planningContext({
      input: '做一个品牌发布视频，风格更年轻一点',
    });

    const taskShape = classifyCreationTaskShape(signals(), context);
    const entrySignal = classifyCreationEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('single-write');
    expect(entrySignal).toBe('vague-creative');
  });

  it('respects explicit metadata overrides from the caller', () => {
    const context = planningContext({
      input: 'anything',
      metadata: {
        agentCreation: {
          taskShape: 'plan-only',
          entrySignal: 'prompt-chain-skill',
          creationKind: 'custom-run-kind',
        },
      },
    });

    const taskShape = classifyCreationTaskShape(signals(), context);
    const entrySignal = classifyCreationEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('plan-only');
    expect(entrySignal).toBe('prompt-chain-skill');
    expect(resolveCreationKind(context)).toBe('custom-run-kind');
  });

  it('ignores legacy idc metadata because Agent creation guidance uses agentCreation only', () => {
    const context = planningContext({
      metadata: {
        idc: {
          entrySignal: 'prompt-chain-skill',
          taskShape: 'multi-step',
          creationKind: 'legacy-creation-kind',
        },
      },
    });

    const taskShape = classifyCreationTaskShape(signals(), context);
    const entrySignal = classifyCreationEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('single-write');
    expect(entrySignal).toBe('vague-creative');
    expect(resolveCreationKind(context)).toBe('agent-turn');
  });

  it('uses plan-mode run kind when the turn is forced into plan execution mode', () => {
    const context = planningContext({
      input: 'Outline the migration plan',
      executionMode: 'plan',
    });

    expect(resolveCreationKind(context)).toBe('plan-mode');
  });
});
