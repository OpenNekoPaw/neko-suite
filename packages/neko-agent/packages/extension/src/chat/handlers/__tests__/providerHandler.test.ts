/**
 * ProviderHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderHandler } from '../providerHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockPlatform() {
  const selection = {
    selectedProviderId: 'anthropic' as string | null,
    selectedModelId: 'claude-3' as string | null,
  };
  return {
    selection,
    config: {
      updateProviderOverride: vi.fn().mockResolvedValue(undefined),
      removeProviderOverride: vi.fn().mockResolvedValue(undefined),
      updateModelOverride: vi.fn().mockResolvedValue(undefined),
      getAssistantSettingsSnapshot: vi.fn(() => ({ ...selection })),
      setAssistantSettings: vi.fn(async (update: Partial<typeof selection>) => {
        Object.assign(selection, update);
      }),
    },
  };
}

describe('ProviderHandler', () => {
  let handler: ProviderHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let platform: ReturnType<typeof createMockPlatform>;
  let sendSettings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    platform = createMockPlatform();
    sendSettings = vi.fn();
  });

  function createHandler(): ProviderHandler {
    return new ProviderHandler({
      platform: platform as any,
      sendSettings,
      getWebview: () => webview as any,
    });
  }

  describe('handleAddModel', () => {
    it('should do nothing when platform is unavailable', async () => {
      handler = new ProviderHandler({
        sendSettings,
        getWebview: () => webview as any,
      });
      await handler.handleAddModel({ type: 'openai' });

      expect(sendSettings).not.toHaveBeenCalled();
    });

    it('should add provider and send settings', async () => {
      handler = createHandler();
      await handler.handleAddModel({ type: 'openai', apiKey: 'sk-xxx' });

      expect(platform.config.updateProviderOverride).toHaveBeenCalledWith('openai', {
        apiKey: 'sk-xxx',
        apiUrl: undefined,
      });
      expect(sendSettings).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'modelAdded',
        success: true,
        modelType: 'openai',
      });
    });

    it('should report error on failure', async () => {
      platform.config.updateProviderOverride.mockRejectedValue(new Error('Invalid API key'));
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
      platform.selection.selectedProviderId = 'openai';
      handler = createHandler();
      await handler.handleRemoveModel('openai');

      expect(platform.config.removeProviderOverride).toHaveBeenCalledWith('openai');
      expect(platform.selection.selectedProviderId).toBeNull();
      expect(platform.selection.selectedModelId).toBeNull();
      expect(sendSettings).toHaveBeenCalled();
    });

    it('should not clear selection for different provider', async () => {
      platform.selection.selectedProviderId = 'anthropic';
      handler = createHandler();
      await handler.handleRemoveModel('openai');

      expect(platform.selection.selectedProviderId).toBe('anthropic');
    });
  });

  describe('handleToggleProvider', () => {
    it('should toggle provider on', async () => {
      handler = createHandler();
      await handler.handleToggleProvider('openai', true);

      expect(platform.config.updateProviderOverride).toHaveBeenCalledWith('openai', {
        enabled: true,
      });
      expect(sendSettings).toHaveBeenCalled();
    });

    it('should clear selection when disabling the selected provider', async () => {
      platform.selection.selectedProviderId = 'anthropic';
      handler = createHandler();
      await handler.handleToggleProvider('anthropic', false);

      expect(platform.selection.selectedProviderId).toBeNull();
      expect(platform.selection.selectedModelId).toBeNull();
    });

    it('should report provider update failures without throwing', async () => {
      platform.config.updateProviderOverride.mockRejectedValue(new Error('Config write failed'));
      handler = createHandler();

      await handler.handleToggleProvider('anthropic', false);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'globalError',
        message: 'Failed to update provider settings: Config write failed',
      });
    });
  });

  describe('handleToggleModel', () => {
    it('should toggle model on', async () => {
      handler = createHandler();
      await handler.handleToggleModel('anthropic', 'claude-4', true);

      expect(platform.config.updateModelOverride).toHaveBeenCalledWith('claude-4', {
        enabled: true,
      });
      expect(sendSettings).toHaveBeenCalled();
    });

    it('should clear model selection when disabling selected model', async () => {
      platform.selection.selectedProviderId = 'anthropic';
      platform.selection.selectedModelId = 'claude-3';
      handler = createHandler();
      await handler.handleToggleModel('anthropic', 'claude-3', false);

      expect(platform.selection.selectedModelId).toBeNull();
      // Provider selection should remain
      expect(platform.selection.selectedProviderId).toBe('anthropic');
    });
  });
});
