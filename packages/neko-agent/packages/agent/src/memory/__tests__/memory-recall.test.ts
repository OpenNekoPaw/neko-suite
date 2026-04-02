/**
 * MemoryRecall Tests — Three-layer memory retrieval with relevance scoring
 */

import { describe, it, expect, vi } from 'vitest';
import { MemoryRecall } from '../memory-recall';
import type { SessionMemory as ISessionMemory, IProjectMemoryManager } from '@neko/shared';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockSessionMemory(
  entries: Awaited<ReturnType<ISessionMemory['search']>> = [],
): ISessionMemory {
  return {
    getEntries: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
    addMessage: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue(entries),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockProjectMemory(content: string | null): IProjectMemoryManager {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    getContent: vi.fn().mockReturnValue(content),
    upsertEntry: vi.fn().mockResolvedValue(undefined),
    removeEntry: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('MemoryRecall', () => {
  describe('empty layers', () => {
    it('should return empty when no memory layers configured', async () => {
      const recall = new MemoryRecall({});
      const results = await recall.recall('test query');
      expect(results).toEqual([]);
    });

    it('should return empty when all layers have no content', async () => {
      const recall = new MemoryRecall({
        sessionMemory: createMockSessionMemory([]),
        projectMemory: createMockProjectMemory(null),
        globalMemory: createMockProjectMemory(null),
      });
      const results = await recall.recall('test query');
      expect(results).toEqual([]);
    });
  });

  describe('session layer', () => {
    it('should recall from session KeyFact entries', async () => {
      const session = createMockSessionMemory([
        {
          sessionId: 's-1',
          keyFacts: [
            {
              content: '用户偏好深色主题',
              category: 'preference' as const,
              timestamp: Date.now(),
              confidence: 0.8,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const recall = new MemoryRecall({ sessionMemory: session });
      const results = await recall.recall('深色主题');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.source).toBe('session');
      expect(results[0]!.content).toContain('深色主题');
    });

    it('should include summary in recall', async () => {
      const session = createMockSessionMemory([
        {
          sessionId: 's-1',
          keyFacts: [],
          summary: 'User worked on video editor dark mode',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const recall = new MemoryRecall({ sessionMemory: session });
      const results = await recall.recall('video editor');

      expect(results.some((r) => r.content.includes('video editor'))).toBe(true);
    });
  });

  describe('project layer', () => {
    it('should recall from project memory H2 sections', async () => {
      const project = createMockProjectMemory(
        '## UI Preferences\nDark theme preferred\n\n## Tech Stack\nReact + TypeScript',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('theme preferred');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.source).toBe('project');
    });

    it('should filter low-relevance sections', async () => {
      const project = createMockProjectMemory(
        '## Section A\nCompletely unrelated content xyz\n\n## Section B\nMore unrelated abc',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('深色主题编辑器');

      // Both sections should have very low relevance and be filtered
      expect(results).toHaveLength(0);
    });
  });

  describe('global layer', () => {
    it('should recall from global memory', async () => {
      const global = createMockProjectMemory(
        '## Editor Config\nAlways use 2-space indent\n\n## API Keys\nAnthropic key configured',
      );

      const recall = new MemoryRecall({ globalMemory: global });
      const results = await recall.recall('indent space');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.source).toBe('global');
    });
  });

  describe('multi-layer merge', () => {
    it('should merge results from all layers sorted by relevance', async () => {
      const session = createMockSessionMemory([
        {
          sessionId: 's-1',
          keyFacts: [
            {
              content: 'react component style',
              category: 'preference' as const,
              timestamp: Date.now(),
              confidence: 0.8,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
      const project = createMockProjectMemory(
        '## React Guide\nUse functional components with hooks',
      );
      const global = createMockProjectMemory(
        '## Coding Style\nPrefer react hooks over class components',
      );

      const recall = new MemoryRecall({
        sessionMemory: session,
        projectMemory: project,
        globalMemory: global,
      });
      const results = await recall.recall('react components hooks');

      expect(results.length).toBeGreaterThan(0);
      // Results should be sorted by relevance (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.relevance).toBeGreaterThanOrEqual(results[i]!.relevance);
      }
    });

    it('should respect limit parameter', async () => {
      const project = createMockProjectMemory(
        '## A\nreact hooks\n\n## B\nreact state\n\n## C\nreact router\n\n## D\nreact testing\n\n## E\nreact build\n\n## F\nreact deploy',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('react', 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('relevance scoring', () => {
    it('should rank higher relevance for more keyword matches', async () => {
      const project = createMockProjectMemory(
        '## High Match\nreact hooks component testing\n\n## Low Match\nunrelated content here',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('react hooks component');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.content).toContain('react hooks');
    });
  });
});
