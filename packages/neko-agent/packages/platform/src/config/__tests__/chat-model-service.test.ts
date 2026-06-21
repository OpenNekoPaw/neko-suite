import { describe, expect, it } from 'vitest';
import type { Model, Provider } from '../../types/provider';
import { ChatModelService } from '../chat-model-service';

const provider: Provider = {
  id: 'anthropic',
  name: 'anthropic',
  displayName: 'Anthropic',
  type: 'anthropic',
  apiUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant',
  enabled: true,
};

const model: Model = {
  id: 'claude-sonnet-4',
  name: 'claude-sonnet-4-20250514',
  displayName: 'Claude Sonnet 4',
  providerId: 'anthropic',
  type: 'llm',
  enabled: true,
  capabilities: ['chat'],
  contextWindow: 200000,
};

describe('ChatModelService', () => {
  it('exposes model context windows to the webview model options', () => {
    const service = new ChatModelService();

    expect(service.getChatModelOptions([provider], [model])).toContainEqual({
      id: 'anthropic:claude-sonnet-4',
      label: 'Anthropic / Claude Sonnet 4',
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      capabilities: ['chat'],
      category: 'llm',
      contextWindow: 200000,
      llmParameterControls: {
        reasoning: false,
        verbosity: false,
        creativity: true,
        maxOutputTokens: true,
      },
    });
  });

  it('includes no-key local text-only chat models', () => {
    const service = new ChatModelService();
    const localProvider: Provider = {
      id: 'ollama-local',
      name: 'ollama',
      displayName: 'Ollama Local',
      type: 'ollama',
      apiUrl: 'http://localhost:11434/api',
      enabled: true,
      requiresApiKey: false,
      connectionKind: 'local',
      protocolProfile: 'ollama',
    };
    const localModel: Model = {
      id: 'ollama-local-llama3.2',
      name: 'llama3.2',
      displayName: 'Llama 3.2',
      providerId: 'ollama-local',
      type: 'llm',
      enabled: true,
      capabilities: ['chat'],
    };

    expect(service.getChatModelOptions([localProvider], [localModel])).toContainEqual({
      id: 'ollama-local:ollama-local-llama3.2',
      label: 'Ollama Local / Llama 3.2',
      providerId: 'ollama-local',
      modelId: 'ollama-local-llama3.2',
      capabilities: ['chat'],
      category: 'llm',
      llmParameterControls: {
        reasoning: false,
        verbosity: false,
        creativity: true,
        maxOutputTokens: true,
      },
    });
  });

  it('does not include remote providers missing an endpoint even with an API key', () => {
    const service = new ChatModelService();

    expect(
      service
        .getChatModelOptions([{ ...provider, apiUrl: '' }], [model])
        .map((option) => option.id),
    ).toEqual(['auto']);
  });
});
