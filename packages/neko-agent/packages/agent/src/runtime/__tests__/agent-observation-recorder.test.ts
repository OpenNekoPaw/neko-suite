import { describe, expect, it, vi } from 'vitest';
import type { AgentObservation, DecisionRationale, PerceptionEvidence } from '@neko/shared';
import { createAgentObservationRecorder } from '../agent-observation-recorder';

const observation: AgentObservation = {
  id: 'obs-1',
  modality: 'image',
  summary: 'A character with blue hair.',
  confidence: 'high',
  evidenceIds: [],
  createdAt: 1,
};

const evidence: PerceptionEvidence = {
  id: 'evidence-1',
  source: 'tool',
  summary: 'Tool confirms blue hair.',
  observationId: observation.id,
  confidence: 0.9,
  createdAt: 2,
};

const rationale: DecisionRationale = {
  id: 'rat-1',
  decision: 'answer-hair-color',
  reason: 'The observation is sufficiently clear.',
  confidence: 'high',
  observationIds: [observation.id],
  evidenceIds: [evidence.id],
  createdAt: 3,
};

function createAppendEventMock() {
  return vi.fn(async (seq: number, _event: unknown) => `event-${seq}`);
}

function createNextSeq(): () => number {
  let seq = 0;
  return () => ++seq;
}

describe('AgentObservationRecorder', () => {
  it('writes observation, evidence, and rationale as Journal events', async () => {
    const appendEvent = createAppendEventMock();
    const recorder = createAgentObservationRecorder({
      journalWriter: {
        appendEvent,
        appendSnapshot: vi.fn(),
        flush: vi.fn(),
        dispose: vi.fn(),
      },
      nextSeq: createNextSeq(),
      contextPacketId: 'ctx-test',
    });

    await expect(recorder.recordObservation(observation)).resolves.toBe('event-1');
    await expect(recorder.attachEvidence(evidence)).resolves.toBe('event-2');
    await expect(recorder.recordDecisionRationale(rationale)).resolves.toBe('event-3');

    expect(appendEvent).toHaveBeenNthCalledWith(1, 1, {
      type: 'agent.observation.created',
      agentObservation: { ...observation, contextPacketId: 'ctx-test' },
    });
    expect(appendEvent).toHaveBeenNthCalledWith(2, 2, {
      type: 'agent.evidence.attached',
      agentEvidence: { ...evidence, contextPacketId: 'ctx-test' },
    });
    expect(appendEvent).toHaveBeenNthCalledWith(3, 3, {
      type: 'agent.rationale.created',
      agentRationale: { ...rationale, contextPacketId: 'ctx-test' },
    });
  });

  it('attaches current context packet id without overriding explicit ids', async () => {
    const appendEvent = createAppendEventMock();
    const recorder = createAgentObservationRecorder({
      journalWriter: {
        appendEvent,
        appendSnapshot: vi.fn(),
        flush: vi.fn(),
        dispose: vi.fn(),
      },
      nextSeq: createNextSeq(),
      contextPacketId: 'ctx-current-turn',
    });

    await recorder.recordObservation(observation);
    await recorder.attachEvidence({ ...evidence, contextPacketId: 'ctx-explicit' });
    await recorder.recordDecisionRationale(rationale);

    expect(appendEvent).toHaveBeenNthCalledWith(1, 1, {
      type: 'agent.observation.created',
      agentObservation: { ...observation, contextPacketId: 'ctx-current-turn' },
    });
    expect(appendEvent).toHaveBeenNthCalledWith(2, 2, {
      type: 'agent.evidence.attached',
      agentEvidence: { ...evidence, contextPacketId: 'ctx-explicit' },
    });
    expect(appendEvent).toHaveBeenNthCalledWith(3, 3, {
      type: 'agent.rationale.created',
      agentRationale: { ...rationale, contextPacketId: 'ctx-current-turn' },
    });
  });

  it('rejects rationale with unknown observation or evidence references', async () => {
    const appendEvent = createAppendEventMock();
    const recorder = createAgentObservationRecorder({
      journalWriter: {
        appendEvent,
        appendSnapshot: vi.fn(),
        flush: vi.fn(),
        dispose: vi.fn(),
      },
      nextSeq: createNextSeq(),
      contextPacketId: 'ctx-test',
    });

    await recorder.recordObservation(observation);

    await expect(async () => recorder.recordDecisionRationale(rationale)).rejects.toThrow(
      'evidence=evidence-1',
    );
    expect(appendEvent).toHaveBeenCalledTimes(1);

    await expect(async () =>
      recorder.recordDecisionRationale({
        ...rationale,
        observationIds: ['obs-missing'],
        evidenceIds: [],
      }),
    ).rejects.toThrow('observations=obs-missing');
  });

  it('requires a context packet id before writing Agent-first records', () => {
    expect(() =>
      createAgentObservationRecorder({
        journalWriter: {
          appendEvent: createAppendEventMock(),
          appendSnapshot: vi.fn(),
          flush: vi.fn(),
          dispose: vi.fn(),
        },
        nextSeq: createNextSeq(),
        contextPacketId: '',
      }),
    ).toThrow('contextPacketId');
  });
});
