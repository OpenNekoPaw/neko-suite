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
});

function createRecord(kind: ModelCallRecord['kind']): ModelCallRecord {
  return {
    schema: 'neko.model-call.v1',
    kind,
    requestId: 'llm-1',
    timestamp: 1000,
    providerId: 'openai',
    modelId: 'gpt-4',
    stream: true,
    attempt: 1,
    trace: { conversationId: 'conv-1', phase: 'llm', llmRequestId: 'llm-1' },
    payload: { body: kind },
  };
}
