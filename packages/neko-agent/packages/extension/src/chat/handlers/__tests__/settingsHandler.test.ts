/**
 * SettingsHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsHandler } from '../settingsHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockPlatform() {
  return {
    config: {
      reloadConfig: vi.fn(),
      getAssistantSettingsData: vi.fn().mockReturnValue({
        providers: [
          { id: 'anthropic', name: 'Anthropic', type: 'anthropic', models: [], enabled: true },
        ],
        configuredProviders: [
          { id: 'anthropic', name: 'Anthropic', type: 'anthropic', models: [], enabled: true },
        ],
        selectedProviderId: 'anthropic',
        selectedModelId: 'claude-3',
        customSystemPrompt: 'You are a helpful assistant',
        autoExecuteTools: true,
        streamResponses: true,
        showToolCalls: true,
        temperature: 0.7,
        maxTokens: 4096,
        executionMode: 'auto',
        chatModelOptions: [],
        defaultMediaModels: {},
      }),
      applyRuntimeAssistantSettingsFromWebview: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('SettingsHandler', () => {
  let handler: SettingsHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let platform: ReturnType<typeof createMockPlatform>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    platform = createMockPlatform();
  });

  describe('sendSettings', () => {
    it('should do nothing when platform is unavailable', () => {
      handler = new SettingsHandler({});
      handler.sendSettings(webview as any);

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should send settings data to webview', () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });
      handler.sendSettings(webview as any);

      expect(platform.config.reloadConfig).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'settingsData',
          selectedProviderId: 'anthropic',
          selectedModelId: 'claude-3',
          systemPrompt: 'You are a helpful assistant',
          temperature: 0.7,
          maxTokens: 4096,
          executionMode: 'auto',
        }),
      );
    });

    it('should reload config only for explicit snapshot refresh calls', () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });

      handler.sendSettings(webview as any, { reloadConfig: true });

      expect(platform.config.reloadConfig).toHaveBeenCalledTimes(1);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'settingsData' }),
      );
    });

    it('should expose platform-projected provider and media data', () => {
      platform.config.getAssistantSettingsData.mockReturnValue({
        ...platform.config.getAssistantSettingsData(),
        defaultMediaModels: { image: 'openai:openai-dall-e-3' },
      });
      handler = new SettingsHandler({
        platform: platform as any,
      });
      handler.sendSettings(webview as any);

      expect(platform.config.reloadConfig).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.any(Array),
          configuredProviders: expect.any(Array),
          defaultMediaModels: { image: 'openai:openai-dall-e-3' },
        }),
      );
    });
  });

  describe('handleUpdateSettings', () => {
    it('should update provider and model', async () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });
      const update = {
        providerId: 'openai',
        modelId: 'gpt-4',
      };
      await handler.handleUpdateSettings(webview as any, update);

      expect(platform.config.applyRuntimeAssistantSettingsFromWebview).toHaveBeenCalledWith(update);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'settingsUpdated',
        success: true,
      });
    });

    it('should update boolean settings', async () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });
      const update = {
        autoExecuteTools: true,
        streamResponses: false,
        showToolCalls: true,
      };
      await handler.handleUpdateSettings(webview as any, update);

      expect(platform.config.applyRuntimeAssistantSettingsFromWebview).toHaveBeenCalledWith(update);
    });

    it('should update numeric settings', async () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });
      const update = {
        temperature: 0.5,
        maxTokens: 8192,
      };
      await handler.handleUpdateSettings(webview as any, update);

      expect(platform.config.applyRuntimeAssistantSettingsFromWebview).toHaveBeenCalledWith(update);
    });

    it('should update execution mode', async () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });
      const update = { executionMode: 'plan' };
      await handler.handleUpdateSettings(webview as any, update);

      expect(platform.config.applyRuntimeAssistantSettingsFromWebview).toHaveBeenCalledWith(update);
    });

    it('should report failure when platform is unavailable', async () => {
      handler = new SettingsHandler({});
      await handler.handleUpdateSettings(webview as any, {
        temperature: 0.3,
      });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'settingsUpdated',
        success: false,
        error: 'Platform is not initialized',
      });
    });

    it('should report failure when platform rejects settings update', async () => {
      platform.config.applyRuntimeAssistantSettingsFromWebview.mockRejectedValue(
        new Error('Config write failed'),
      );
      handler = new SettingsHandler({
        platform: platform as any,
      });

      await handler.handleUpdateSettings(webview as any, { temperature: 0.3 });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'settingsUpdated',
        success: false,
        error: 'Config write failed',
      });
    });
  });
});
