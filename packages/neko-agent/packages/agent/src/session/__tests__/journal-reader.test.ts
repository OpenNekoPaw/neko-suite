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
      expect(result[0]!.eventId).toMatch(/^fallback-1-1000-0-[a-f0-9]{12}$/);
      expect(result[1]!.eventId).toMatch(/^fallback-2-2000-2-[a-f0-9]{12}$/);
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

    it('derives unique fallback event ids even when seq/timestamp collide', async () => {
      const content = `{"seq":1,"ts":1000,"type":"event","event":{"type":"text","content":"first"}}
{"seq":1,"ts":1000,"type":"event","event":{"type":"text","content":"second"}}
`;
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(content),
      });

      const result = await reader.readAll();
      expect(result).toHaveLength(2);
      expect(result[0]!.eventId).not.toBe(result[1]!.eventId);
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

    it('should rebuild user messages from journal events', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'event',
          event: { type: 'user_message', content: 'Hello from user' },
        },
        {
          seq: 2,
          ts: 2000,
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
      expect(state!.history).toHaveLength(2);
      expect(state!.history[0]).toEqual({ role: 'user', content: 'Hello from user' });
      expect(state!.history[1]).toEqual({ role: 'assistant', content: 'Hello from assistant' });
    });

    it('should apply compaction events when rebuilding history', async () => {
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
          ts: 2000,
          type: 'event',
          event: { type: 'text', content: 'old answer' },
        },
        {
          seq: 3,
          ts: 3000,
          type: 'event',
          event: {
            type: 'compaction',
            compaction: {
              timestamp: 3000,
              trigger: 'manual',
              replacedEventIds: ['evt-user-old', 'evt-text-old'],
              summaryContent: 'summary',
              summaryMessageRole: 'system',
              tokenProfile: { before: 100, after: 20 },
              strategy: 'basic',
            },
          },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      expect(state!.history).toEqual([{ role: 'system', content: 'summary' }]);
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

    it('should patch projected tool result history from backfill events', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'event',
          event: {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-1',
              success: true,
              data: { taskId: 'task-1', status: 'queued', prompt: 'rain' },
            },
          },
        },
        {
          seq: 2,
          ts: 1001,
          type: 'event',
          event: {
            type: 'tool_result_backfill',
            toolResultBackfill: {
              toolCallId: 'tc-1',
              timestamp: 1001,
              dataPatch: {
                status: 'completed',
                width: 1024,
                prompt: 'incoming',
              },
            },
          },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();

      expect(state!.history).toEqual([
        {
          role: 'tool',
          toolCallId: 'tc-1',
          content: JSON.stringify({
            schema: 'neko.tool-result.v1',
            data: {
              taskId: 'task-1',
              status: 'completed',
              prompt: 'rain',
              width: 1024,
            },
            backfillDiagnostics: [
              {
                path: 'prompt',
                reason: 'conflict',
                existing: 'rain',
                incoming: 'incoming',
              },
            ],
          }),
        },
      ]);
    });

    it('should patch a successful string tool result that starts with Error without reclassifying it', async () => {
      const entries: JournalEntry[] = [
        {
          seq: 1,
          ts: 1000,
          type: 'event',
          event: {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-1',
              success: true,
              data: 'Error: this is data',
            },
          },
        },
        {
          seq: 2,
          ts: 1001,
          type: 'event',
          event: {
            type: 'tool_result_backfill',
            toolResultBackfill: {
              toolCallId: 'tc-1',
              timestamp: 1001,
              dataPatch: { status: 'completed' },
              perceptionCards: [
                {
                  version: 1,
                  assetId: 'asset-1',
                  modality: 'text',
                  createdAt: 1001,
                  layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
                  structural: { format: 'txt', mimeType: 'text/plain', byteSize: 19 },
                },
              ],
            },
          },
        },
      ];
      const reader = new JournalReader({
        filePath: '/tmp/test.jsonl',
        fsOps: createMockFsOps(entriesToJsonl(entries)),
      });

      const state = await reader.readSessionState();
      const content = JSON.parse(state!.history[0]!.content as string);

      expect(content).toEqual(
        expect.objectContaining({
          schema: 'neko.tool-result.v1',
          data: { status: 'completed' },
          perceptionCards: [expect.objectContaining({ assetId: 'asset-1' })],
        }),
      );
      expect(content.success).toBeUndefined();
      expect(content.error).toBeUndefined();
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
