/**
 * KeyFactExtractor Tests — Heuristic fact extraction from conversations
 */

import { describe, it, expect } from 'vitest';
import { KeyFactExtractor } from '../keyfact-extractor';
import type { ChatMessage, KeyFact } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function userMsg(content: string): ChatMessage {
  return { role: 'user', content };
}

function assistantMsg(content: string): ChatMessage {
  return { role: 'assistant', content };
}

function toolMsg(content: string): ChatMessage {
  return { role: 'tool', content, toolCallId: 'tc-1' };
}

// =============================================================================
// Tests
// =============================================================================

describe('KeyFactExtractor', () => {
  const extractor = new KeyFactExtractor();

  describe('preference extraction', () => {
    it('should detect Chinese preference keywords', () => {
      const messages = [userMsg('我喜欢用深色主题')];
      const facts = extractor.extract(messages);

      expect(facts).toHaveLength(1);
      expect(facts[0]!.category).toBe('preference');
      expect(facts[0]!.confidence).toBe(0.8);
      expect(facts[0]!.content).toContain('深色主题');
    });

    it('should detect English preference keywords', () => {
      const messages = [userMsg('I prefer using dark mode for all editors')];
      const facts = extractor.extract(messages);

      expect(facts).toHaveLength(1);
      expect(facts[0]!.category).toBe('preference');
    });

    it('should detect negative preferences', () => {
      const messages = [userMsg('I dislike auto-formatting, please avoid it')];
      const facts = extractor.extract(messages);

      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0]!.category).toBe('preference');
    });
  });

  describe('decision extraction', () => {
    it('should detect Chinese decision keywords', () => {
      const messages = [userMsg('决定采用方案A，用 React 重写')];
      const facts = extractor.extract(messages);

      expect(facts).toHaveLength(1);
      expect(facts[0]!.category).toBe('decision');
      expect(facts[0]!.confidence).toBe(0.7);
    });

    it('should detect English decision keywords', () => {
      const messages = [userMsg("Let's use TypeScript for this module")];
      const facts = extractor.extract(messages);

      expect(facts).toHaveLength(1);
      expect(facts[0]!.category).toBe('decision');
    });
  });

  describe('context extraction', () => {
    it('should detect context keywords', () => {
      const messages = [userMsg('项目的目标是实现一个视频编辑器')];
      const facts = extractor.extract(messages);

      expect(facts).toHaveLength(1);
      expect(facts[0]!.category).toBe('context');
      expect(facts[0]!.confidence).toBe(0.6);
    });
  });

  describe('tool action extraction', () => {
    it('should extract successful tool results', () => {
      const messages = [
        userMsg('read the file'),
        assistantMsg('I will read it'),
        toolMsg('File content: export function hello() { return "world"; }'),
      ];
      const facts = extractor.extract(messages);

      const actionFacts = facts.filter((f) => f.category === 'action');
      expect(actionFacts.length).toBeGreaterThan(0);
    });

    it('should skip error tool results', () => {
      const messages = [toolMsg('Error: file not found')];
      const facts = extractor.extract(messages);

      const actionFacts = facts.filter((f) => f.category === 'action');
      expect(actionFacts).toHaveLength(0);
    });
  });

  describe('deduplication', () => {
    it('should skip facts similar to existing ones', () => {
      const existing: KeyFact[] = [
        {
          content: '我喜欢用深色主题来写代码',
          category: 'preference',
          timestamp: Date.now(),
          confidence: 0.8,
        },
      ];
      const messages = [userMsg('我喜欢用深色主题来写代码')];
      const facts = extractor.extract(messages, existing);

      expect(facts.filter((f) => f.category === 'preference')).toHaveLength(0);
    });

    it('should keep facts different from existing', () => {
      const existing: KeyFact[] = [
        {
          content: '决定使用 React',
          category: 'decision',
          timestamp: Date.now(),
          confidence: 0.7,
        },
      ];
      const messages = [userMsg('我喜欢用暗色背景的编辑器')];
      const facts = extractor.extract(messages, existing);

      expect(facts.length).toBeGreaterThan(0);
    });
  });

  describe('limits and edge cases', () => {
    it('should respect maxFacts limit', () => {
      const extractor = new KeyFactExtractor({ maxFacts: 2 });
      const messages = [
        userMsg('我喜欢深色主题'),
        userMsg('决定用 TypeScript'),
        userMsg('项目目标是做编辑器'),
        userMsg('I prefer tabs over spaces'),
      ];
      const facts = extractor.extract(messages);

      expect(facts.length).toBeLessThanOrEqual(2);
    });

    it('should respect minConfidence threshold', () => {
      const extractor = new KeyFactExtractor({ minConfidence: 0.75 });
      const messages = [userMsg('项目目标是做编辑器')]; // context = 0.6 confidence

      const facts = extractor.extract(messages);
      expect(facts).toHaveLength(0); // 0.6 < 0.75
    });

    it('should skip very short messages', () => {
      const messages = [userMsg('OK')];
      const facts = extractor.extract(messages);

      // "OK" is < 5 chars, should be skipped
      expect(facts.filter((f) => f.category !== 'action')).toHaveLength(0);
    });

    it('should only scan user messages', () => {
      const messages = [assistantMsg('我喜欢这个方案'), userMsg('继续吧')];
      const facts = extractor.extract(messages);

      // "我喜欢这个方案" is assistant, should not be extracted as preference
      // "继续吧" has no keywords
      expect(facts.filter((f) => f.category === 'preference')).toHaveLength(0);
    });

    it('should truncate long content', () => {
      const longText = '我喜欢' + 'x'.repeat(300);
      const messages = [userMsg(longText)];
      const facts = extractor.extract(messages);

      expect(facts[0]!.content.length).toBeLessThanOrEqual(200);
      expect(facts[0]!.content).toContain('...');
    });
  });
});
