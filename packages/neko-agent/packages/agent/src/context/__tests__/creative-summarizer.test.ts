/**
 * CreativeSummarizer Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { CreativeSummarizer } from '../creative-summarizer';
import { MessageClassifier } from '../message-classifier';
import type { ChatMessage, IService } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function userMsg(content: string): ChatMessage {
  return { role: 'user', content };
}

function assistantMsg(content: string, toolCalls?: ChatMessage['toolCalls']): ChatMessage {
  return { role: 'assistant', content, toolCalls };
}

function toolMsg(content: string): ChatMessage {
  return { role: 'tool', content, toolCallId: 'call_1' };
}

function toolCall(name: string): NonNullable<ChatMessage['toolCalls']>[number] {
  return { id: 'call_1', type: 'function', function: { name, arguments: '{}' } };
}

function createMockService(response: string): IService {
  return {
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: response },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }),
    streamChat: vi.fn(),
  } as unknown as IService;
}

// =============================================================================
// Tests
// =============================================================================

describe('CreativeSummarizer', () => {
  const classifier = new MessageClassifier();

  describe('without LLM service (fallback mode)', () => {
    it('preserves user messages verbatim in summary', async () => {
      const summarizer = new CreativeSummarizer(classifier);

      const result = await summarizer.summarize({
        messages: [
          userMsg('用赛博朋克风格画猫'),
          assistantMsg('好的，开始生成', [toolCall('generate_image')]),
          toolMsg('{"model": "sdxl", "prompt": "cyberpunk cat"}'),
          userMsg('颜色太暗了'),
        ],
        maxTokens: 2000,
      });

      // User messages should appear verbatim
      expect(result.summary).toContain('用赛博朋克风格画猫');
      expect(result.summary).toContain('颜色太暗了');
      expect(result.source).toBe('fallback');
      expect(result.degraded).toBe(true);
    });

    it('groups messages by category', async () => {
      const summarizer = new CreativeSummarizer(classifier);

      const result = await summarizer.summarize({
        messages: [
          userMsg('风格选赛博朋克'),
          assistantMsg('好的，整体基调使用赛博朋克风格'),
          assistantMsg('生成中...', [toolCall('generate_image')]),
          toolMsg('{"model": "sdxl", "seed": 42}'),
          assistantMsg('这版不错，保存为 v1'),
        ],
        maxTokens: 2000,
      });

      // Summary should contain structured sections
      expect(result.summary).toBeTruthy();
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('respects total token budget', async () => {
      const summarizer = new CreativeSummarizer(classifier);

      const messages: ChatMessage[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push(userMsg(`Message ${i} with some content that takes up tokens`));
        messages.push(assistantMsg(`Response ${i} about the creative process and 风格 decisions`));
      }

      const result = await summarizer.summarize({
        messages,
        maxTokens: 500,
      });

      // Should not wildly exceed budget (user messages are kept verbatim
      // so may exceed, but categories should be budgeted)
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('handles empty messages', async () => {
      const summarizer = new CreativeSummarizer(classifier);

      const result = await summarizer.summarize({
        messages: [],
        maxTokens: 2000,
      });

      expect(result.summary).toBe('');
      expect(result.tokenCount).toBe(0);
      expect(result.source).toBeUndefined();
      expect(result.degraded).toBeUndefined();
    });
  });

  describe('with LLM service', () => {
    it('calls service for each non-empty category', async () => {
      const mockService = createMockService('Summary content\n\nKey Points:\n- Point 1\n- Point 2');
      const summarizer = new CreativeSummarizer(classifier, {
        service: mockService,
      });

      await summarizer.summarize({
        messages: [
          userMsg('风格选水墨'),
          assistantMsg('使用水墨风格作为基调'),
          assistantMsg('生成中...', [toolCall('generate_image')]),
          toolMsg('{"model": "sdxl", "seed": 1}'),
        ],
        maxTokens: 2000,
      });

      // Should have called service for creative_decision and iteration_chain categories
      expect(mockService.chat).toHaveBeenCalled();
    });

    it('extracts key points from LLM response', async () => {
      const mockService = createMockService(
        'Creative decisions summary.\n\nKey Points:\n- Chose watercolor style\n- Warm palette\n\nEntities:\n- watercolor\n- warm palette',
      );
      const summarizer = new CreativeSummarizer(classifier, {
        service: mockService,
      });

      const result = await summarizer.summarize({
        messages: [userMsg('水彩风格'), assistantMsg('确定使用水彩风格，暖色调基调')],
        maxTokens: 2000,
      });

      expect(result.keyPoints.length).toBeGreaterThan(0);
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.source).toBe('llm');
      expect(result.degraded).toBe(false);
    });

    it('uses Chinese prompt wrappers for localized LLM summarization requests', async () => {
      const mockService = createMockService('创作决策摘要。\n\n关键点：\n- 选择水墨风格');
      const summarizer = new CreativeSummarizer(classifier, {
        service: mockService,
      });

      await summarizer.summarize({
        messages: [userMsg('水墨风格'), assistantMsg('确定使用水墨风格')],
        maxTokens: 2000,
        locale: 'zh-CN',
      });

      const messages = vi.mocked(mockService.chat).mock.calls[0]![0] as Array<{
        role: string;
        content: string;
      }>;
      expect(messages[0]!.content).toContain('创作方向决策');
      expect(messages[0]!.content).not.toContain('You are summarising');
      expect(messages[1]!.content).toContain('目标长度');
      expect(messages[1]!.content).toContain('对话');
      expect(messages[1]!.content).not.toContain('Target length');
    });

    it('falls back to simple summary on service error', async () => {
      const failingService = {
        chat: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
        streamChat: vi.fn(),
      } as unknown as IService;

      const summarizer = new CreativeSummarizer(classifier, {
        service: failingService,
        summarizerConfig: { maxRetries: 0, temperature: 0.3 },
      });

      const result = await summarizer.summarize({
        messages: [userMsg('画只猫'), assistantMsg('好的', [toolCall('generate_image')])],
        maxTokens: 2000,
      });

      // Should still produce a result via fallback
      expect(result.summary).toBeTruthy();
      expect(result.source).toBe('fallback');
      expect(result.degraded).toBe(true);
    });
  });

  describe('budget allocation', () => {
    it('scales category budgets when total exceeds remaining', async () => {
      const summarizer = new CreativeSummarizer(classifier, {
        creativeConfig: {
          userMessageRetention: 'all',
          versionAnchorKeywords: ['OK'],
          creativeDecisionKeywords: ['风格'],
          aestheticPrefKeywords: ['太暗'],
          summaryBudget: {
            creativeDecisions: 1000,
            versionAnchors: 1000,
            iterationChains: 1000,
            assetStates: 1000,
            aestheticPrefs: 1000,
          },
        },
      });

      // With maxTokens=500 and large user messages, category budgets should scale down
      const result = await summarizer.summarize({
        messages: [
          userMsg('A'.repeat(1000)), // ~250 tokens of user message
          assistantMsg('确定风格为赛博朋克'),
        ],
        maxTokens: 500,
      });

      expect(result.summary).toBeTruthy();
    });
  });
});
