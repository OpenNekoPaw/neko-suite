import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@neko/shared';
import { createAgentTaskResultObservationCoordinator } from '../task-result-observation-coordinator';

describe('AgentTaskResultObservationCoordinator', () => {
  it('records terminal task observations and dispatches auto-resume through scheduler port', async () => {
    const autoResumeAgent = vi.fn(async () => undefined);
    const record = vi.fn(async (input) => ({
      observationRecorded: true,
      evidenceRecorded: true,
      followUpRecorded: true,
      eventIds: ['event-1'],
      deliveryDecision: {
        kind: 'auto-resume-agent' as const,
        followUpRequest: {
          id: 'followup-1',
          conversationId: input.observation.conversationId,
          runId: input.observation.runId,
          observationId: input.observation.id,
          taskId: input.observation.taskId,
          policy: { kind: 'auto-resume-agent' as const, prompt: 'Continue' },
          prompt: 'Continue',
          createdAt: 30,
        },
      },
    }));
    const coordinator = createAgentTaskResultObservationCoordinator({
      recorder: { record },
      followUpScheduler: { autoResumeAgent },
    });

    await expect(
      coordinator.handleTerminalTask({
        task: createTask({
          lifecycle: {
            ...createTask().lifecycle!,
            resultDeliveryPolicy: { kind: 'auto-resume-agent', prompt: 'Continue' },
          },
        }),
        source: 'task-manager',
      }),
    ).resolves.toMatchObject({ status: 'recorded-and-followup-requested' });
    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0]?.[0].observation).toMatchObject({
      conversationId: 'conv-1',
      runId: 'run-1',
    });
    expect(autoResumeAgent).toHaveBeenCalledOnce();
  });

  it('does not dispatch duplicate follow-up when the recorder ledger already contains it', async () => {
    const autoResumeAgent = vi.fn(async () => undefined);
    const record = vi.fn(async (input) => ({
      observationRecorded: false,
      evidenceRecorded: false,
      followUpRecorded: false,
      eventIds: [],
      deliveryDecision: {
        kind: 'auto-resume-agent' as const,
        followUpRequest: {
          id: 'followup-1',
          conversationId: input.observation.conversationId,
          runId: input.observation.runId,
          observationId: input.observation.id,
          taskId: input.observation.taskId,
          policy: { kind: 'auto-resume-agent' as const, prompt: 'Continue' },
          prompt: 'Continue',
          createdAt: 30,
        },
      },
    }));
    const coordinator = createAgentTaskResultObservationCoordinator({
      recorder: { record },
      followUpScheduler: { autoResumeAgent },
    });

    await expect(
      coordinator.handleTerminalTask({
        task: createTask({
          lifecycle: {
            ...createTask().lifecycle!,
            resultDeliveryPolicy: { kind: 'auto-resume-agent', prompt: 'Continue' },
          },
        }),
        source: 'task-manager',
      }),
    ).resolves.toMatchObject({ status: 'recorded' });
    expect(record).toHaveBeenCalledOnce();
    expect(autoResumeAgent).not.toHaveBeenCalled();
  });

  it('returns a diagnostic for unowned task results', async () => {
    const onDiagnostic = vi.fn();
    const coordinator = createAgentTaskResultObservationCoordinator({
      recorder: {
        record: vi.fn(),
      },
      onDiagnostic,
    });

    const result = await coordinator.handleTerminalTask({
      task: createTask({ lifecycle: undefined }),
      source: 'task-manager',
    });

    expect(result).toMatchObject({
      status: 'diagnostic',
      diagnostic: {
        code: 'missing-owner-conversation',
        taskId: 'task-1',
      },
    });
    expect(onDiagnostic).toHaveBeenCalledOnce();
  });

  it('returns a diagnostic when the terminal event lease does not match the task owner', async () => {
    const onDiagnostic = vi.fn();
    const record = vi.fn();
    const coordinator = createAgentTaskResultObservationCoordinator({
      recorder: { record },
      onDiagnostic,
    });

    const result = await coordinator.handleTerminalTask({
      task: createTask(),
      lease: {
        conversationId: 'conv-1',
        runId: 'run-other',
      },
      source: 'task-manager',
    });

    expect(result).toMatchObject({
      status: 'diagnostic',
      diagnostic: {
        code: 'run-lease-mismatch',
        conversationId: 'conv-1',
        runId: 'run-other',
        taskId: 'task-1',
      },
    });
    expect(record).not.toHaveBeenCalled();
    expect(onDiagnostic).toHaveBeenCalledOnce();
  });
});

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'image_generation',
    status: 'completed',
    input: {
      type: 'image_generation',
      payload: {},
    },
    output: {
      data: {
        resultUrl: 'https://cdn.example.test/image.png',
      },
    },
    progress: 100,
    createdAt: 10,
    updatedAt: 20,
    lifecycle: {
      ownerConversationId: 'conv-1',
      ownerRunId: 'run-1',
      ownerRunStartedAt: 101,
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'snapshot-only',
    },
    ...overrides,
  };
}
