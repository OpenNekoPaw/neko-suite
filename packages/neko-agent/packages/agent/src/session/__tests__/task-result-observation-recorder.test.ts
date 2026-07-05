import { describe, expect, it, vi } from 'vitest';
import type { AgentTaskResultObservation } from '@neko/shared';
import type { AgentEvent } from '../types';
import {
  createAgentTaskResultObservationLedger,
  createSessionTaskResultObservationRecorder,
  type TaskResultObservationJournalEntry,
} from '../task-result-observation-recorder';

describe('SessionTaskResultObservationRecorder', () => {
  it('writes observation, evidence, and follow-up request once', async () => {
    const writer = createWriter();
    const recorder = createSessionTaskResultObservationRecorder({
      journalWriter: writer,
      nextSeq: createSeq(),
    });
    const observation = createObservation();

    const result = await recorder.record({
      observation,
      outputData: { resultUrl: 'https://cdn.example.test/image.png' },
      deliveryPolicy: { kind: 'auto-resume-agent', prompt: 'Continue' },
      now: 30,
    });

    expect(result).toMatchObject({
      observationRecorded: true,
      evidenceRecorded: true,
      followUpRecorded: true,
      deliveryDecision: {
        kind: 'auto-resume-agent',
      },
    });
    expect(writer.appendEvent).toHaveBeenCalledTimes(3);
    expect(writer.appendEvent).toHaveBeenNthCalledWith(
      1,
      1,
      expect.objectContaining({ type: 'agent.observation.created' }),
    );
    expect(writer.appendEvent).toHaveBeenNthCalledWith(
      2,
      2,
      expect.objectContaining({ type: 'agent.evidence.attached' }),
    );
    expect(writer.appendEvent).toHaveBeenNthCalledWith(
      3,
      3,
      expect.objectContaining({ type: 'agent.task_result.followup_requested' }),
    );
  });

  it('uses existing journal entries as an idempotence ledger', async () => {
    const observation = createObservation();
    const firstWriter = createWriter();
    const firstRecorder = createSessionTaskResultObservationRecorder({
      journalWriter: firstWriter,
      nextSeq: createSeq(),
    });
    await firstRecorder.record({
      observation,
      deliveryPolicy: { kind: 'auto-resume-agent' },
      now: 30,
    });
    const existingEntries: TaskResultObservationJournalEntry[] = firstWriter.events.map(
      (event) => ({ event }),
    );
    const ledger = createAgentTaskResultObservationLedger(existingEntries);
    expect(ledger.observationIds.has(observation.id)).toBe(true);

    const secondWriter = createWriter();
    const secondRecorder = createSessionTaskResultObservationRecorder({
      journalWriter: secondWriter,
      nextSeq: createSeq(),
    });
    const second = await secondRecorder.record({
      observation,
      deliveryPolicy: { kind: 'auto-resume-agent' },
      existingEntries,
      now: 31,
    });

    expect(second).toMatchObject({
      observationRecorded: false,
      evidenceRecorded: false,
      followUpRecorded: false,
    });
    expect(secondWriter.appendEvent).not.toHaveBeenCalled();
  });
});

function createObservation(): AgentTaskResultObservation {
  return {
    id: 'task-result-observation:test',
    conversationId: 'conv-1',
    runId: 'run-1',
    taskId: 'task-1',
    source: 'task-manager',
    taskType: 'image_generation',
    status: 'completed',
    summary: 'Task completed.',
    createdAt: 10,
    completedAt: 20,
  };
}

function createWriter() {
  const events: AgentEvent[] = [];
  return {
    events,
    appendEvent: vi.fn(async (_seq: number, event: AgentEvent) => {
      events.push(event);
      return `event-${events.length}`;
    }),
    appendSnapshot: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

function createSeq(): () => number {
  let seq = 0;
  return () => {
    seq += 1;
    return seq;
  };
}
