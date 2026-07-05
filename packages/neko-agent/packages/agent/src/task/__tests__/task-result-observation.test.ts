import { describe, expect, it } from 'vitest';
import type { Task } from '@neko/shared';
import {
  AgentTaskResultObservationError,
  createAgentTaskResultObservationRecords,
  evaluateAgentTaskResultDelivery,
  normalizeAgentTaskResultObservation,
} from '../task-result-observation';

describe('task result observation', () => {
  it('normalizes a completed owned task into an Agent observation contract', () => {
    const task = createTask({
      status: 'completed',
      output: {
        data: {
          resultUrls: ['https://cdn.example.test/image.png'],
          assets: [{ id: 'asset-1', mimeType: 'image/png' }],
        },
      },
    });

    const observation = normalizeAgentTaskResultObservation({
      task,
      source: 'task-manager',
      parentToolCallId: 'tool-1',
      now: 30,
    });
    const records = createAgentTaskResultObservationRecords({
      observation,
      outputData: task.output?.data,
      now: 31,
    });

    expect(observation).toMatchObject({
      conversationId: 'conv-1',
      runId: 'run-1',
      taskId: 'task-1',
      status: 'completed',
      parentToolCallId: 'tool-1',
    });
    expect(observation.resultRefs).toEqual([
      { kind: 'url', id: 'https://cdn.example.test/image.png' },
      { kind: 'asset', id: 'asset-1', mimeType: 'image/png' },
    ]);
    expect(records.observation.evidenceIds).toEqual([records.evidence.id]);
    expect(records.evidence.data).toMatchObject({
      taskResultObservation: observation,
    });
  });

  it('rejects unowned terminal tasks', () => {
    const task = createTask({ lifecycle: undefined });

    expect(() =>
      normalizeAgentTaskResultObservation({
        task,
        source: 'task-manager',
      }),
    ).toThrowError(AgentTaskResultObservationError);
  });

  it('rejects terminal tasks without a run lease', () => {
    const task = createTask({
      lifecycle: {
        ownerConversationId: 'conv-1',
        runMode: 'background',
        costPhase: 'idle',
        interruptPolicy: 'detach-and-continue',
        recoverPolicy: 'snapshot-only',
      },
    });

    expect(() =>
      normalizeAgentTaskResultObservation({
        task,
        source: 'task-manager',
      }),
    ).toThrowError(/run lease/);
  });

  it('rejects local paths as durable result refs', () => {
    const task = createTask({
      output: {
        data: {
          resultUrls: ['/Users/feng/cache/image.png'],
        },
      },
    });

    expect(() =>
      normalizeAgentTaskResultObservation({
        task,
        source: 'task-manager',
      }),
    ).toThrowError(/http\(s\)|local/);
  });

  it('normalizes failed and cancelled terminal tasks without claiming successful results', () => {
    const failed = normalizeAgentTaskResultObservation({
      task: createTask({
        status: 'failed',
        error: 'provider failed',
        output: { error: 'provider failed' },
      }),
      source: 'media-task',
    });
    const cancelled = normalizeAgentTaskResultObservation({
      task: createTask({ status: 'cancelled' }),
      source: 'tool-background-task',
    });

    expect(failed).toMatchObject({
      status: 'failed',
      error: 'provider failed',
      summary: expect.stringContaining('failed'),
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      summary: expect.stringContaining('cancelled'),
    });
  });

  it('creates an explicit auto-resume follow-up only from policy', () => {
    const task = createTask();
    const observation = normalizeAgentTaskResultObservation({
      task,
      source: 'task-manager',
    });

    expect(evaluateAgentTaskResultDelivery({ observation })).toEqual({
      kind: 'append-observation',
    });

    const decision = evaluateAgentTaskResultDelivery({
      observation,
      policy: { kind: 'auto-resume-agent', prompt: 'Continue now' },
      now: 40,
    });

    expect(decision).toMatchObject({
      kind: 'auto-resume-agent',
      followUpRequest: {
        conversationId: 'conv-1',
        observationId: observation.id,
        taskId: 'task-1',
        prompt: 'Continue now',
      },
    });
  });

  it('rejects unknown delivery policies visibly', () => {
    const observation = normalizeAgentTaskResultObservation({
      task: createTask(),
      source: 'task-manager',
    });

    expect(() =>
      evaluateAgentTaskResultDelivery({
        observation,
        policy: { kind: 'resume-anyway' } as never,
      }),
    ).toThrowError(AgentTaskResultObservationError);
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
