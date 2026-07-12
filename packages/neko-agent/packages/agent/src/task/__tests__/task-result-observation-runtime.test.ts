import { describe, expect, it, vi } from 'vitest';
import type { Task, TaskRunScope } from '@neko/shared';
import {
  createAgentTaskResultObservationRuntime,
  type AgentTaskResultObservationRuntimeTaskPort,
} from '../task-result-observation-runtime';

describe('AgentTaskResultObservationRuntime', () => {
  it('records terminal task observations and dispatches auto-resume through injected host ports', async () => {
    const terminalListeners: Array<
      (event: { readonly task: Task; readonly scope: TaskRunScope }) => void
    > = [];
    const tasks: AgentTaskResultObservationRuntimeTaskPort = {
      onTerminalTask: (listener) => {
        terminalListeners.push(listener);
        return () => undefined;
      },
      list: vi.fn(async () => []),
    };
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
    const dispatchIdleAgentTurn = vi.fn(async () => undefined);
    const runtime = createAgentTaskResultObservationRuntime({
      tasks,
      agents: {
        get: () => ({ recordTaskResultObservation }),
        isRunning: () => false,
      },
      continuation: { dispatchIdleAgentTurn },
    });

    {
      const task = createTaskWithAutoResumePolicy();
      terminalListeners[0]?.({ task, scope: task.scope });
    }
    await runtime.flush();

    expect(recordTaskResultObservation).toHaveBeenCalledOnce();
    expect(recordTaskResultObservation.mock.calls[0]?.[0].observation).toMatchObject({
      conversationId: 'conv-1',
      runId: 'run-1',
      taskId: 'task-1',
    });
    expect(dispatchIdleAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        runId: 'run-1',
        taskId: 'task-1',
        prompt: 'Continue',
      }),
    );
    runtime.dispose();
  });

  it('lets the host skip TaskManager terminal observations during subscription and reconciliation', async () => {
    const terminalListeners: Array<
      (event: { readonly task: Task; readonly scope: TaskRunScope }) => void
    > = [];
    const task = createTaskWithAutoResumePolicy();
    const tasks: AgentTaskResultObservationRuntimeTaskPort = {
      onTerminalTask: (listener) => {
        terminalListeners.push(listener);
        return () => undefined;
      },
      list: vi.fn(async () => [task]),
    };
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
    const shouldObserveTaskManagerTerminalTask = vi.fn(() => false);
    const runtime = createAgentTaskResultObservationRuntime({
      tasks,
      agents: {
        get: () => ({ recordTaskResultObservation }),
        isRunning: () => false,
      },
      continuation: { dispatchIdleAgentTurn: vi.fn(async () => undefined) },
      shouldObserveTaskManagerTerminalTask,
    });

    terminalListeners[0]?.({ task, scope: task.scope });
    await runtime.flush();
    await runtime.reconcileTerminalTasks();

    expect(shouldObserveTaskManagerTerminalTask).toHaveBeenCalled();
    expect(recordTaskResultObservation).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('waits for explicit wait-all task groups before dispatching follow-up', async () => {
    const first = createTaskWithAutoResumePolicy({
      id: 'task-1',
      group: {
        taskGroupId: 'group-1',
        resultDeliveryPolicy: 'wait-all',
        expectedTaskIds: ['task-1', 'task-2'],
      },
    });
    const second = createTaskWithAutoResumePolicy({
      id: 'task-2',
      group: {
        taskGroupId: 'group-1',
        resultDeliveryPolicy: 'wait-all',
        expectedTaskIds: ['task-1', 'task-2'],
      },
    });
    const terminalTasks: Task[] = [first];
    const tasks: AgentTaskResultObservationRuntimeTaskPort = {
      onTerminalTask: () => () => undefined,
      list: vi.fn(async () => terminalTasks),
    };
    const recordTaskResultObservation = vi.fn(async (input) =>
      input.deliveryPolicy?.kind === 'append-observation'
        ? {
            observationRecorded: true,
            evidenceRecorded: true,
            followUpRecorded: false,
            eventIds: ['event-1'],
            deliveryDecision: { kind: 'append-observation' as const },
          }
        : createAutoResumeRecord(input),
    );
    const dispatchIdleAgentTurn = vi.fn(async () => undefined);
    const runtime = createAgentTaskResultObservationRuntime({
      tasks,
      agents: {
        get: () => ({ recordTaskResultObservation }),
        isRunning: () => false,
      },
      continuation: { dispatchIdleAgentTurn },
    });

    await runtime.handleTerminalTask(first);
    expect(dispatchIdleAgentTurn).not.toHaveBeenCalled();
    expect(recordTaskResultObservation.mock.calls[0]?.[0].deliveryPolicy).toEqual({
      kind: 'append-observation',
    });

    terminalTasks.push(second);
    await runtime.handleTerminalTask(second);
    expect(dispatchIdleAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-2' }),
    );
    runtime.dispose();
  });

  it('does not let an equal local task ID from another owner scope satisfy wait-all', async () => {
    const group = {
      taskGroupId: 'group-1',
      resultDeliveryPolicy: 'wait-all' as const,
      expectedTaskIds: ['task-1', 'task-2'],
    };
    const first = createTaskWithAutoResumePolicy({ id: 'task-1', group });
    const sameLocalIdInOtherConversation = createTaskWithAutoResumePolicy({
      id: 'task-2',
      conversationId: 'conv-2',
      runId: 'run-2',
      group,
    });
    const second = createTaskWithAutoResumePolicy({ id: 'task-2', group });
    const terminalTasks: Task[] = [first, sameLocalIdInOtherConversation];
    const tasks: AgentTaskResultObservationRuntimeTaskPort = {
      onTerminalTask: () => () => undefined,
      list: vi.fn(async () => terminalTasks),
    };
    const recordTaskResultObservation = vi.fn(async (input) =>
      input.deliveryPolicy?.kind === 'append-observation'
        ? {
            observationRecorded: true,
            evidenceRecorded: true,
            followUpRecorded: false,
            eventIds: ['event-1'],
            deliveryDecision: { kind: 'append-observation' as const },
          }
        : createAutoResumeRecord(input),
    );
    const dispatchIdleAgentTurn = vi.fn(async () => undefined);
    const runtime = createAgentTaskResultObservationRuntime({
      tasks,
      agents: {
        get: () => ({ recordTaskResultObservation }),
        isRunning: () => false,
      },
      continuation: { dispatchIdleAgentTurn },
    });

    await runtime.handleTerminalTask(first);

    expect(recordTaskResultObservation.mock.calls[0]?.[0].deliveryPolicy).toEqual({
      kind: 'append-observation',
    });
    expect(dispatchIdleAgentTurn).not.toHaveBeenCalled();

    terminalTasks.push(second);
    await runtime.handleTerminalTask(second);

    expect(dispatchIdleAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', runId: 'run-1', taskId: 'task-2' }),
    );
    runtime.dispose();
  });

  it('does not infer task groups when explicit group metadata is missing', async () => {
    const first = createTaskWithAutoResumePolicy({ id: 'task-1' });
    const second = createTaskWithAutoResumePolicy({ id: 'task-2' });
    const tasks: AgentTaskResultObservationRuntimeTaskPort = {
      onTerminalTask: () => () => undefined,
      list: vi.fn(async () => [first, second]),
    };
    const recordTaskResultObservation = vi.fn(async (input) => createAutoResumeRecord(input));
    const dispatchIdleAgentTurn = vi.fn(async () => undefined);
    const runtime = createAgentTaskResultObservationRuntime({
      tasks,
      agents: {
        get: () => ({ recordTaskResultObservation }),
        isRunning: () => false,
      },
      continuation: { dispatchIdleAgentTurn },
    });

    await runtime.handleTerminalTask(first);

    expect(recordTaskResultObservation.mock.calls[0]?.[0].deliveryPolicy).toEqual({
      kind: 'auto-resume-agent',
      prompt: 'Continue',
    });
    expect(dispatchIdleAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' }),
    );
    runtime.dispose();
  });
});

function taskScope(
  childRunId: string,
  conversationId = 'conv-1',
  runId = 'run-1',
  parentRunId = runId,
): TaskRunScope {
  return {
    conversationId,
    runId,
    parentRunId,
    childRunId,
    childKind: 'task',
  };
}

function createTaskWithAutoResumePolicy(
  options: {
    readonly id?: string;
    readonly conversationId?: string;
    readonly runId?: string;
    readonly parentRunId?: string;
    readonly group?: NonNullable<Task['lifecycle']>['resultDeliveryGroup'];
  } = {},
): Task {
  const id = options.id ?? 'task-1';
  const conversationId = options.conversationId ?? 'conv-1';
  const runId = options.runId ?? 'run-1';
  return {
    scope: taskScope(id, conversationId, runId, options.parentRunId),
    id,
    type: 'image_generation',
    status: 'completed',
    input: {
      type: 'image_generation',
      payload: {},
    },
    output: {
      data: {
        resultUrls: ['https://cdn.example.test/task-1.png'],
      },
    },
    progress: 100,
    createdAt: 10,
    updatedAt: 20,
    lifecycle: {
      ownerConversationId: conversationId,
      ownerRunId: runId,
      ownerRunStartedAt: 101,
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'snapshot-only',
      resultDeliveryPolicy: { kind: 'auto-resume-agent', prompt: 'Continue' },
      ...(options.group ? { resultDeliveryGroup: options.group } : {}),
    },
  };
}

function createAutoResumeRecord(input: {
  readonly observation: {
    readonly conversationId: string;
    readonly runId: string;
    readonly id: string;
    readonly taskId: string;
  };
}) {
  return {
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
  };
}
