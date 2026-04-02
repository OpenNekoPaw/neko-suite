/**
 * JournalReader Tests — JSONL session event log reading and state reconstruction
 */

import { describe, it, expect, vi } from 'vitest';
import { JournalReader } from '../journal-reader';
import type { JournalReaderFsOps } from '../journal-reader';
import type { JournalEntry } from '../journal-writer';

// =============================================================================
// Mock Helpers
// =============================================================================

function entriesToJsonl(entries: JournalEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

function createMockFsOps(content?: string): JournalReaderFsOps {
  return {
    readFile: vi.fn().mockResolvedValue(content ?? ''),
    exists: vi.fn().mockResolvedValue(content !== undefined),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('JournalReader', () => {
  describe('readAll', () => {
    it('should return empty array for non-existent file', async () => {
      const fsOps = createMockFsOps();
      (fsOps.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const reader = new JournalReader({ filePath: '/tmp/missing.jsonl', fsOps });

      const entries = await reader.readAll();
      expect(entries).toEqual([]);
    });

    it('should parse valid JSONL entries', async () => {
      const entries: JournalEntry[] = [
        { seq: 1, ts: 1000, type: 'event', event: { type: 'text', content: 'hello' } },
        {
          seq: 2,
          ts: 2000,
          type: 'snapshot',
          snapshot: { historyLength: 1, executionMode: 'auto', versionLogSize: 0 },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const result = await reader.readAll();
      expect(result).toHaveLength(2);
      expect(result[0]!.seq).toBe(1);
      expect(result[1]!.type).toBe('snapshot');
    });

    it('should skip corrupted lines', async () => {
      const content = `{"seq":1,"ts":1000,"type":"event","event":{"type":"text","content":"ok"}}
CORRUPTED LINE
{"seq":2,"ts":2000,"type":"snapshot","snapshot":{"historyLength":1,"executionMode":"auto","versionLogSize":0}}
`;
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(content),
      });

      const result = await reader.readAll();
      expect(result).toHaveLength(2);
      expect(result[0]!.seq).toBe(1);
      expect(result[1]!.seq).toBe(2);
    });

    it('should skip empty lines', async () => {
      const content = `{"seq":1,"ts":1000,"type":"event","event":{"type":"text","content":"ok"}}

{"seq":2,"ts":2000,"type":"event","event":{"type":"done"}}
`;
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(content),
      });

      const result = await reader.readAll();
      expect(result).toHaveLength(2);
    });
  });

  describe('readSessionState', () => {
    it('should return null for empty journal', async () => {
      const fsOps = createMockFsOps();
      (fsOps.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const reader = new JournalReader({ filePath: '/tmp/empty.jsonl', fsOps });

      const state = await reader.readSessionState();
      expect(state).toBeNull();
    });

    it('should rebuild history from text events', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'event',
          event: { type: 'text', content: 'Hello from assistant' },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      expect(state).not.toBeNull();
      expect(state!.history).toHaveLength(1);
      expect(state!.history[0]!.role).toBe('assistant');
      expect(state!.history[0]!.content).toBe('Hello from assistant');
    });

    it('should rebuild tool call + tool result sequence', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'event',
          event: {
            type: 'tool_call',
            toolCall: { id: 'tc-1', name: 'ReadFile', arguments: { path: '/a.txt' } },
          },
        },
        {
          seq: 2,
          ts: 2000,
          type: 'event',
          event: {
            type: 'tool_result',
            toolResult: { toolCallId: 'tc-1', success: true, data: 'file content' },
          },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      expect(state!.history).toHaveLength(2);

      // Assistant message with tool call
      const assistant = state!.history[0]!;
      expect(assistant.role).toBe('assistant');
      expect(assistant.toolCalls).toHaveLength(1);
      expect(assistant.toolCalls![0]!.function.name).toBe('ReadFile');

      // Tool result message
      const tool = state!.history[1]!;
      expect(tool.role).toBe('tool');
      expect(tool.toolCallId).toBe('tc-1');
    });

    it('should extract executionMode from last snapshot', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'snapshot',
          snapshot: { historyLength: 5, executionMode: 'plan', versionLogSize: 0 },
        },
        {
          seq: 2,
          ts: 2000,
          type: 'snapshot',
          snapshot: { historyLength: 10, executionMode: 'ask', versionLogSize: 1 },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      expect(state!.executionMode).toBe('ask');
    });

    it('should collect version log entries', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'event',
          event: {
            type: 'version_recorded',
            versionEntry: {
              id: 'v-1',
              toolName: 'GenerateImage',
              toolCallId: 'tc-1',
              parameters: { prompt: 'sunset' },
              resultSuccess: true,
              timestamp: 1000,
              iterationIndex: 0,
            },
          },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      expect(state!.versionLogEntries).toHaveLength(1);
      expect(state!.versionLogEntries[0]!.toolName).toBe('GenerateImage');
    });

    it('should collect SubAgent references', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'subagent_ref',
          subAgentRef: { subAgentId: 'sub-1', journalPath: '/tmp/journals/conv_sub_sub-1.jsonl' },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      expect(state!.subAgentRefs).toHaveLength(1);
      expect(state!.subAgentRefs[0]!.subAgentId).toBe('sub-1');
    });

    it('should track lastSeq correctly', async () => {
      const entries: JournalEntry[] = [
        { seq: 1, ts: 1000, type: 'event', event: { type: 'text', content: 'a' } },
        { seq: 5, ts: 2000, type: 'event', event: { type: 'text', content: 'b' } },
        {
          seq: 3,
          ts: 3000,
          type: 'snapshot',
          snapshot: { historyLength: 2, executionMode: 'auto', versionLogSize: 0 },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      expect(state!.lastSeq).toBe(5);
    });

    it('should handle tool result errors', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'event',
          event: { type: 'tool_call', toolCall: { id: 'tc-1', name: 'Fail', arguments: {} } },
        },
        {
          seq: 2,
          ts: 2000,
          type: 'event',
          event: {
            type: 'tool_result',
            toolResult: { toolCallId: 'tc-1', success: false, data: null, error: 'Not found' },
          },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      const toolMsg = state!.history[1]!;
      expect(toolMsg.role).toBe('tool');
      expect(toolMsg.content).toContain('Error: Not found');
    });

    it('should skip non-history events', async () => {
      const entries: JournalEntry[] = [
        { seq: 1, ts: 1000, type: 'event', event: { type: 'thinking', content: 'hmm' } },
        {
          seq: 2,
          ts: 1001,
          type: 'event',
          event: { type: 'iteration', iteration: { current: 1, max: 10 } },
        },
        {
          seq: 3,
          ts: 1002,
          type: 'event',
          event: { type: 'done', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
        },
        { seq: 4, ts: 1003, type: 'event', event: { type: 'text', content: 'result' } },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      // Only the text event should produce a history entry
      expect(state!.history).toHaveLength(1);
      expect(state!.history[0]!.content).toBe('result');
    });
  });
});
