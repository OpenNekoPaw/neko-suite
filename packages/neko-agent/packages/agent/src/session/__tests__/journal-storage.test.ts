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
  });

  describe('createJournalStorage factory', () => {
    it('should create storage with custom base dir', () => {
      const storage = createJournalStorage(createMockFsOps(), '/custom/path');
      expect(storage.getJournalPath('test')).toContain('/custom/path');
    });
  });
});
