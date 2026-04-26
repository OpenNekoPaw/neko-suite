import { describe, expect, it, vi } from 'vitest';
import { JournalProjection } from '../journal-projection';
import type { JournalReaderFsOps } from '../journal-reader';
import type { JournalEntry } from '../journal-writer';

function entriesToJsonl(entries: JournalEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

function createMockFsOps(contentByPath: Record<string, string>): JournalReaderFsOps {
  return {
    readFile: vi.fn().mockImplementation(async (filePath: string) => contentByPath[filePath] ?? ''),
    exists: vi.fn().mockImplementation(async (filePath: string) => filePath in contentByPath),
  };
}

describe('JournalProjection', () => {
  it('projects user, assistant, and tool messages from journal events', async () => {
    const filePath = '/tmp/journals/conv-1.jsonl';
    const entries: JournalEntry[] = [
      {
        eventId: 'evt-user',
        seq: 1,
        ts: 1000,
        type: 'event',
        event: { type: 'user_message', content: 'Read package.json' },
      },
      {
        eventId: 'evt-tool-call',
        seq: 2,
        ts: 1100,
        type: 'event',
        event: {
          type: 'tool_call',
          toolCall: { id: 'call-1', name: 'Read', arguments: { path: 'package.json' } },
        },
      },
      {
        eventId: 'evt-tool-result',
        seq: 3,
        ts: 1200,
        type: 'event',
        event: {
          type: 'tool_result',
          toolResult: { toolCallId: 'call-1', success: true, data: { name: 'neko' } },
        },
      },
      {
        eventId: 'evt-text',
        seq: 4,
        ts: 1300,
        type: 'event',
        event: { type: 'text', content: 'Done.' },
      },
    ];
    const projection = new JournalProjection(
      '/tmp/journals',
      createMockFsOps({ [filePath]: entriesToJsonl(entries) }),
    );

    const history = await projection.projectToHistory('conv-1');
    const projected = await projection.projectToHistoryWithEventIds('conv-1');

    expect(history).toHaveLength(4);
    expect(history[0]).toEqual({ role: 'user', content: 'Read package.json' });
    expect(history[1]!.role).toBe('assistant');
    expect(history[1]!.toolCalls?.[0]!.function.name).toBe('Read');
    expect(history[2]).toEqual({
      role: 'tool',
      content: JSON.stringify({ name: 'neko' }),
      toolCallId: 'call-1',
    });
    expect(history[3]).toEqual({ role: 'assistant', content: 'Done.' });
    expect(projected.messageEventIds).toEqual([
      ['evt-user'],
      ['evt-tool-call'],
      ['evt-tool-result'],
      ['evt-text'],
    ]);
  });

  it('merges assistant text and tool calls from the same turn into one message', async () => {
    const filePath = '/tmp/journals/conv-merge.jsonl';
    const entries: JournalEntry[] = [
      {
        seq: 1,
        ts: 1000,
        type: 'event',
        event: { type: 'user_message', content: 'Inspect the file' },
      },
      {
        seq: 2,
        ts: 1100,
        type: 'event',
        event: { type: 'text', content: 'Let me inspect it.' },
      },
      {
        seq: 3,
        ts: 1200,
        type: 'event',
        event: {
          type: 'tool_call',
          toolCall: { id: 'call-1', name: 'Read', arguments: { path: 'a.txt' } },
        },
      },
      {
        seq: 4,
        ts: 1300,
        type: 'event',
        event: {
          type: 'tool_result',
          toolResult: { toolCallId: 'call-1', success: true, data: { ok: true } },
        },
      },
    ];
    const projection = new JournalProjection(
      '/tmp/journals',
      createMockFsOps({ [filePath]: entriesToJsonl(entries) }),
    );

    const history = await projection.projectToHistory('conv-merge');

    expect(history).toEqual([
      { role: 'user', content: 'Inspect the file' },
      {
        role: 'assistant',
        content: 'Let me inspect it.',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'Read', arguments: JSON.stringify({ path: 'a.txt' }) },
          },
        ],
      },
      {
        role: 'tool',
        content: JSON.stringify({ ok: true }),
        toolCallId: 'call-1',
      },
    ]);
  });

  it('applies compaction events by default but can expand raw history on demand', async () => {
    const filePath = '/tmp/journals/conv-compact.jsonl';
    const entries: JournalEntry[] = [
      {
        eventId: 'evt-user-old',
        seq: 1,
        ts: 1000,
        type: 'event',
        event: { type: 'user_message', content: 'old question' },
      },
      {
        eventId: 'evt-text-old',
        seq: 2,
        ts: 1100,
        type: 'event',
        event: { type: 'text', content: 'old answer' },
      },
      {
        seq: 3,
        ts: 1200,
        type: 'event',
        event: {
          type: 'compaction',
          compaction: {
            timestamp: 1200,
            trigger: 'manual',
            replacedEventIds: ['evt-user-old', 'evt-text-old'],
            summaryContent: '[Summary of early turns]',
            summaryMessageRole: 'system',
            tokenProfile: { before: 120, after: 30 },
            strategy: 'basic',
          },
        },
      },
      {
        seq: 4,
        ts: 1300,
        type: 'event',
        event: { type: 'user_message', content: 'new question' },
      },
    ];
    const projection = new JournalProjection(
      '/tmp/journals',
      createMockFsOps({ [filePath]: entriesToJsonl(entries) }),
    );

    const compacted = await projection.projectToHistory('conv-compact');
    const expanded = await projection.projectToHistory('conv-compact', {
      includeCompacted: true,
    });

    expect(compacted).toEqual([
      { role: 'system', content: '[Summary of early turns]' },
      { role: 'user', content: 'new question' },
    ]);
    expect(expanded).toEqual([
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'new question' },
    ]);
  });

  it('builds a summary from projected history', async () => {
    const filePath = '/tmp/journals/conv-2.jsonl';
    const entries: JournalEntry[] = [
      {
        seq: 1,
        ts: 1000,
        type: 'event',
        event: { type: 'user_message', content: 'Implement a durable journal projection' },
      },
      {
        seq: 2,
        ts: 2000,
        type: 'event',
        event: { type: 'text', content: 'Working on it.' },
      },
    ];
    const projection = new JournalProjection(
      '/tmp/journals',
      createMockFsOps({ [filePath]: entriesToJsonl(entries) }),
    );

    const summary = await projection.projectToSummary('conv-2');

    expect(summary).toEqual({
      conversationId: 'conv-2',
      title: 'Implement a durable journal projection',
      createdAt: 1000,
      updatedAt: 2000,
      messageCount: 2,
      source: 'journal-projection',
    });
  });

  it('projects Agent-first observation, evidence, and rationale graph summaries', async () => {
    const filePath = '/tmp/journals/conv-agent-first.jsonl';
    const entries: JournalEntry[] = [
      {
        eventId: 'evt-obs',
        seq: 1,
        ts: 1000,
        type: 'event',
        event: {
          type: 'agent.observation.created',
          agentObservation: {
            id: 'obs-1',
            modality: 'image',
            summary: 'Shot 3 style drifts from the surrounding sequence.',
            confidence: 'medium',
            evidenceIds: ['evidence-1'],
            createdAt: 1000,
            contextPacketId: 'ctx-shot-3',
          },
        },
      },
      {
        eventId: 'evt-evidence',
        seq: 2,
        ts: 1100,
        type: 'event',
        event: {
          type: 'agent.evidence.attached',
          agentEvidence: {
            id: 'evidence-1',
            source: 'tool',
            summary: 'QualityReview found style mismatch in shot 3.',
            observationId: 'obs-1',
            createdAt: 1100,
            contextPacketId: 'ctx-shot-3',
          },
        },
      },
      {
        eventId: 'evt-rationale',
        seq: 3,
        ts: 1200,
        type: 'event',
        event: {
          type: 'agent.rationale.created',
          agentRationale: {
            id: 'rat-1',
            decision: 'recovery-guidance-shot-3',
            reason: 'A low-risk prompt adjustment should be suggested before asking the user.',
            confidence: 'medium',
            observationIds: ['obs-1'],
            evidenceIds: ['evidence-1'],
            createdAt: 1200,
            contextPacketId: 'ctx-shot-3',
          },
        },
      },
    ];
    const projection = new JournalProjection(
      '/tmp/journals',
      createMockFsOps({ [filePath]: entriesToJsonl(entries) }),
    );

    await expect(projection.projectAgentFirstGraph('conv-agent-first')).resolves.toEqual({
      conversationId: 'conv-agent-first',
      observations: [
        {
          id: 'obs-1',
          summary: 'Shot 3 style drifts from the surrounding sequence.',
          confidence: 'medium',
          evidenceIds: ['evidence-1'],
          contextPacketId: 'ctx-shot-3',
        },
      ],
      evidence: [
        {
          id: 'evidence-1',
          source: 'tool',
          summary: 'QualityReview found style mismatch in shot 3.',
          observationId: 'obs-1',
          contextPacketId: 'ctx-shot-3',
        },
      ],
      rationales: [
        {
          id: 'rat-1',
          decision: 'recovery-guidance-shot-3',
          reason: 'A low-risk prompt adjustment should be suggested before asking the user.',
          confidence: 'medium',
          observationIds: ['obs-1'],
          evidenceIds: ['evidence-1'],
          contextPacketId: 'ctx-shot-3',
        },
      ],
    });
  });

  it('projects rationales that reference multiple observations without expiring linked records', async () => {
    const filePath = '/tmp/journals/conv-agent-multi-observation.jsonl';
    const entries: JournalEntry[] = [
      {
        seq: 1,
        ts: 1000,
        type: 'event',
        event: {
          type: 'agent.observation.created',
          agentObservation: {
            id: 'obs-shot-1',
            modality: 'video',
            summary: 'Shot 1 establishes the warm lighting style.',
            confidence: 'high',
            evidenceIds: [],
            createdAt: 1000,
            contextPacketId: 'ctx-sequence',
          },
        },
      },
      {
        seq: 2,
        ts: 1100,
        type: 'event',
        event: {
          type: 'agent.observation.created',
          agentObservation: {
            id: 'obs-shot-3',
            modality: 'video',
            summary: 'Shot 3 uses a cooler palette than the sequence reference.',
            confidence: 'medium',
            evidenceIds: ['evidence-style-compare'],
            createdAt: 1100,
            contextPacketId: 'ctx-sequence',
          },
        },
      },
      {
        seq: 3,
        ts: 1200,
        type: 'event',
        event: {
          type: 'agent.evidence.attached',
          agentEvidence: {
            id: 'evidence-style-compare',
            source: 'tool',
            summary: 'Similarity evidence compares shot 1 and shot 3 style.',
            observationId: 'obs-shot-3',
            createdAt: 1200,
            contextPacketId: 'ctx-sequence',
          },
        },
      },
      {
        seq: 4,
        ts: 1300,
        type: 'event',
        event: {
          type: 'agent.rationale.created',
          agentRationale: {
            id: 'rat-style-align',
            decision: 'adjust-shot-3-style-reference',
            reason: 'Compare the reference shot and target shot before deciding.',
            confidence: 'medium',
            observationIds: ['obs-shot-1', 'obs-shot-3'],
            evidenceIds: ['evidence-style-compare'],
            createdAt: 1300,
            contextPacketId: 'ctx-sequence',
          },
        },
      },
    ];
    const projection = new JournalProjection(
      '/tmp/journals',
      createMockFsOps({ [filePath]: entriesToJsonl(entries) }),
    );

    await expect(
      projection.projectAgentFirstGraph('conv-agent-multi-observation'),
    ).resolves.toEqual(
      expect.objectContaining({
        observations: expect.arrayContaining([
          expect.objectContaining({ id: 'obs-shot-1', contextPacketId: 'ctx-sequence' }),
          expect.objectContaining({ id: 'obs-shot-3', evidenceIds: ['evidence-style-compare'] }),
        ]),
        rationales: [
          expect.objectContaining({
            id: 'rat-style-align',
            observationIds: ['obs-shot-1', 'obs-shot-3'],
            evidenceIds: ['evidence-style-compare'],
          }),
        ],
      }),
    );
    await expect(
      projection.scanAgentFirstIntegrity('conv-agent-multi-observation'),
    ).resolves.toEqual({
      conversationId: 'conv-agent-multi-observation',
      issues: [],
    });
  });

  it('scans Agent-first graph integrity and marks orphan records as expired candidates', async () => {
    const filePath = '/tmp/journals/conv-agent-integrity.jsonl';
    const entries: JournalEntry[] = [
      {
        seq: 1,
        ts: 1000,
        type: 'event',
        event: {
          type: 'agent.observation.created',
          agentObservation: {
            id: 'obs-orphan',
            modality: 'image',
            summary: 'Unreferenced observation.',
            confidence: 'unknown',
            evidenceIds: [],
            createdAt: 1000,
          },
        },
      },
      {
        seq: 2,
        ts: 1100,
        type: 'event',
        event: {
          type: 'agent.observation.created',
          agentObservation: {
            id: 'obs-missing-evidence',
            modality: 'image',
            summary: 'Observation references missing evidence.',
            confidence: 'medium',
            evidenceIds: ['evidence-missing'],
            createdAt: 1100,
          },
        },
      },
      {
        seq: 3,
        ts: 1200,
        type: 'event',
        event: {
          type: 'agent.evidence.attached',
          agentEvidence: {
            id: 'evidence-orphan',
            source: 'tool',
            summary: 'Evidence points at a missing observation.',
            observationId: 'obs-missing',
            createdAt: 1200,
          },
        },
      },
      {
        seq: 4,
        ts: 1300,
        type: 'event',
        event: {
          type: 'agent.rationale.created',
          agentRationale: {
            id: 'rat-missing-links',
            decision: 'continue-with-guidance',
            reason: 'References are stale after migration.',
            confidence: 'low',
            observationIds: ['obs-missing'],
            evidenceIds: ['evidence-missing'],
            createdAt: 1300,
          },
        },
      },
    ];
    const projection = new JournalProjection(
      '/tmp/journals',
      createMockFsOps({ [filePath]: entriesToJsonl(entries) }),
    );

    await expect(projection.scanAgentFirstIntegrity('conv-agent-integrity')).resolves.toEqual({
      conversationId: 'conv-agent-integrity',
      issues: [
        {
          kind: 'orphan-evidence',
          id: 'evidence-orphan',
          missingId: 'obs-missing',
          recommendedStatus: 'expired',
        },
        {
          kind: 'rationale-missing-observation',
          id: 'rat-missing-links',
          missingId: 'obs-missing',
          recommendedStatus: 'expired',
        },
        {
          kind: 'rationale-missing-evidence',
          id: 'rat-missing-links',
          missingId: 'evidence-missing',
          recommendedStatus: 'expired',
        },
        { kind: 'orphan-observation', id: 'obs-orphan', recommendedStatus: 'expired' },
        {
          kind: 'observation-missing-evidence',
          id: 'obs-missing-evidence',
          missingId: 'evidence-missing',
          recommendedStatus: 'expired',
        },
      ],
    });
  });

  it('filters events by type', async () => {
    const filePath = '/tmp/journals/conv-3.jsonl';
    const entries: JournalEntry[] = [
      {
        seq: 1,
        ts: 1000,
        type: 'event',
        event: { type: 'user_message', content: 'one' },
      },
      {
        seq: 2,
        ts: 2000,
        type: 'event',
        event: { type: 'text', content: 'two' },
      },
      {
        seq: 3,
        ts: 3000,
        type: 'event',
        event: { type: 'user_message', content: 'three' },
      },
    ];
    const projection = new JournalProjection(
      '/tmp/journals',
      createMockFsOps({ [filePath]: entriesToJsonl(entries) }),
    );

    const events = [];
    for await (const entry of projection.filterEvents('conv-3', 'user_message')) {
      events.push(entry);
    }

    expect(events).toHaveLength(2);
    expect(events[0]!.event.content).toBe('one');
    expect(events[1]!.event.content).toBe('three');
  });
});
