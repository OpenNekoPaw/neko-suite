import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/types';
import {
  runPlanApprovalRuntime,
  runPlanRejectionRuntime,
  runPlanStepActionRuntime,
  runPlanStepModificationRuntime,
  type PlanReviewConversationStore,
  type PlanReviewRuntimeEffects,
  type PlanReviewRuntimeMessage,
} from '../plan-review-runtime';

describe('plan review runtime', () => {
  let messagesByConversation: Map<string, Message[]>;
  let postMessage: ReturnType<typeof vi.fn>;
  let readPlanFile: ReturnType<typeof vi.fn>;
  let executePlanApproval: ReturnType<typeof vi.fn>;
  let onMissingConversation: ReturnType<typeof vi.fn>;
  let onPlanMessageNotUpdated: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let store: PlanReviewConversationStore;
  let effects: PlanReviewRuntimeEffects;

  beforeEach(() => {
    messagesByConversation = new Map([['conv-1', createMessages()]]);
    postMessage = vi.fn();
    readPlanFile = vi.fn();
    executePlanApproval = vi.fn();
    onMissingConversation = vi.fn();
    onPlanMessageNotUpdated = vi.fn();
    onError = vi.fn();
    store = {
      getMessages: (conversationId) => messagesByConversation.get(conversationId),
      updateMessages: (conversationId, messages) => {
        messagesByConversation.set(conversationId, messages);
      },
    };
    effects = {
      postMessage,
      readPlanFile,
      executePlanApproval,
      onMissingConversation,
      onPlanMessageNotUpdated,
      onError,
    };
  });

  it('approves a plan and dispatches direct auto execution without a plan file', async () => {
    const result = await runPlanApprovalRuntime(
      { planId: 'plan-1', conversationId: 'conv-1' },
      store,
      effects,
    );

    expect(result).toEqual({ persisted: true, executed: true, fileReadFailed: false });
    expect(getPlanStatus()).toBe('approved');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'planStatusUpdate',
      planId: 'plan-1',
      conversationId: 'conv-1',
      status: 'approved',
    });
    expect(executePlanApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        messageText: expect.stringContaining('approved'),
        sessionMode: 'agent',
        executionOverrides: expect.objectContaining({ executionMode: 'auto' }),
      }),
    );
  });

  it('reads an approved plan file before dispatching auto execution', async () => {
    readPlanFile.mockResolvedValue('# Plan Content');

    const result = await runPlanApprovalRuntime(
      { planId: 'plan-1', conversationId: 'conv-1', filePath: '/tmp/plan.md' },
      store,
      effects,
    );

    expect(result).toEqual({ persisted: true, executed: true, fileReadFailed: false });
    expect(readPlanFile).toHaveBeenCalledWith('/tmp/plan.md');
    expect(executePlanApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        messageText: expect.stringContaining('# Plan Content'),
      }),
    );
  });

  it('binds approved plan file read failures to the target conversation', async () => {
    readPlanFile.mockRejectedValue(new Error('missing file'));

    const result = await runPlanApprovalRuntime(
      { planId: 'plan-1', conversationId: 'conv-1', filePath: '/tmp/missing.md' },
      store,
      effects,
    );

    expect(result).toEqual({ persisted: true, executed: false, fileReadFailed: true });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(executePlanApproval).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        conversationId: 'conv-1',
        message: expect.stringContaining('Failed to read plan file: missing file'),
      } satisfies Partial<PlanReviewRuntimeMessage>),
    );
  });

  it('rejects a plan and emits rejection feedback', async () => {
    const result = await runPlanRejectionRuntime(
      { planId: 'plan-1', conversationId: 'conv-1' },
      store,
      effects,
    );

    expect(result).toEqual({ persisted: true });
    expect(getPlanStatus()).toBe('rejected');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'planStatusUpdate',
      planId: 'plan-1',
      conversationId: 'conv-1',
      status: 'rejected',
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'streamText',
        conversationId: 'conv-1',
        content: expect.stringContaining('Plan rejected'),
      }),
    );
  });

  it('updates plan step approval and modification in the target conversation', async () => {
    await runPlanStepActionRuntime(
      {
        planId: 'plan-1',
        stepId: 'step-1',
        conversationId: 'conv-1',
        action: 'approve',
      },
      store,
      effects,
    );
    await runPlanStepModificationRuntime(
      {
        planId: 'plan-1',
        stepId: 'step-2',
        conversationId: 'conv-1',
        newDescription: 'Updated step',
      },
      store,
      effects,
    );

    expect(getPlanSteps()).toEqual([
      { id: 'step-1', description: 'Step one', status: 'approved' },
      { id: 'step-2', description: 'Updated step', status: 'modified' },
    ]);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'planStepStatusUpdate',
      planId: 'plan-1',
      stepId: 'step-1',
      conversationId: 'conv-1',
      status: 'approved',
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'planStepStatusUpdate',
      planId: 'plan-1',
      stepId: 'step-2',
      conversationId: 'conv-1',
      status: 'modified',
      newDescription: 'Updated step',
    });
  });

  it('reports missing conversations without blocking the UI projection', async () => {
    const result = await runPlanRejectionRuntime(
      { planId: 'plan-1', conversationId: 'missing-conv' },
      store,
      effects,
    );

    expect(result).toEqual({ persisted: false });
    expect(onMissingConversation).toHaveBeenCalledWith({
      conversationId: 'missing-conv',
      planId: 'plan-1',
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'planStatusUpdate',
        conversationId: 'missing-conv',
        status: 'rejected',
      }),
    );
  });

  function getPlanStatus() {
    return messagesByConversation.get('conv-1')?.[1]?.contentBlocks?.[0]?.plan?.status;
  }

  function getPlanSteps() {
    return messagesByConversation.get('conv-1')?.[1]?.contentBlocks?.[0]?.plan?.steps;
  }
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
