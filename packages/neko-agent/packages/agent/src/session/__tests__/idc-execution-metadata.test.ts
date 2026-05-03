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
      },
    });
  });

  it('creates prompt-chain-skill metadata for explicit slash skill execution', () => {
    expect(
      createSkillExecutionIdcMetadata({
        name: '剪辑: 快速 workflow',
      } as never),
    ).toEqual({
      idc: {
        entrySignal: 'prompt-chain-skill',
        taskShape: 'multi-step',
        runKind: 'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
      },
    });
  });

  it('merges nested idc metadata without dropping existing keys', () => {
    expect(
      mergeIdcExecutionMetadata(
        {
          idc: {
            runKind: 'plan-mode',
            taskShape: 'multi-step',
          },
          source: 'plan',
        },
        {
          idc: {
            entrySignal: 'prompt-chain-skill',
          },
          trigger: 'slash',
        },
      ),
    ).toEqual({
      idc: {
        runKind: 'plan-mode',
        taskShape: 'multi-step',
        entrySignal: 'prompt-chain-skill',
      },
      source: 'plan',
      trigger: 'slash',
    });
  });
});
