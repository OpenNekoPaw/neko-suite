import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, IService } from '@neko/shared';
import { LLMSummarizer } from '../llm-summarizer';

function createService(response: string): IService {
  return {
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: response },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    streamChat: vi.fn(),
  } as unknown as IService;
}

function userMessage(content: string): ChatMessage {
  return { role: 'user', content };
}

describe('LLMSummarizer provenance', () => {
  it('marks parsed LLM summaries as non-degraded', async () => {
    const summarizer = new LLMSummarizer(createService('Summary\n\nKey Points:\n- One'));

    const result = await summarizer.summarize({
      messages: [userMessage('hello')],
      maxTokens: 200,
    });

    expect(result.source).toBe('llm');
    expect(result.degraded).toBe(false);
  });

  it('marks local summaries as degraded when all LLM attempts fail', async () => {
    const service = {
      chat: vi.fn().mockRejectedValue(new Error('offline')),
      streamChat: vi.fn(),
    } as unknown as IService;
    const summarizer = new LLMSummarizer(service, { maxRetries: 0 });

    const result = await summarizer.summarize({
      messages: [userMessage('please summarize this')],
      maxTokens: 200,
    });

    expect(result.source).toBe('fallback');
    expect(result.degraded).toBe(true);
  });

  it('uses Chinese prompt wrappers for localized summarization requests', async () => {
    const service = createService('摘要\n\n关键点：\n- 一项');
    const summarizer = new LLMSummarizer(service);

    await summarizer.summarize({
      messages: [userMessage('请总结这段对话')],
      maxTokens: 200,
      locale: 'zh-CN',
    });

    const messages = vi.mocked(service.chat).mock.calls[0]![0] as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0]!.content).toContain('对话摘要器');
    expect(messages[0]!.content).not.toContain('conversation summarizer');
    expect(messages[1]!.content).toContain('请总结以下对话片段');
    expect(messages[1]!.content).toContain('目标摘要长度');
    expect(messages[1]!.content).not.toContain('Please summarize the following conversation segment');
  });
});
