import { describe, expect, it, vi } from 'vitest';
import {
  INTERNAL_CHAT_DEFAULT_MAX_TOKENS,
  runInternalChatRuntime,
  type InternalChatRuntimeService,
} from '../internal-chat-runtime';
import type { ServiceResponse } from '../../types/service';

function createResponse(content: ServiceResponse['message']['content']): ServiceResponse {
  return {
    id: 'response-1',
    model: 'gpt-4',
    message: { role: 'assistant', content },
    finishReason: 'stop',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    routing: { modelId: 'gpt-4', providerId: 'openai', attempts: 1 },
    timing: { startTime: 0, endTime: 1, duration: 1 },
  };
}

describe('runInternalChatRuntime', () => {
  it('uses default max tokens and returns string content', async () => {
    const service = {
      chat: vi.fn().mockResolvedValue(createResponse('hello')),
    } satisfies InternalChatRuntimeService;

    const result = await runInternalChatRuntime(
      { messages: [{ role: 'user', content: 'hi' }] },
      { createService: () => service },
    );

    expect(service.chat).toHaveBeenCalledWith([{ role: 'user', content: 'hi' }], {
      maxTokens: INTERNAL_CHAT_DEFAULT_MAX_TOKENS,
    });
    expect(result).toBe('hello');
  });

  it('honors service options and max token overrides', async () => {
    const service = {
      chat: vi.fn().mockResolvedValue(createResponse('ok')),
    } satisfies InternalChatRuntimeService;

    await runInternalChatRuntime(
      {
        messages: [{ role: 'user', content: 'hi' }],
        options: { maxTokens: 42, modelId: 'model-1', temperature: 0.2 },
      },
      { createService: () => service },
    );

    expect(service.chat).toHaveBeenCalledWith([{ role: 'user', content: 'hi' }], {
      maxTokens: 42,
      modelId: 'model-1',
      temperature: 0.2,
    });
  });

  it('returns null when response content is not plain text', async () => {
    const service = {
      chat: vi.fn().mockResolvedValue(createResponse([{ type: 'text', text: 'hello' }])),
    } satisfies InternalChatRuntimeService;

    await expect(
      runInternalChatRuntime(
        { messages: [{ role: 'user', content: 'hi' }] },
        { createService: () => service },
      ),
    ).resolves.toBeNull();
  });

  it('returns null and logs when service execution fails', async () => {
    const logger = { warn: vi.fn() };
    const service = {
      chat: vi.fn().mockRejectedValue(new Error('quota exceeded')),
    } satisfies InternalChatRuntimeService;

    await expect(
      runInternalChatRuntime(
        { messages: [{ role: 'user', content: 'hi' }] },
        { createService: () => service, logger },
      ),
    ).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(
      'neko.agent.internalChat failed',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('returns null when no service factory is available', async () => {
    await expect(
      runInternalChatRuntime({ messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).resolves.toBeNull();
  });
});
