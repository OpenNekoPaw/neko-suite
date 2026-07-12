import { describe, expect, it, vi } from 'vitest';
import type { AgentTaskResultObservation, Task, TaskRunScope } from '@neko/shared';
import type { TaskTerminalEvent } from '@neko/agent';
import { TaskResultObservationCoordinator } from './taskResultObservationCoordinator';

describe('TaskResultObservationCoordinator', () => {
  it('queues auto-resume follow-up through runner when the Agent is running', async () => {
    const task = createTask({
      type: 'workflow',
      input: {
        type: 'workflow',
        payload: {},
      },
      lifecycle: {
        ...createTask().lifecycle!,
        resultDeliveryPolicy: { kind: 'auto-resume-agent', prompt: 'Continue' },
      },
    });
    let terminalListener: ((event: TaskTerminalEvent) => void) | undefined;
    const enqueuePendingMessage = vi.fn(() => ({
      id: 'queue-1',
      conversationId: 'conv-1',
      content: 'Continue',
      createdAt: 30,
      source: 'task-result-continuation' as const,
    }));
    const recordTaskResultObservation = vi.fn(async (input) => ({
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
    const coordinator = new TaskResultObservationCoordinator({
      tasks: {
        onTerminalTask: (listener) => {
          terminalListener = listener;
          return () => undefined;
        },
        list: vi.fn(),
      } as never,
      agents: {
        get: vi.fn(() => ({
          recordTaskResultObservation,
          enqueuePendingMessage,
        })),
        isRunning: vi.fn(() => true),
      } as never,
    });

    terminalListener?.({
      task,
      scope: task.scope,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordTaskResultObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        observation: expect.objectContaining({
          conversationId: 'conv-1',
          runId: 'run-1',
          taskId: 'task-1',
        }) satisfies Partial<{ observation: AgentTaskResultObservation }>,
      }),
    );
    expect(enqueuePendingMessage).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      content: 'Continue',
      source: 'task-result-continuation',
    });
    coordinator.dispose();
  });

  it('does not auto-resume media generation tasks from the generic TaskManager observer', async () => {
    const task = createTask({
      lifecycle: {
        ...createTask().lifecycle!,
        recoverPolicy: 'resume-polling',
        resultDeliveryPolicy: { kind: 'auto-resume-agent' },
      },
      output: {
        data: {
          outputs: [
            {
              type: 'image',
              url: 'https://cdn.example.test/task-1.png',
              mimeType: 'image/png',
            },
          ],
        },
      },
    });
    let terminalListener: ((event: TaskTerminalEvent) => void) | undefined;
    const recordTaskResultObservation = vi.fn(async (input) => ({
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
          policy: { kind: 'auto-resume-agent' as const },
          prompt: 'Continue from the completed async task result.',
          createdAt: 30,
        },
      },
    }));
    const dispatchIdleAgentTurn = vi.fn(async () => undefined);
    const coordinator = new TaskResultObservationCoordinator({
      tasks: {
        onTerminalTask: (listener) => {
          terminalListener = listener;
          return () => undefined;
        },
        list: vi.fn(),
      } as never,
      agents: {
        get: vi.fn(() => ({
          recordTaskResultObservation,
          enqueuePendingMessage: vi.fn(),
        })),
        isRunning: vi.fn(() => false),
      } as never,
      continuation: { dispatchIdleAgentTurn },
    });

    terminalListener?.({
      task,
      scope: task.scope,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordTaskResultObservation).not.toHaveBeenCalled();
    expect(dispatchIdleAgentTurn).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('dispatches idle auto-resume through the continuation turn port', async () => {
    const task = createTask({
      lifecycle: {
        ...createTask().lifecycle!,
        resultDeliveryPolicy: { kind: 'auto-resume-agent', prompt: 'Continue' },
      },
    });
    const dispatchIdleAgentTurn = vi.fn(async () => undefined);
    const recordTaskResultObservation = vi.fn(async (input) => ({
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
    const coordinator = new TaskResultObservationCoordinator({
      tasks: createTaskPort(),
      agents: {
        get: vi.fn(() => ({
          recordTaskResultObservation,
          enqueuePendingMessage: vi.fn(),
        })),
        isRunning: vi.fn(() => false),
      } as never,
      continuation: { dispatchIdleAgentTurn },
    });

    await coordinator.handleTerminalTask(task);

    expect(dispatchIdleAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        taskId: 'task-1',
        prompt: 'Continue',
      }),
    );
    coordinator.dispose();
  });

  it('surfaces ask-user policy through the continuation request port', async () => {
    const task = createTask({
      lifecycle: {
        ...createTask().lifecycle!,
        resultDeliveryPolicy: { kind: 'ask-user-to-continue', prompt: 'Continue?' },
      },
    });
    const requestUserContinuation = vi.fn(async () => undefined);
    const recordTaskResultObservation = vi.fn(async (input) => ({
      observationRecorded: true,
      evidenceRecorded: true,
      followUpRecorded: true,
      eventIds: ['event-1'],
      deliveryDecision: {
        kind: 'ask-user-to-continue' as const,
        followUpRequest: {
          id: 'followup-1',
          conversationId: input.observation.conversationId,
          runId: input.observation.runId,
          observationId: input.observation.id,
          taskId: input.observation.taskId,
          policy: { kind: 'ask-user-to-continue' as const, prompt: 'Continue?' },
          prompt: 'Continue?',
          createdAt: 30,
        },
      },
    }));
    const coordinator = new TaskResultObservationCoordinator({
      tasks: createTaskPort(),
      agents: {
        get: vi.fn(() => ({
          recordTaskResultObservation,
          enqueuePendingMessage: vi.fn(),
        })),
        isRunning: vi.fn(() => false),
      } as never,
      continuation: { requestUserContinuation },
    });

    await coordinator.handleTerminalTask(task);

    expect(requestUserContinuation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        taskId: 'task-1',
        prompt: 'Continue?',
      }),
    );
    coordinator.dispose();
  });

  it('does not dispatch duplicate follow-up requests during reconciliation', async () => {
    const dispatchIdleAgentTurn = vi.fn(async () => undefined);
    const recordTaskResultObservation = vi.fn(async (input) => ({
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
    const coordinator = new TaskResultObservationCoordinator({
      tasks: {
        ...createTaskPort(),
        list: vi.fn(async () => [
          createTask({
            type: 'workflow',
            input: {
              type: 'workflow',
              payload: {},
            },
            lifecycle: {
              ...createTask().lifecycle!,
              resultDeliveryPolicy: { kind: 'auto-resume-agent', prompt: 'Continue' },
            },
          }),
        ]),
      } as never,
      agents: {
        get: vi.fn(() => ({
          recordTaskResultObservation,
          enqueuePendingMessage: vi.fn(),
        })),
        isRunning: vi.fn(() => false),
      } as never,
      continuation: { dispatchIdleAgentTurn },
    });

    await coordinator.reconcileTerminalTasks();

    expect(recordTaskResultObservation).toHaveBeenCalled();
    expect(dispatchIdleAgentTurn).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('serializes duplicate terminal task observations before dispatching follow-up', async () => {
    const task = createTask({
      lifecycle: {
        ...createTask().lifecycle!,
        resultDeliveryPolicy: { kind: 'auto-resume-agent', prompt: 'Continue' },
      },
    });
    const dispatchIdleAgentTurn = vi.fn(async () => undefined);
    let committed = false;
    let activeRecordings = 0;
    let maxActiveRecordings = 0;
    const recordTaskResultObservation = vi.fn(async (input) => {
      activeRecordings += 1;
      maxActiveRecordings = Math.max(maxActiveRecordings, activeRecordings);
      const followUpRecorded = !committed;
      await Promise.resolve();
      committed = true;
      activeRecordings -= 1;
      return {
        observationRecorded: followUpRecorded,
        evidenceRecorded: followUpRecorded,
        followUpRecorded,
        eventIds: followUpRecorded ? ['event-1'] : [],
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
      };
    });
    const coordinator = new TaskResultObservationCoordinator({
      tasks: createTaskPort(),
      agents: {
        get: vi.fn(() => ({
          recordTaskResultObservation,
          enqueuePendingMessage: vi.fn(),
        })),
        isRunning: vi.fn(() => false),
      } as never,
      continuation: { dispatchIdleAgentTurn },
    });

    await Promise.all([
      coordinator.handleTerminalTask(task, { source: 'media-task' }),
      coordinator.handleTerminalTask(task, { source: 'task-manager' }),
    ]);

    expect(recordTaskResultObservation).toHaveBeenCalledTimes(2);
    expect(maxActiveRecordings).toBe(1);
    expect(dispatchIdleAgentTurn).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });
});

function createTaskPort() {
  return {
    onTerminalTask: vi.fn(() => () => undefined),
    list: vi.fn(async () => []),
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? 'task-1';
  return {
    scope: overrides.scope ?? taskScope(id),
    id,
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

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}
