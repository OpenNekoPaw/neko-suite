import { describe, expect, it } from 'vitest';
import {
  createPlanModeIdcMetadata,
  createSkillExecutionIdcMetadata,
  mergeIdcExecutionMetadata,
} from '../idc-execution-metadata';

describe('idc-execution-metadata', () => {
  it('creates plan-mode IDC metadata', () => {
    expect(createPlanModeIdcMetadata()).toEqual({
      idc: {
        entrySignal: 'vague-creative',
        taskShape: 'multi-step',
        runKind: 'plan-mode',
        workflowId: 'plan-mode',
      },
    });
  });

  it('creates workflow-template metadata for slash skills with phases', () => {
    expect(
      createSkillExecutionIdcMetadata({
        name: '剪辑: 快速 workflow',
        phases: [{ name: 'draft' }] as never,
      } as never),
    ).toEqual({
      idc: {
        entrySignal: 'workflow-template',
        taskShape: 'multi-step',
        runKind: 'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
        workflowId: 'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
      },
    });
  });

  it('merges nested idc metadata without dropping existing keys', () => {
    expect(
      mergeIdcExecutionMetadata(
        {
          idc: {
            runKind: 'plan-mode',
            workflowId: 'plan-mode',
            taskShape: 'multi-step',
          },
          source: 'plan',
        },
        {
          idc: {
            entrySignal: 'workflow-template',
          },
          trigger: 'slash',
        },
      ),
    ).toEqual({
      idc: {
        runKind: 'plan-mode',
        workflowId: 'plan-mode',
        taskShape: 'multi-step',
        entrySignal: 'workflow-template',
      },
      source: 'plan',
      trigger: 'slash',
    });
  });

  it('preserves legacy workflowId-only overrides for downstream compatibility', () => {
    expect(
      mergeIdcExecutionMetadata(undefined, {
        idc: {
          workflowId: 'legacy-only',
        },
      }),
    ).toEqual({
      idc: {
        workflowId: 'legacy-only',
      },
    });
  });
});
