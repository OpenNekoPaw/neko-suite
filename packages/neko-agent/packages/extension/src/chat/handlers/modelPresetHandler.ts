/**
 * Model Preset Handler - Handles model preset-related webview messages
 *
 * Note: Model preset operations are now handled via ConfigBridge.
 * This handler is kept as a stub for webview message routing compatibility.
 * All methods respond with empty/no-op results.
 */

import * as vscode from 'vscode';

/**
 * Dependencies for ModelPresetHandler (currently unused)
 */
export interface ModelPresetHandlerDeps {}

/**
 * Stub handler for model preset-related webview messages.
 * Actual config operations are handled by ConfigBridge.
 */
export class ModelPresetHandler {
  constructor(_deps: ModelPresetHandlerDeps) {}

  sendModelPresets(webview: vscode.Webview): void {
    webview.postMessage({ type: 'modelPresetsData', models: [] });
  }

  async handleConfigureModelPreset(
    _webview: vscode.Webview,
    _modelId: string,
    _apiKey: string,
    _baseUrl?: string
  ): Promise<void> {}

  async handleToggleModelPreset(
    _webview: vscode.Webview,
    _modelId: string,
    _enabled: boolean
  ): Promise<void> {}

  async handleRemoveModelPresetConfig(_webview: vscode.Webview, _modelId: string): Promise<void> {}

  handleExportModelConfig(_includeSecrets: boolean): void {}

  async handleImportModelConfig(
    webview: vscode.Webview,
    _jsonString: string,
    _options: { overwrite?: boolean; includeSecrets?: boolean }
  ): Promise<void> {
    webview.postMessage({
      type: 'modelConfigImported',
      success: false,
      message: 'Config service not available',
    });
  }

  async handleAddCustomModel(
    webview: vscode.Webview,
    _configJson: string,
    _apiKey?: string
  ): Promise<void> {
    webview.postMessage({
      type: 'customModelAdded',
      success: false,
      message: 'Config service not available',
    });
  }
}
