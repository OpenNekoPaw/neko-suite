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
});
