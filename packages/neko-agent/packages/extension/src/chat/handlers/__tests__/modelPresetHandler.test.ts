/**
 * ModelPresetHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelPresetHandler } from '../modelPresetHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockConfigService() {
  return {
    getAllModels: vi.fn().mockReturnValue([
      {
        id: 'claude-3',
        name: 'Claude 3',
        description: 'Latest model',
        category: 'chat',
        icon: 'brain',
        capabilities: ['chat', 'code'],
        isConfigured: true,
        enabled: true,
        baseUrl: 'https://api.anthropic.com',
        userConfig: { baseUrl: 'https://custom.api.com' },
        website: 'https://anthropic.com',
      },
    ]),
    configureModel: vi.fn().mockResolvedValue(undefined),
    setModelEnabled: vi.fn().mockResolvedValue(undefined),
    removeModelConfig: vi.fn().mockResolvedValue(undefined),
    exportConfig: vi.fn().mockReturnValue('{"models":[]}'),
    exportConfigWithSecrets: vi.fn().mockReturnValue('{"models":[],"keys":{}}'),
    importConfig: vi.fn().mockResolvedValue({ success: true, message: 'Imported 3 models' }),
    addCustomModel: vi.fn().mockResolvedValue({ success: true, modelId: 'custom-1' }),
  };
}

describe('ModelPresetHandler', () => {
  let handler: ModelPresetHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    configService = createMockConfigService();
  });

  describe('sendModelPresets', () => {
    it('should send empty array when no configService', () => {
      handler = new ModelPresetHandler({});
      handler.sendModelPresets(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'modelPresetsData',
        models: [],
      });
    });

    it('should serialize and send model data', () => {
      handler = new ModelPresetHandler({ configService: configService as any });
      handler.sendModelPresets(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'modelPresetsData',
        models: [
          expect.objectContaining({
            id: 'claude-3',
            name: 'Claude 3',
            baseUrl: 'https://custom.api.com', // userConfig overrides
          }),
        ],
      });
    });
  });

  describe('setConfigService', () => {
    it('should update the config service reference', () => {
      handler = new ModelPresetHandler({});
      handler.sendModelPresets(webview as any);
      expect(webview.postMessage).toHaveBeenCalledWith({ type: 'modelPresetsData', models: [] });

      handler.setConfigService(configService as any);
      handler.sendModelPresets(webview as any);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelPresetsData', models: expect.any(Array) }),
      );
      // Should now have models
      const lastCall = webview.postMessage.mock.calls.at(-1)![0];
      expect(lastCall.models).toHaveLength(1);
    });
  });

  describe('handleConfigureModelPreset', () => {
    it('should do nothing when no configService', async () => {
      handler = new ModelPresetHandler({});
      await handler.handleConfigureModelPreset(webview as any, 'claude-3', 'key');

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should configure model and refresh presets', async () => {
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleConfigureModelPreset(webview as any, 'claude-3', 'sk-xxx', 'https://api.example.com');

      expect(configService.configureModel).toHaveBeenCalledWith('claude-3', 'sk-xxx', 'https://api.example.com');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelPresetConfigured', success: true, modelId: 'claude-3' }),
      );
    });

    it('should report error on failure', async () => {
      configService.configureModel.mockRejectedValue(new Error('Invalid key'));
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleConfigureModelPreset(webview as any, 'claude-3', 'bad-key');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelPresetConfigured', success: false, error: 'Invalid key' }),
      );
    });
  });

  describe('handleToggleModelPreset', () => {
    it('should do nothing when no configService', async () => {
      handler = new ModelPresetHandler({});
      await handler.handleToggleModelPreset(webview as any, 'claude-3', false);

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should toggle model and report success', async () => {
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleToggleModelPreset(webview as any, 'claude-3', false);

      expect(configService.setModelEnabled).toHaveBeenCalledWith('claude-3', false);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelPresetToggled', success: true, enabled: false }),
      );
    });

    it('should report error on failure', async () => {
      configService.setModelEnabled.mockRejectedValue(new Error('Not found'));
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleToggleModelPreset(webview as any, 'unknown', true);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelPresetToggled', success: false, error: 'Not found' }),
      );
    });
  });

  describe('handleRemoveModelPresetConfig', () => {
    it('should do nothing when no configService', async () => {
      handler = new ModelPresetHandler({});
      await handler.handleRemoveModelPresetConfig(webview as any, 'claude-3');

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should remove config and report success', async () => {
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleRemoveModelPresetConfig(webview as any, 'claude-3');

      expect(configService.removeModelConfig).toHaveBeenCalledWith('claude-3');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelPresetConfigRemoved', success: true }),
      );
    });

    it('should report error on failure', async () => {
      configService.removeModelConfig.mockRejectedValue(new Error('Remove failed'));
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleRemoveModelPresetConfig(webview as any, 'claude-3');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelPresetConfigRemoved', success: false, error: 'Remove failed' }),
      );
    });
  });

  describe('handleImportModelConfig', () => {
    it('should report error when no configService', async () => {
      handler = new ModelPresetHandler({});
      await handler.handleImportModelConfig(webview as any, '{}', {});

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelConfigImported', success: false }),
      );
    });

    it('should import config and send result', async () => {
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleImportModelConfig(webview as any, '{"models":[]}', { overwrite: true });

      expect(configService.importConfig).toHaveBeenCalledWith('{"models":[]}', { overwrite: true });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelConfigImported', success: true }),
      );
    });

    it('should report error on import failure', async () => {
      configService.importConfig.mockRejectedValue(new Error('Parse error'));
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleImportModelConfig(webview as any, 'bad json', {});

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'modelConfigImported', success: false, message: 'Parse error' }),
      );
    });
  });

  describe('handleAddCustomModel', () => {
    it('should report error when no configService', async () => {
      handler = new ModelPresetHandler({});
      await handler.handleAddCustomModel(webview as any, '{}');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'customModelAdded', success: false }),
      );
    });

    it('should add custom model and send result', async () => {
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleAddCustomModel(webview as any, '{"name":"GPT-5"}', 'sk-key');

      expect(configService.addCustomModel).toHaveBeenCalledWith('{"name":"GPT-5"}', 'sk-key');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'customModelAdded', success: true }),
      );
    });

    it('should report error on add failure', async () => {
      configService.addCustomModel.mockRejectedValue(new Error('Invalid config'));
      handler = new ModelPresetHandler({ configService: configService as any });
      await handler.handleAddCustomModel(webview as any, 'bad');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'customModelAdded', success: false, message: 'Invalid config' }),
      );
    });
  });
});
