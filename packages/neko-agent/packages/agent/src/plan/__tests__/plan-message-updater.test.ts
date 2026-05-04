import { describe, expect, it } from 'vitest';
import {
  type Message,
  updatePlanStatusInMessages,
  updatePlanStepInMessages,
} from '@neko-agent/types';

describe('plan message updater', () => {
  it('updates plan status inside message content blocks', () => {
    const result = updatePlanStatusInMessages(createMessages(), 'plan-1', 'approved');

    expect(result.updated).toBe(true);
    expect(result.messages[1]?.contentBlocks?.[0]?.plan?.status).toBe('approved');
  });

  it('updates a plan step status and description', () => {
    const result = updatePlanStepInMessages(createMessages(), 'plan-1', 'step-2', {
      status: 'modified',
      description: 'Updated step',
    });

    expect(result.updated).toBe(true);
    expect(result.messages[1]?.contentBlocks?.[0]?.plan?.steps).toEqual([
      { id: 'step-1', description: 'Step one', status: 'pending' },
      { id: 'step-2', description: 'Updated step', status: 'modified' },
    ]);
  });

  it('returns updated false when the target plan or step is absent', () => {
    expect(updatePlanStatusInMessages(createMessages(), 'missing-plan', 'approved')).toEqual({
      messages: createMessages(),
      updated: false,
    });
    expect(
      updatePlanStepInMessages(createMessages(), 'plan-1', 'missing-step', { status: 'approved' })
        .updated,
    ).toBe(false);
  });
});

function createMessages(): Message[] {
  return [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Plan this',
      timestamp: 1,
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: '',
      timestamp: 2,
      contentBlocks: [
        {
          id: 'block-1',
          type: 'plan',
          timestamp: 2,
          plan: {
            id: 'plan-1',
            title: 'Plan',
            status: 'pending',
            steps: [
              { id: 'step-1', description: 'Step one', status: 'pending' },
              { id: 'step-2', description: 'Step two', status: 'pending' },
            ],
          },
        },
      ],
    },
  ];
}
