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
    });
  });
});
