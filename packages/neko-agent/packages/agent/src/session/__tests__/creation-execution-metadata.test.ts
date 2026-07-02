import { describe, expect, it } from 'vitest';
import {
  createPlanModeCreationMetadata,
  createSkillExecutionCreationMetadata,
  mergeCreationExecutionMetadata,
} from '../creation-execution-metadata';

describe('creation-execution-metadata', () => {
  it('creates plan-mode creation metadata', () => {
    expect(createPlanModeCreationMetadata()).toEqual({
      agentCreation: {
        entrySignal: 'vague-creative',
        taskShape: 'multi-step',
        creationKind: 'plan-mode',
      },
    });
  });

  it('creates prompt-chain-skill metadata for explicit slash skill execution', () => {
    expect(
      createSkillExecutionCreationMetadata(
        {
          name: '剪辑: 快速 workflow',
        } as never,
        {
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          promptChainId: 'storyboard.creation',
          checkpointId: 'skill-activated',
        },
      ),
    ).toEqual({
      agentCreation: {
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        promptChainId: 'storyboard.creation',
        checkpointId: 'skill-activated',
        skillName: '剪辑: 快速 workflow',
        entrySignal: 'prompt-chain-skill',
        taskShape: 'multi-step',
        creationKind: 'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
      },
    });
  });

  it('merges nested agent creation metadata without dropping existing keys', () => {
    expect(
      mergeCreationExecutionMetadata(
        {
          agentCreation: {
            creationKind: 'plan-mode',
            taskShape: 'multi-step',
          },
          source: 'plan',
        },
        {
          agentCreation: {
            entrySignal: 'prompt-chain-skill',
          },
          trigger: 'slash',
        },
      ),
    ).toEqual({
      agentCreation: {
        creationKind: 'plan-mode',
        taskShape: 'multi-step',
        entrySignal: 'prompt-chain-skill',
      },
      source: 'plan',
      trigger: 'slash',
    });
  });
});
