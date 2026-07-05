import { describe, expect, it, vi } from 'vitest';
import type { ModelCallRecord } from '@neko/platform';
import { createModelCallJsonlRecorder } from '../modelCallJsonlRecorder';

describe('createModelCallJsonlRecorder', () => {
  it('appends model call records as ordered JSONL lines', async () => {
    const writes: string[] = [];
    const fsOps = {
      mkdir: vi.fn(async () => {}),
      appendFile: vi.fn(async (_path: string, data: string) => {
        writes.push(data);
      }),
    };
    const recorder = createModelCallJsonlRecorder({
      filePath: '/workspace/.neko/logs/model-calls.jsonl',
      fsOps,
      now: () => 1234,
    });

    recorder.record(createRecord('request'));
    recorder.record(createRecord('response'));
    await recorder.flush();

    expect(fsOps.mkdir).toHaveBeenCalledTimes(1);
    expect(fsOps.mkdir).toHaveBeenCalledWith('/workspace/.neko/logs', { recursive: true });
    expect(fsOps.appendFile).toHaveBeenCalledTimes(2);
    expect(fsOps.appendFile).toHaveBeenNthCalledWith(
      1,
      '/workspace/.neko/logs/model-calls.jsonl',
      expect.any(String),
      'utf-8',
    );

    const lines = writes
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      expect.objectContaining({
        seq: 1,
        ts: 1234,
        schema: 'neko.model-call.v1',
        kind: 'request',
        payload: { body: 'request' },
      }),
      expect.objectContaining({
        seq: 2,
        ts: 1234,
        schema: 'neko.model-call.v1',
        kind: 'response',
        payload: { body: 'response' },
      }),
    ]);
  });

  it('omits duplicate runId when a model call is scoped by the same turnId', async () => {
    const writes: string[] = [];
    const recorder = createModelCallJsonlRecorder({
      filePath: '/workspace/.neko/logs/model-calls.jsonl',
      fsOps: {
        mkdir: vi.fn(async () => {}),
        appendFile: vi.fn(async (_path: string, data: string) => {
          writes.push(data);
        }),
      },
      now: () => 1234,
    });

    recorder.record(
      createRecord('request', {
        conversationId: 'conv-1',
        turnId: 'turn-conv-1-a',
        runId: 'turn-conv-1-a',
        llmRequestId: 'llm-1',
      }),
    );
    await recorder.flush();

    const [line] = parseWrites(writes);
    expect(line.trace).toEqual({
      conversationId: 'conv-1',
      turnId: 'turn-conv-1-a',
      phase: 'llm',
      llmRequestId: 'llm-1',
    });
    expect(line.partition).toEqual({
      conversationId: 'conv-1',
      turnId: 'turn-conv-1-a',
      requestId: 'llm-1',
    });
    expect(line.partitionSeq).toBe(1);
  });

  it('keeps global seq diagnostic while partition seq is conversation-turn local', async () => {
    const writes: string[] = [];
    const recorder = createModelCallJsonlRecorder({
      filePath: '/workspace/.neko/logs/model-calls.jsonl',
      fsOps: {
        mkdir: vi.fn(async () => {}),
        appendFile: vi.fn(async (_path: string, data: string) => {
          writes.push(data);
        }),
      },
      now: () => 1234,
    });

    recorder.record(
      createRecord('request', {
        conversationId: 'conv-a',
        turnId: 'turn-a',
        llmRequestId: 'llm-a',
      }),
    );
    recorder.record(
      createRecord('request', {
        conversationId: 'conv-b',
        turnId: 'turn-b',
        llmRequestId: 'llm-b',
      }),
    );
    recorder.record(
      createRecord('response', {
        conversationId: 'conv-a',
        turnId: 'turn-a',
        llmRequestId: 'llm-a',
      }),
    );
    await recorder.flush();

    const lines = parseWrites(writes);
    expect(lines.map((line) => line.seq)).toEqual([1, 2, 3]);
    expect(lines.map((line) => line.partitionSeq)).toEqual([1, 1, 2]);
    expect(lines.map((line) => line.partition)).toEqual([
      { conversationId: 'conv-a', turnId: 'turn-a', requestId: 'llm-a' },
      { conversationId: 'conv-b', turnId: 'turn-b', requestId: 'llm-b' },
      { conversationId: 'conv-a', turnId: 'turn-a', requestId: 'llm-a' },
    ]);
  });

  it('routes records to conversation-owned files with file-local seq', async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const recorder = createModelCallJsonlRecorder({
      resolveFilePath: ({ trace }) =>
        `/workspace/.neko/logs/conversations/${trace.conversationId}/model-calls.jsonl`,
      writerId: 'writer-model-calls',
      fsOps: {
        mkdir: vi.fn(async () => {}),
        appendFile: vi.fn(async (path: string, data: string) => {
          writes.push({ path, data });
        }),
      },
      now: () => 1234,
    });

    recorder.record(
      createRecord('request', {
        conversationId: 'conv-a',
        turnId: 'turn-a',
        llmRequestId: 'llm-a',
      }),
    );
    recorder.record(
      createRecord('request', {
        conversationId: 'conv-b',
        turnId: 'turn-b',
        llmRequestId: 'llm-b',
      }),
    );
    recorder.record(
      createRecord('response', {
        conversationId: 'conv-a',
        turnId: 'turn-a',
        llmRequestId: 'llm-a',
      }),
    );
    await recorder.flush();

    const convALines = parseWritesForPath(
      writes,
      '/workspace/.neko/logs/conversations/conv-a/model-calls.jsonl',
    );
    const convBLines = parseWritesForPath(
      writes,
      '/workspace/.neko/logs/conversations/conv-b/model-calls.jsonl',
    );

    expect(convALines.map((line) => line.writerId)).toEqual([
      'writer-model-calls',
      'writer-model-calls',
    ]);
    expect(convALines.map((line) => line.seq)).toEqual([1, 2]);
    expect(convBLines.map((line) => line.writerId)).toEqual(['writer-model-calls']);
    expect(convALines.map((line) => line.partitionSeq)).toEqual([1, 2]);
    expect(convBLines.map((line) => line.seq)).toEqual([1]);
    expect(convBLines.map((line) => line.partitionSeq)).toEqual([1]);
    expect(writes.map((write) => write.path)).not.toContain('/workspace/.neko/logs/model-calls.jsonl');
  });

  it('requires either a fixed filePath or a file path resolver', () => {
    expect(() => createModelCallJsonlRecorder({})).toThrow(/filePath or resolveFilePath/);
  });
});

function createRecord(
  kind: ModelCallRecord['kind'],
  trace: Partial<ModelCallRecord['trace']> = {},
): ModelCallRecord {
  const conversationId = trace.conversationId ?? 'conv-1';
  const llmRequestId = trace.llmRequestId ?? 'llm-1';
  return {
    schema: 'neko.model-call.v1',
    kind,
    requestId: llmRequestId,
    timestamp: 1000,
    providerId: 'openai',
    modelId: 'gpt-4',
    stream: true,
    attempt: 1,
    trace: { conversationId, phase: 'llm', llmRequestId, ...trace },
    payload: { body: kind },
  };
}

function parseWrites(writes: readonly string[]): Array<Record<string, unknown>> {
  return writes
    .join('')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function parseWritesForPath(
  writes: readonly { path: string; data: string }[],
  path: string,
): Array<Record<string, unknown>> {
  return writes
    .filter((write) => write.path === path)
    .flatMap((write) => write.data.trim().split('\n'))
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
