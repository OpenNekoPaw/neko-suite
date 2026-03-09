/**
 * ModelPresetHandler unit tests
 *
 * ModelPresetHandler is now a stub — config operations are handled by ConfigBridge.
 * These tests verify the stub responds correctly to webview messages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelPresetHandler } from '../modelPresetHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

describe('ModelPresetHandler (stub)', () => {
  let handler: ModelPresetHandler;
  let webview: ReturnType<typeof createMockWebview>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    handler = new ModelPresetHandler({});
  });

  it('should send empty model presets', () => {
    handler.sendModelPresets(webview as any);
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'modelPresetsData',
      models: [],
    });
  });

  it('should no-op on configure', async () => {
    await handler.handleConfigureModelPreset(webview as any, 'claude-3', 'key');
    expect(webview.postMessage).not.toHaveBeenCalled();
  });

  it('should no-op on toggle', async () => {
    await handler.handleToggleModelPreset(webview as any, 'claude-3', false);
    expect(webview.postMessage).not.toHaveBeenCalled();
  });

  it('should no-op on remove', async () => {
    await handler.handleRemoveModelPresetConfig(webview as any, 'claude-3');
    expect(webview.postMessage).not.toHaveBeenCalled();
  });

  it('should report unavailable on import', async () => {
    await handler.handleImportModelConfig(webview as any, '{}', {});
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'modelConfigImported', success: false }),
    );
  });

  it('should report unavailable on add custom model', async () => {
    await handler.handleAddCustomModel(webview as any, '{}');
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'customModelAdded', success: false }),
    );
  });
});
