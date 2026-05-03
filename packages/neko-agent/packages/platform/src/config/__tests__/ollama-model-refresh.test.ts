import { describe, expect, it, vi } from 'vitest';
import { refreshOllamaModels, type OllamaModelRefreshConfig } from '../ollama-model-refresh';
import type { Adapter, ChatChunk } from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';

const ollamaProvider: Provider = {
  id: 'ollama',
  name: 'ollama',
  displayName: 'Ollama',
  type: 'ollama',
  apiUrl: 'http://localhost:11434/api',
  enabled: true,
};

function createAdapter(listModels: Adapter['listModels']): Adapter {
  return {
    type: 'ollama',
    supportsStreaming: () => true,
    supportsCapability: () => true,
    chat: async () => ({
      id: 'chat',
      model: 'test',
      message: { role: 'assistant', content: '' },
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    chatStream: async function* (): AsyncIterable<ChatChunk> {},
    listModels,
  };
}

function createConfig(existingModels: Model[] = []): {
  config: OllamaModelRefreshConfig;
  setModel: ReturnType<typeof vi.fn>;
} {
  const models = [...existingModels];
  const setModel = vi.fn(async (model: Model) => {
    models.push(model);
  });

  return {
    config: {
      getProviders: () => [
        ollamaProvider,
        {
          id: 'openai',
          name: 'openai',
          displayName: 'OpenAI',
          type: 'openai',
          apiUrl: 'https://api.openai.com/v1',
          enabled: true,
        },
      ],
      getModelsByProvider: (providerId) =>
        models.filter((model) => model.providerId === providerId),
      setModel,
    },
    setModel,
  };
}

describe('refreshOllamaModels', () => {
  it('discovers new Ollama models through the platform adapter registry', async () => {
    const { config, setModel } = createConfig([
      {
        id: 'ollama-llama3',
        name: 'llama3',
        providerId: 'ollama',
        capabilities: ['chat'],
        enabled: true,
      },
    ]);
    const listModels = vi.fn(async () => ['llama3', 'qwen2.5']);

    await expect(
      refreshOllamaModels({
        config,
        providers: { getAdapter: () => createAdapter(listModels) },
      }),
    ).resolves.toEqual({
      added: 1,
      checkedProviders: 1,
      failedProviders: [],
    });

    expect(listModels).toHaveBeenCalledWith(ollamaProvider);
    expect(setModel).toHaveBeenCalledWith({
      id: 'ollama-qwen2.5',
      name: 'qwen2.5',
      providerId: 'ollama',
      capabilities: ['chat'],
      enabled: true,
    });
  });

  it('reports provider failures without throwing', async () => {
    const { config, setModel } = createConfig();
    const logger = { warn: vi.fn() };

    await expect(
      refreshOllamaModels({
        config,
        providers: {
          getAdapter: () =>
            createAdapter(async () => {
              throw new Error('offline');
            }),
        },
        logger,
      }),
    ).resolves.toEqual({
      added: 0,
      checkedProviders: 1,
      failedProviders: ['ollama'],
    });

    expect(setModel).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to refresh Ollama models',
      expect.objectContaining({ providerId: 'ollama' }),
    );
  });
});
