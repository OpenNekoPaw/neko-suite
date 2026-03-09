/**
 * SettingsHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsHandler } from '../settingsHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockSettings() {
  const store = new Map<string, unknown>();
  return {
    selectedProviderId: 'anthropic' as string | null,
    selectedModelId: 'claude-3' as string | null,
    customSystemPrompt: 'You are a helpful assistant',
    temperature: 0.7,
    maxTokens: 4096,
    executionMode: 'auto' as 'plan' | 'ask' | 'auto',
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
}

function createMockProviders() {
  return {
    getAllProviders: vi.fn().mockReturnValue([{ id: 'anthropic', name: 'Anthropic' }]),
    getConfiguredProviders: vi.fn().mockReturnValue([{ id: 'anthropic' }]),
    getProviderTemplates: vi.fn().mockReturnValue([]),
    getDefaultProvider: vi.fn().mockReturnValue({
      id: 'anthropic',
      getDefaultModel: () => 'claude-3',
    }),
  };
}

describe('SettingsHandler', () => {
  let handler: SettingsHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let settings: ReturnType<typeof createMockSettings>;
  let providers: ReturnType<typeof createMockProviders>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    settings = createMockSettings();
    providers = createMockProviders();
  });

  describe('sendSettings', () => {
    it('should do nothing when providers is unavailable', () => {
      handler = new SettingsHandler({ settings: settings as any });
      handler.sendSettings(webview as any);

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should send settings data to webview', () => {
      handler = new SettingsHandler({
        settings: settings as any,
        providers: providers as any,
      });
      handler.sendSettings(webview as any);

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

    it('should auto-select default provider when none selected', () => {
      settings.selectedProviderId = null;
      settings.selectedModelId = null;

      handler = new SettingsHandler({
        settings: settings as any,
        providers: providers as any,
      });
      handler.sendSettings(webview as any);

      expect(settings.selectedProviderId).toBe('anthropic');
      expect(settings.selectedModelId).toBe('claude-3');
    });
  });

  describe('handleUpdateSettings', () => {
    it('should update provider and model', () => {
      handler = new SettingsHandler({
        settings: settings as any,
        providers: providers as any,
      });
      handler.handleUpdateSettings(webview as any, {
        providerId: 'openai',
        modelId: 'gpt-4',
      });

      expect(settings.selectedProviderId).toBe('openai');
      expect(settings.selectedModelId).toBe('gpt-4');
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'settingsUpdated',
        success: true,
      });
    });

    it('should update boolean settings', () => {
      handler = new SettingsHandler({
        settings: settings as any,
        providers: providers as any,
      });
      handler.handleUpdateSettings(webview as any, {
        autoExecuteTools: true,
        streamResponses: false,
        showToolCalls: true,
      });

      expect(settings.set).toHaveBeenCalledWith('autoExecuteTools', true);
      expect(settings.set).toHaveBeenCalledWith('streamResponses', false);
      expect(settings.set).toHaveBeenCalledWith('showToolCalls', true);
    });

    it('should update numeric settings', () => {
      handler = new SettingsHandler({
        settings: settings as any,
        providers: providers as any,
      });
      handler.handleUpdateSettings(webview as any, {
        temperature: 0.5,
        maxTokens: 8192,
      });

      expect(settings.set).toHaveBeenCalledWith('temperature', 0.5);
      expect(settings.set).toHaveBeenCalledWith('maxTokens', 8192);
    });

    it('should update execution mode', () => {
      handler = new SettingsHandler({
        settings: settings as any,
        providers: providers as any,
      });
      handler.handleUpdateSettings(webview as any, {
        executionMode: 'plan',
      });

      expect(settings.executionMode).toBe('plan');
    });

    it('should only update provided fields', () => {
      handler = new SettingsHandler({
        settings: settings as any,
        providers: providers as any,
      });
      handler.handleUpdateSettings(webview as any, {
        temperature: 0.3,
      });

      // Should not touch provider/model
      expect(settings.selectedProviderId).toBe('anthropic');
      expect(settings.selectedModelId).toBe('claude-3');
    });
  });
});
