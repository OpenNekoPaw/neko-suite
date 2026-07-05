/**
 * JournalStorage Tests — JSONL file management
 */

import { describe, it, expect, vi } from 'vitest';
import { JournalStorage, createJournalStorage } from '../journal-storage';
import type { JournalStorageFsOps } from '../journal-storage';

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockFsOps(files: string[] = []): JournalStorageFsOps {
  return {
    appendFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue(files),
    stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('JournalStorage', () => {
  describe('path computation', () => {
    it('should compute journal path', () => {
      const storage = new JournalStorage('/tmp/journals', createMockFsOps());
      const path = storage.getJournalPath('conv-123');
      expect(path).toContain('conv-123.jsonl');
      expect(path).toContain('/tmp/journals');
    });

    it('should compute SubAgent sidechain path', () => {
      const storage = new JournalStorage('/tmp/journals', createMockFsOps());
      const path = storage.getSubAgentJournalPath('conv-123', 'sub-1');
      expect(path).toContain('conv-123_sub_sub-1.jsonl');
    });
  });

  describe('listJournals', () => {
    it('should list conversation IDs (excluding sidechains)', async () => {
      const fsOps = createMockFsOps([
        'conv-1.jsonl',
        'conv-2.jsonl',
        'conv-1_sub_agent-1.jsonl',
        'README.md',
      ]);
      const storage = new JournalStorage('/tmp/journals', fsOps);

      const ids = await storage.listJournals();
      expect(ids).toEqual(['conv-1', 'conv-2']);
    });

    it('should return empty array on readdir error', async () => {
      const fsOps = createMockFsOps();
      (fsOps.readdir as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));
      const storage = new JournalStorage('/tmp/journals', fsOps);

      const ids = await storage.listJournals();
      expect(ids).toEqual([]);
    });
  });

  describe('deleteJournal', () => {
    it('should delete main journal and sidechains', async () => {
      const fsOps = createMockFsOps([
        'conv-1.jsonl',
        'conv-1_sub_agent-1.jsonl',
        'conv-1_sub_agent-2.jsonl',
        'conv-2.jsonl',
      ]);
      const storage = new JournalStorage('/tmp/journals', fsOps);

      await storage.deleteJournal('conv-1');

      expect(fsOps.unlink).toHaveBeenCalledTimes(3);
    });
  });

  describe('cleanup', () => {
    it('should delete journals older than threshold', async () => {
      const now = Date.now();
      const fsOps = createMockFsOps(['old.jsonl', 'new.jsonl']);
      (fsOps.stat as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ mtimeMs: now - 100_000 }) // old
        .mockResolvedValueOnce({ mtimeMs: now }); // new

      const storage = new JournalStorage('/tmp/journals', fsOps);
      const deleted = await storage.cleanup(50_000);

      expect(deleted).toBe(1);
      expect(fsOps.unlink).toHaveBeenCalledTimes(1);
    });
  });

  describe('createWriter / createReader', () => {
    it('should create writer with correct path', () => {
      const storage = new JournalStorage('/tmp/journals', createMockFsOps());
      const writer = storage.createWriter('conv-1');
      expect(writer).toBeDefined();
    });

    it('should create reader with correct path', () => {
      const storage = new JournalStorage('/tmp/journals', createMockFsOps());
      const reader = storage.createReader('conv-1');
      expect(reader).toBeDefined();
    });

    it('recovers each conversation from its own journal partition', async () => {
      const fsOps = createMemoryJournalFsOps();
      const storage = new JournalStorage('/tmp/journals', fsOps);

      await storage.createWriter('conv-a').append({
        eventId: 'evt-a-user',
        seq: 1,
        ts: 1000,
        type: 'event',
        event: { type: 'user_message', content: 'hello from A' },
      });
      await storage.createWriter('conv-a').append({
        eventId: 'evt-a-text',
        seq: 2,
        ts: 1001,
        type: 'event',
        event: { type: 'text', content: 'reply to A' },
      });
      await storage.createWriter('conv-b').append({
        eventId: 'evt-b-user',
        seq: 1,
        ts: 2000,
        type: 'event',
        event: { type: 'user_message', content: 'hello from B' },
      });

      const stateA = await storage.createReader('conv-a').readSessionState();
      const stateB = await storage.createReader('conv-b').readSessionState();

      expect(stateA?.history).toEqual([
        { role: 'user', content: 'hello from A' },
        { role: 'assistant', content: 'reply to A' },
      ]);
      expect(stateB?.history).toEqual([{ role: 'user', content: 'hello from B' }]);
      expect(fsOps.files.has('/tmp/journals/conv-a.jsonl')).toBe(true);
      expect(fsOps.files.has('/tmp/journals/conv-b.jsonl')).toBe(true);
    });
  });

  describe('createJournalStorage factory', () => {
    it('should create storage with custom base dir', () => {
      const storage = createJournalStorage(createMockFsOps(), '/custom/path');
      expect(storage.getJournalPath('test')).toContain('/custom/path');
    });
  });
});

function createMemoryJournalFsOps(): JournalStorageFsOps & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    appendFile: vi.fn(async (path: string, data: string) => {
      files.set(path, (files.get(path) ?? '') + data);
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }
      return content;
    }),
    exists: vi.fn(async (path: string) => files.has(path)),
    readdir: vi.fn(async (dir: string) =>
      [...files.keys()]
        .filter((filePath) => filePath.startsWith(`${dir}/`))
        .map((filePath) => filePath.slice(dir.length + 1)),
    ),
    stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
    unlink: vi.fn(async (path: string) => {
      files.delete(path);
    }),
  };
}
