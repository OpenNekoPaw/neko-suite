/**
 * ConversationCompressor + MessageClassifier Integration Tests
 *
 * Verifies that when a classifier is injected, user messages from
 * older turns are preserved verbatim instead of being summarised away.
 */

import { describe, it, expect, vi } from 'vitest';
import { ConversationCompressor } from '../conversation-compressor';
import { MessageClassifier } from '../message-classifier';
import type { ChatMessage, ISummarizer } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function systemMsg(content: string): ChatMessage {
  return { role: 'system', content };
}

function userMsg(content: string): ChatMessage {
  return { role: 'user', content };
}

function assistantMsg(content: string): ChatMessage {
  return { role: 'assistant', content };
}

/**
 * Build a conversation with N user-assistant turns
 */
function buildConversation(turnCount: number): ChatMessage[] {
  const msgs: ChatMessage[] = [systemMsg('You are a creative assistant')];
  for (let i = 1; i <= turnCount; i++) {
    msgs.push(userMsg(`User turn ${i}: 请用赛博朋克风格画一只猫 iteration ${i}`));
    msgs.push(assistantMsg(`Assistant turn ${i}: 好的，正在生成赛博朋克风格的猫 v${i}`));
  }
  return msgs;
}

// =============================================================================
// Tests
// =============================================================================

describe('ConversationCompressor with MessageClassifier', () => {
  describe('classified compression preserves user messages', () => {
    it('keeps user messages from older turns when classifier is set', async () => {
      const classifier = new MessageClassifier();
      const compressor = new ConversationCompressor(
        {
          conversationWindow: {
            recentTurns: 2,
            olderTurnsStrategy: 'summary',
            olderTurnsSummaryMaxTokens: 2000,
          },
          triggers: { tokenThreshold: 80000, turnThreshold: 20 },
          toolResultCompression: {
            maxLength: 500,
            keepFields: ['status', 'summary', 'error', 'result'],
            discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
          },
          skillCompression: { inactiveSkillsStrategy: 'index-only', activeSkillAge: 5 },
        },
        undefined,
        classifier,
      );

      // Build 5 turns (turns 1-3 will be "older", turns 4-5 "recent")
      const messages = buildConversation(5);

      const result = await compressor.compress(messages, { force: true });

      // Check that user messages from older turns are preserved verbatim
      const preservedMessages = result.messages
        .filter((m) => !m.isSummary && m.message.role === 'user')
        .map((m) => m.message.content as string);

      // Older turn user messages (turns 1-3) should be preserved
      expect(preservedMessages.some((c) => c.includes('User turn 1'))).toBe(true);
      expect(preservedMessages.some((c) => c.includes('User turn 2'))).toBe(true);
      expect(preservedMessages.some((c) => c.includes('User turn 3'))).toBe(true);
      // Recent turn user messages (turns 4-5) should also be present
      expect(preservedMessages.some((c) => c.includes('User turn 4'))).toBe(true);
      expect(preservedMessages.some((c) => c.includes('User turn 5'))).toBe(true);
    });

    it('creates creative summary for non-user older messages', async () => {
      const classifier = new MessageClassifier();
      const compressor = new ConversationCompressor(
        {
          conversationWindow: {
            recentTurns: 2,
            olderTurnsStrategy: 'summary',
            olderTurnsSummaryMaxTokens: 2000,
          },
          triggers: { tokenThreshold: 80000, turnThreshold: 20 },
          toolResultCompression: {
            maxLength: 500,
            keepFields: ['status', 'summary', 'error', 'result'],
            discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
          },
          skillCompression: { inactiveSkillsStrategy: 'index-only', activeSkillAge: 5 },
        },
        undefined,
        classifier,
      );

      const messages = buildConversation(5);
      const result = await compressor.compress(messages, { force: true });

      // Should have a creative summary message
      const summaries = result.messages.filter((m) => m.isSummary);
      expect(summaries.length).toBe(1);
      expect(summaries[0]!.message.content).toContain('Creative summary');
    });

    it('localizes creative summary wrappers for Chinese prompt context', async () => {
      const classifier = new MessageClassifier();
      const compressor = new ConversationCompressor(
        {
          locale: 'zh',
          conversationWindow: {
            recentTurns: 2,
            olderTurnsStrategy: 'summary',
            olderTurnsSummaryMaxTokens: 2000,
          },
          triggers: { tokenThreshold: 80000, turnThreshold: 20 },
          toolResultCompression: {
            maxLength: 500,
            keepFields: ['status', 'summary', 'error', 'result'],
            discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
          },
          skillCompression: { inactiveSkillsStrategy: 'index-only', activeSkillAge: 5 },
        },
        undefined,
        classifier,
      );

      const messages = buildConversation(5);
      const result = await compressor.compress(messages, { force: true });

      const summaries = result.messages.filter((m) => m.isSummary);
      expect(summaries[0]!.message.content).toContain('第 1-3 轮创作摘要');
      expect(summaries[0]!.message.content).not.toContain('Creative summary');
    });
  });

  describe('without classifier (backward compatible)', () => {
    it('uses bulk summary as before', async () => {
      const compressor = new ConversationCompressor({
        conversationWindow: {
          recentTurns: 2,
          olderTurnsStrategy: 'summary',
          olderTurnsSummaryMaxTokens: 2000,
        },
        triggers: { tokenThreshold: 80000, turnThreshold: 20 },
        toolResultCompression: {
          maxLength: 500,
          keepFields: ['status', 'summary', 'error', 'result'],
          discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
        },
        skillCompression: { inactiveSkillsStrategy: 'index-only', activeSkillAge: 5 },
      });

      const messages = buildConversation(5);
      const result = await compressor.compress(messages, { force: true });

      // Without classifier, older turn user messages are NOT preserved individually
      const summaries = result.messages.filter((m) => m.isSummary);
      expect(summaries.length).toBe(1);
      expect(summaries[0]!.message.content).toContain('Summary of turns');

      // Older user messages should NOT appear as individual preserved messages
      const olderUserMsgs = result.messages.filter(
        (m) =>
          !m.isSummary &&
          m.message.role === 'user' &&
          (m.message.content as string).includes('User turn 1'),
      );
      expect(olderUserMsgs).toHaveLength(0);
    });

    it('localizes summary wrappers for Chinese prompt context', async () => {
      const compressor = new ConversationCompressor({
        conversationWindow: {
          recentTurns: 2,
          olderTurnsStrategy: 'summary',
          olderTurnsSummaryMaxTokens: 2000,
        },
        triggers: { tokenThreshold: 80000, turnThreshold: 20 },
        toolResultCompression: {
          maxLength: 500,
          keepFields: ['status', 'summary', 'error', 'result'],
          discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
        },
        skillCompression: { inactiveSkillsStrategy: 'index-only', activeSkillAge: 5 },
      });
      compressor.configure({ locale: 'zh' });

      const messages = buildConversation(5);
      const result = await compressor.compress(messages, { force: true });

      const summaries = result.messages.filter((m) => m.isSummary);
      expect(summaries[0]!.message.content).toContain('第 1-3 轮摘要');
      expect(summaries[0]!.message.content).not.toContain('Summary of turns');
    });

    it('passes compressor locale into injected summarization requests', async () => {
      const summarizer: ISummarizer = {
        summarize: vi.fn().mockResolvedValue({
          summary: '摘要',
          tokenCount: 1,
          keyPoints: [],
          entities: [],
        }),
      };
      const compressor = new ConversationCompressor(
        {
          locale: 'zh-CN',
          conversationWindow: {
            recentTurns: 2,
            olderTurnsStrategy: 'summary',
            olderTurnsSummaryMaxTokens: 2000,
          },
          triggers: { tokenThreshold: 80000, turnThreshold: 20 },
          toolResultCompression: {
            maxLength: 500,
            keepFields: ['status', 'summary', 'error', 'result'],
            discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
          },
          skillCompression: { inactiveSkillsStrategy: 'index-only', activeSkillAge: 5 },
        },
        summarizer,
      );

      await compressor.compress(buildConversation(5), { force: true });

      expect(vi.mocked(summarizer.summarize).mock.calls[0]![0]).toMatchObject({
        locale: 'zh',
      });
    });
  });

  describe('setClassifier runtime injection', () => {
    it('allows switching to classified mode at runtime', async () => {
      const compressor = new ConversationCompressor({
        conversationWindow: {
          recentTurns: 2,
          olderTurnsStrategy: 'summary',
          olderTurnsSummaryMaxTokens: 2000,
        },
        triggers: { tokenThreshold: 80000, turnThreshold: 20 },
        toolResultCompression: {
          maxLength: 500,
          keepFields: ['status', 'summary', 'error', 'result'],
          discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
        },
        skillCompression: { inactiveSkillsStrategy: 'index-only', activeSkillAge: 5 },
      });

      const messages = buildConversation(5);

      // First compress without classifier
      const result1 = await compressor.compress(messages, { force: true });
      const summaries1 = result1.messages.filter((m) => m.isSummary);
      expect(summaries1[0]!.message.content).toContain('Summary of turns');

      // Inject classifier at runtime
      compressor.setClassifier(new MessageClassifier());

      // Now compress again — should use classified mode
      const result2 = await compressor.compress(messages, { force: true });
      const summaries2 = result2.messages.filter((m) => m.isSummary);
      expect(summaries2[0]!.message.content).toContain('Creative summary');
    });
  });
});
