/**
 * JournalWriter Tests — append-only JSONL session event writing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalWriter } from '../journal-writer';
import type { JournalFsOps, JournalEntry } from '../journal-writer';
import type { AgentEvent } from '../types';

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockFsOps(): JournalFsOps & { _written: string[] } {
  const written: string[] = [];
  return {
    _written: written,
    appendFile: vi.fn().mockImplementation(async (_path: string, data: string) => {
      written.push(data);
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('JournalWriter', () => {
  let fsOps: ReturnType<typeof createMockFsOps>;
  let writer: JournalWriter;

  beforeEach(() => {
    fsOps = createMockFsOps();
    writer = new JournalWriter({ filePath: '/tmp/journals/test.jsonl', fsOps });
  });

  describe('append', () => {
    it('should create directory on first write', async () => {
      await writer.append({
        seq: 1,
        ts: 1000,
        type: 'snapshot',
        snapshot: { historyLength: 0, executionMode: 'auto', versionLogSize: 0 },
      });

      expect(fsOps.mkdir).toHaveBeenCalledWith('/tmp/journals', { recursive: true });
    });

    it('should write JSON line with newline', async () => {
      const entry: JournalEntry = {
        seq: 1,
        ts: 1000,
        type: 'snapshot',
        snapshot: { historyLength: 5, executionMode: 'auto', versionLogSize: 2 },
      };
      await writer.append(entry);

      expect(fsOps._written).toHaveLength(1);
      const parsed = JSON.parse(fsOps._written[0]!.trim());
      expect(parsed.seq).toBe(1);
      expect(parsed.type).toBe('snapshot');
      expect(parsed.snapshot.historyLength).toBe(5);
    });

    it('should end each line with newline', async () => {
      await writer.append({
        seq: 1,
        ts: 1000,
        type: 'snapshot',
        snapshot: { historyLength: 0, executionMode: 'auto', versionLogSize: 0 },
      });
      expect(fsOps._written[0]!.endsWith('\n')).toBe(true);
    });

    it('should not call mkdir more than once', async () => {
      await writer.append({
        seq: 1,
        ts: 1000,
        type: 'snapshot',
        snapshot: { historyLength: 0, executionMode: 'auto', versionLogSize: 0 },
      });
      await writer.append({
        seq: 2,
        ts: 1001,
        type: 'snapshot',
        snapshot: { historyLength: 1, executionMode: 'auto', versionLogSize: 0 },
      });

      expect(fsOps.mkdir).toHaveBeenCalledTimes(1);
    });

    it('should serialize Error objects in events', async () => {
      const event: AgentEvent = { type: 'error', error: new Error('test failure') };
      await writer.appendEvent(1, event);

      const parsed = JSON.parse(fsOps._written[0]!.trim());
      expect(parsed.event.error.message).toBe('test failure');
      expect(parsed.event.error.name).toBe('Error');
    });
  });

  describe('appendEvent', () => {
    it('should write event entry with correct structure', async () => {
      const event: AgentEvent = { type: 'text', content: 'Hello world' };
      await writer.appendEvent(5, event);

      const parsed = JSON.parse(fsOps._written[0]!.trim());
      expect(parsed.seq).toBe(5);
      expect(parsed.type).toBe('event');
      expect(parsed.event.type).toBe('text');
      expect(parsed.event.content).toBe('Hello world');
      expect(parsed.ts).toBeGreaterThan(0);
    });
  });

  describe('appendSnapshot', () => {
    it('should write snapshot entry', async () => {
      await writer.appendSnapshot(10, {
        historyLength: 20,
        executionMode: 'ask',
        versionLogSize: 3,
      });

      const parsed = JSON.parse(fsOps._written[0]!.trim());
      expect(parsed.seq).toBe(10);
      expect(parsed.type).toBe('snapshot');
      expect(parsed.snapshot.historyLength).toBe(20);
      expect(parsed.snapshot.executionMode).toBe('ask');
    });
  });

  describe('appendSubAgentRef', () => {
    it('should write subagent ref entry', async () => {
      await writer.appendSubAgentRef(3, {
        subAgentId: 'sub-1',
        journalPath: '/tmp/journals/conv_sub_sub-1.jsonl',
      });

      const parsed = JSON.parse(fsOps._written[0]!.trim());
      expect(parsed.type).toBe('subagent_ref');
      expect(parsed.subAgentRef.subAgentId).toBe('sub-1');
    });
  });

  describe('flush', () => {
    it('should wait for all pending writes', async () => {
      // Queue multiple writes
      const p1 = writer.appendEvent(1, { type: 'text', content: 'a' });
      const p2 = writer.appendEvent(2, { type: 'text', content: 'b' });
      await p1;
      await p2;
      await writer.flush();

      expect(fsOps._written).toHaveLength(2);
    });
  });

  describe('dispose', () => {
    it('should flush on dispose', async () => {
      await writer.appendEvent(1, { type: 'text', content: 'data' });
      await writer.dispose();

      expect(fsOps._written).toHaveLength(1);
    });
  });

  describe('write ordering', () => {
    it('should maintain sequential write order', async () => {
      for (let i = 0; i < 5; i++) {
        await writer.appendEvent(i, { type: 'text', content: `msg-${i}` });
      }

      expect(fsOps._written).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        const parsed = JSON.parse(fsOps._written[i]!.trim());
        expect(parsed.seq).toBe(i);
        expect(parsed.event.content).toBe(`msg-${i}`);
      }
    });
  });
});
