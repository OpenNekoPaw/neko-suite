/**
 * SettingsHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AGENT_SESSION_CONFIG_LOCKED_MESSAGE } from '@neko/agent/runtime';
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
    it('should do nothing when platform is unavailable', async () => {
      handler = new SettingsHandler({});
      await handler.sendSettings(webview as any);

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should send settings data to webview', async () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });
      await handler.sendSettings(webview as any);

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

    it('should reload config only for explicit snapshot refresh calls', async () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });

      await handler.sendSettings(webview as any, { reloadConfig: true });

      expect(platform.config.reloadConfig).toHaveBeenCalledTimes(1);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'settingsData' }),
      );
    });

    it('should expose platform-projected provider and media data', async () => {
      platform.config.getAssistantSettingsData.mockReturnValue({
        ...platform.config.getAssistantSettingsData(),
        defaultMediaModels: { image: 'openai:openai-dall-e-3' },
      });
      handler = new SettingsHandler({
        platform: platform as any,
      });
      await handler.sendSettings(webview as any);

      expect(platform.config.reloadConfig).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.any(Array),
          configuredProviders: expect.any(Array),
          defaultMediaModels: { image: 'openai:openai-dall-e-3' },
        }),
      );
    });

    it('passes account catalog snapshots into settings model projection', async () => {
      const accountCatalog = {
        getSnapshot: vi.fn().mockResolvedValue({
          snapshot: {
            source: 'account-gateway',
            status: 'available',
            provider: { id: 'neko-account-gateway' },
            models: [],
            entitlement: { allowedModelIds: [] },
            expiresAt: 10_000,
          },
          refreshed: false,
        }),
        invalidateForAuthFailure: vi.fn(),
      };
      handler = new SettingsHandler({
        platform: platform as any,
        accountAiCatalog: accountCatalog as any,
      });

      await handler.sendSettings(webview as any);

      expect(accountCatalog.getSnapshot).toHaveBeenCalledTimes(1);
      expect(platform.config.getAssistantSettingsData).toHaveBeenCalledWith({
        accountCatalog: expect.objectContaining({ source: 'account-gateway' }),
      });
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

    it('rejects model selection updates while any Agent turn is running', async () => {
      const agentRunState = {
        hasRunningAgents: vi.fn().mockReturnValue(true),
      };
      handler = new SettingsHandler({
        platform: platform as any,
        agentRunState,
      });

      await handler.handleUpdateSettings(webview as any, {
        providerId: 'openai',
        modelId: 'gpt-4',
      });

      expect(agentRunState.hasRunningAgents).toHaveBeenCalledTimes(1);
      expect(platform.config.applyRuntimeAssistantSettingsFromWebview).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'settingsUpdated',
        success: false,
        error: AGENT_SESSION_CONFIG_LOCKED_MESSAGE,
      });
    });

    it('rejects model parameter updates while any Agent turn is running', async () => {
      const agentRunState = {
        hasRunningAgents: vi.fn().mockReturnValue(true),
      };
      handler = new SettingsHandler({
        platform: platform as any,
        agentRunState,
      });

      await handler.handleUpdateSettings(webview as any, {
        temperature: 0.2,
        thinkingBudget: 4096,
      });

      expect(agentRunState.hasRunningAgents).toHaveBeenCalledTimes(1);
      expect(platform.config.applyRuntimeAssistantSettingsFromWebview).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'settingsUpdated',
        success: false,
        error: AGENT_SESSION_CONFIG_LOCKED_MESSAGE,
      });
    });

    it('rejects model selection updates while background tasks are active', async () => {
      const agentRunState = {
        hasRunningAgents: vi.fn().mockReturnValue(false),
      };
      const taskState = {
        list: vi.fn().mockResolvedValue([{ id: 'task-1', status: 'running' }]),
      };
      handler = new SettingsHandler({
        platform: platform as any,
        agentRunState,
        taskState: taskState as any,
      });

      await handler.handleUpdateSettings(webview as any, {
        providerId: 'openai',
        modelId: 'gpt-4',
      });

      expect(agentRunState.hasRunningAgents).toHaveBeenCalledTimes(1);
      expect(taskState.list).toHaveBeenCalledTimes(1);
      expect(platform.config.applyRuntimeAssistantSettingsFromWebview).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'settingsUpdated',
        success: false,
        error: AGENT_SESSION_CONFIG_LOCKED_MESSAGE,
      });
    });

    it('allows non-model runtime settings while an Agent turn is running', async () => {
      const agentRunState = {
        hasRunningAgents: vi.fn().mockReturnValue(true),
      };
      handler = new SettingsHandler({
        platform: platform as any,
        agentRunState,
      });
      const update = {
        executionMode: 'plan',
      };

      await handler.handleUpdateSettings(webview as any, update);

      expect(agentRunState.hasRunningAgents).not.toHaveBeenCalled();
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

    it('emits visible activation progress for explicit execution mode changes', async () => {
      handler = new SettingsHandler({
        platform: platform as any,
      });

      await handler.handleUpdateSettings(
        webview as any,
        { executionMode: 'plan' },
        { conversationId: 'conv-1' },
      );

      const progressMessages = webview.postMessage.mock.calls
        .map(([message]) => message)
        .filter((message) => message.type === 'agentCapabilityActivationProgress');
      expect(progressMessages.map((message) => message.events[0].step)).toEqual([
        'requested',
        'validated',
        'projected',
        'active',
      ]);
      expect(progressMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            conversationId: 'conv-1',
            events: [
              expect.objectContaining({
                target: 'execution-mode',
                action: 'set',
                name: 'plan',
                source: 'user-explicit',
                requestedBy: 'user',
                status: 'succeeded',
              }),
            ],
          }),
        ]),
      );
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'settingsUpdated',
        success: true,
      });
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
