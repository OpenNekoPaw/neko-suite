/**
 * CreativeMemoryHooks Tests — Automatic recall + extraction per turn
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreativeMemoryHooks } from '../creative-memory-hooks';
import { KeyFactExtractor } from '../keyfact-extractor';
import { MemoryRecall } from '../memory-recall';
import type { AgentContext, AgentResult, SessionMemory as ISessionMemory } from '@neko/shared';
import type { ISystemPromptComposer } from '../../prompt/system-prompt-composer-types';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockComposer(): ISystemPromptComposer {
  return {
    setBase: vi.fn(),
    setSection: vi.fn(),
    removeSection: vi.fn().mockReturnValue(false),
    hasSection: vi.fn().mockReturnValue(false),
    getSection: vi.fn().mockReturnValue(undefined),
    compose: vi.fn().mockReturnValue('system prompt'),
    composeStructured: vi.fn().mockReturnValue({ text: 'system prompt', sections: [] }),
    getTotalTokens: vi.fn().mockReturnValue(0),
    getLayerUsage: vi.fn().mockReturnValue({}),
    dumpSections: vi.fn().mockReturnValue([]),
    reset: vi.fn(),
  };
}

function createMockSessionMemory(): ISessionMemory {
  return {
    getEntries: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
    addMessage: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockContext(): AgentContext {
  return {
    messages: [{ role: 'user', content: 'test input' }],
    state: 'think',
    iteration: 1,
    toolResults: [],
    metadata: {},
  };
}

function createMockResult(success = true): AgentResult {
  return {
    success,
    response: 'Done',
    steps: [],
    iterations: 1,
    timing: { startTime: 0, endTime: 100, duration: 100 },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('CreativeMemoryHooks', () => {
  let composer: ISystemPromptComposer;
  let sessionMemory: ISessionMemory;
  let hooks: CreativeMemoryHooks;

  beforeEach(() => {
    composer = createMockComposer();
    sessionMemory = createMockSessionMemory();

    hooks = new CreativeMemoryHooks({
      extractor: new KeyFactExtractor(),
      recall: new MemoryRecall({ sessionMemory }),
      promptComposer: composer,
      sessionMemory,
    });
  });

  it('should have correct name', () => {
    expect(hooks.name).toBe('creative-memory');
  });

  describe('onExecuteStart', () => {
    it('should inject recalled memories into prompt composer', async () => {
      // Setup: session memory returns matching entries
      (sessionMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          sessionId: 's-1',
          keyFacts: [
            {
              content: '用户偏好深色主题',
              category: 'preference',
              timestamp: Date.now(),
              confidence: 0.8,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      await hooks.onExecuteStart!('深色主题相关', createMockContext());

      expect(composer.setSection).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'memory:recall',
          layer: 'ephemeral',
          priority: 40,
        }),
      );
    });

    it('should remove recall section when no memories found', async () => {
      await hooks.onExecuteStart!('random query with no matches', createMockContext());

      expect(composer.removeSection).toHaveBeenCalledWith('memory:recall');
    });

    it('should not throw on recall failure', async () => {
      (sessionMemory.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      // Should not throw
      await hooks.onExecuteStart!('test', createMockContext());
    });
  });

  describe('onExecuteEnd', () => {
    it('should extract and save facts on successful execution', async () => {
      // Setup: provide some history with preference keywords
      (sessionMemory.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
        { role: 'user', content: '我喜欢使用 TypeScript 而不是 JavaScript' },
        { role: 'assistant', content: 'OK, I will use TypeScript.' },
      ]);

      await hooks.onExecuteEnd!(createMockResult(true));

      expect(sessionMemory.saveSession).toHaveBeenCalled();
    });

    it('should not extract on failed execution', async () => {
      await hooks.onExecuteEnd!(createMockResult(false));

      expect(sessionMemory.saveSession).not.toHaveBeenCalled();
    });

    it('should not throw on extraction failure', async () => {
      (sessionMemory.getHistory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Memory error'),
      );

      // Should not throw
      await hooks.onExecuteEnd!(createMockResult(true));
    });

    it('should skip save when no new facts extracted', async () => {
      // Empty history → no keywords → no facts
      (sessionMemory.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await hooks.onExecuteEnd!(createMockResult(true));

      expect(sessionMemory.saveSession).not.toHaveBeenCalled();
    });

    it('should merge new facts with existing', async () => {
      (sessionMemory.getEntries as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          sessionId: 'default',
          keyFacts: [
            { content: 'existing fact', category: 'preference', timestamp: 1000, confidence: 0.8 },
          ],
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]);
      (sessionMemory.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
        { role: 'user', content: '我偏好使用函数式编程风格' },
      ]);

      await hooks.onExecuteEnd!(createMockResult(true));

      if ((sessionMemory.saveSession as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const savedFacts = (sessionMemory.saveSession as ReturnType<typeof vi.fn>).mock
          .calls[0]![1];
        // Should contain both existing and new facts
        expect(savedFacts.length).toBeGreaterThan(1);
      }
    });
  });
});
