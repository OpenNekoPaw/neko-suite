/**
 * ProviderHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderHandler } from '../providerHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockProviders() {
  return {
    addProvider: vi.fn().mockResolvedValue({ success: true }),
    removeProvider: vi.fn().mockResolvedValue({ success: true }),
    toggleProvider: vi.fn().mockResolvedValue(undefined),
    toggleModel: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSettings() {
  return {
    selectedProviderId: 'anthropic' as string | null,
    selectedModelId: 'claude-3' as string | null,
  };
}

describe('ProviderHandler', () => {
  let handler: ProviderHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let providers: ReturnType<typeof createMockProviders>;
  let settings: ReturnType<typeof createMockSettings>;
  let sendSettings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    providers = createMockProviders();
    settings = createMockSettings();
    sendSettings = vi.fn();
  });

  function createHandler(): ProviderHandler {
    return new ProviderHandler({
      providers: providers as any,
      settings: settings as any,
      sendSettings,
      getWebview: () => webview as any,
    });
  }

  describe('handleAddModel', () => {
    it('should do nothing when providers is unavailable', async () => {
      handler = new ProviderHandler({
        settings: settings as any,
        sendSettings,
        getWebview: () => webview as any,
      });
      await handler.handleAddModel({ type: 'openai' });

      expect(sendSettings).not.toHaveBeenCalled();
    });

    it('should add provider and send settings', async () => {
      handler = createHandler();
      await handler.handleAddModel({ type: 'openai', apiKey: 'sk-xxx' });

      expect(providers.addProvider).toHaveBeenCalledWith({ type: 'openai', apiKey: 'sk-xxx' });
      expect(sendSettings).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'modelAdded',
        success: true,
        modelType: 'openai',
        error: undefined,
      });
    });

    it('should report error on failure', async () => {
      providers.addProvider.mockResolvedValue({ success: false, error: 'Invalid API key' });
      handler = createHandler();
      await handler.handleAddModel({ type: 'openai' });

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid API key',
        }),
      );
    });
  });

  describe('handleRemoveModel', () => {
    it('should remove provider and clear selection if it was selected', async () => {
      settings.selectedProviderId = 'openai';
      handler = createHandler();
      await handler.handleRemoveModel('openai');

      expect(providers.removeProvider).toHaveBeenCalledWith('openai');
      expect(settings.selectedProviderId).toBeNull();
      expect(settings.selectedModelId).toBeNull();
      expect(sendSettings).toHaveBeenCalled();
    });

    it('should not clear selection for different provider', async () => {
      settings.selectedProviderId = 'anthropic';
      handler = createHandler();
      await handler.handleRemoveModel('openai');

      expect(settings.selectedProviderId).toBe('anthropic');
    });
  });

  describe('handleToggleProvider', () => {
    it('should toggle provider on', async () => {
      handler = createHandler();
      await handler.handleToggleProvider('openai', true);

      expect(providers.toggleProvider).toHaveBeenCalledWith('openai', true);
      expect(sendSettings).toHaveBeenCalled();
    });

    it('should clear selection when disabling the selected provider', async () => {
      settings.selectedProviderId = 'anthropic';
      handler = createHandler();
      await handler.handleToggleProvider('anthropic', false);

      expect(settings.selectedProviderId).toBeNull();
      expect(settings.selectedModelId).toBeNull();
    });
  });

  describe('handleToggleModel', () => {
    it('should toggle model on', async () => {
      handler = createHandler();
      await handler.handleToggleModel('anthropic', 'claude-4', true);

      expect(providers.toggleModel).toHaveBeenCalledWith('anthropic', 'claude-4', true);
      expect(sendSettings).toHaveBeenCalled();
    });

    it('should clear model selection when disabling selected model', async () => {
      settings.selectedProviderId = 'anthropic';
      settings.selectedModelId = 'claude-3';
      handler = createHandler();
      await handler.handleToggleModel('anthropic', 'claude-3', false);

      expect(settings.selectedModelId).toBeNull();
      // Provider selection should remain
      expect(settings.selectedProviderId).toBe('anthropic');
    });
  });
});
