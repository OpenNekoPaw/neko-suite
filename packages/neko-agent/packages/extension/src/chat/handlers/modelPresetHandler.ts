/**
 * Model Preset Handler - Handles model preset-related webview messages
 *
 * Responsible for:
 * - Sending model presets to webview
 * - Model configuration (API key, base URL)
 * - Model enable/disable
 * - Import/Export configuration
 * - Adding custom models
 */

import * as vscode from 'vscode';
import type { GenericConfigService } from '../../services/genericConfigService';
import { handleError } from '../../base';

/**
 * Dependencies for ModelPresetHandler
 */
export interface ModelPresetHandlerDeps {
  configService?: GenericConfigService;
}

/**
 * Handler for model preset-related webview messages
 */
export class ModelPresetHandler {
  constructor(private deps: ModelPresetHandlerDeps) {}

  /**
   * Update the config service reference
   */
  setConfigService(service: GenericConfigService): void {
    this.deps.configService = service;
  }

  /**
   * Send all model presets to webview
   */
  sendModelPresets(webview: vscode.Webview): void {
    const models = this.deps.configService?.getAllModels() ?? [];
    const serialized = models.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      category: m.category,
      icon: m.icon,
      capabilities: m.capabilities,
      isConfigured: m.isConfigured,
      enabled: m.enabled,
      baseUrl: m.userConfig?.baseUrl ?? m.baseUrl,
      website: m.website,
    }));

    webview.postMessage({
      type: 'modelPresetsData',
      models: serialized,
    });
  }

  /**
   * Handle model preset configuration
   */
  async handleConfigureModelPreset(
    webview: vscode.Webview,
    modelId: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<void> {
    if (!this.deps.configService) return;

    try {
      await this.deps.configService.configureModel(modelId, apiKey, baseUrl);
      this.sendModelPresets(webview);

      webview.postMessage({
        type: 'modelPresetConfigured',
        success: true,
        modelId,
      });
    } catch (error) {
      webview.postMessage({
        type: 'modelPresetConfigured',
        success: false,
        modelId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle model preset toggle
   */
  async handleToggleModelPreset(
    webview: vscode.Webview,
    modelId: string,
    enabled: boolean
  ): Promise<void> {
    if (!this.deps.configService) return;

    try {
      await this.deps.configService.setModelEnabled(modelId, enabled);
      this.sendModelPresets(webview);

      webview.postMessage({
        type: 'modelPresetToggled',
        success: true,
        modelId,
        enabled,
      });
    } catch (error) {
      webview.postMessage({
        type: 'modelPresetToggled',
        success: false,
        modelId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle model preset configuration removal
   */
  async handleRemoveModelPresetConfig(webview: vscode.Webview, modelId: string): Promise<void> {
    if (!this.deps.configService) return;

    try {
      await this.deps.configService.removeModelConfig(modelId);
      this.sendModelPresets(webview);

      webview.postMessage({
        type: 'modelPresetConfigRemoved',
        success: true,
        modelId,
      });
    } catch (error) {
      webview.postMessage({
        type: 'modelPresetConfigRemoved',
        success: false,
        modelId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle model configuration export
   */
  handleExportModelConfig(includeSecrets: boolean): void {
    if (!this.deps.configService) return;

    try {
      const configJson = includeSecrets
        ? this.deps.configService.exportConfigWithSecrets()
        : this.deps.configService.exportConfig();

      // Save to file using VS Code's save dialog
      vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`neko-models-config${includeSecrets ? '-with-keys' : ''}.json`),
        filters: { 'JSON': ['json'] },
      }).then(uri => {
        if (uri) {
          const encoder = new TextEncoder();
          vscode.workspace.fs.writeFile(uri, encoder.encode(configJson)).then(() => {
            vscode.window.showInformationMessage(`Configuration exported to ${uri.fsPath}`);
          });
        }
      });
    } catch (error) {
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  /**
   * Handle model configuration import
   */
  async handleImportModelConfig(
    webview: vscode.Webview,
    jsonString: string,
    options: { overwrite?: boolean; includeSecrets?: boolean }
  ): Promise<void> {
    if (!this.deps.configService) {
      webview.postMessage({
        type: 'modelConfigImported',
        success: false,
        message: 'Config service not available',
      });
      return;
    }

    try {
      const result = await this.deps.configService.importConfig(jsonString, options);
      this.sendModelPresets(webview);

      webview.postMessage({
        type: 'modelConfigImported',
        ...result,
      });
    } catch (error) {
      webview.postMessage({
        type: 'modelConfigImported',
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle adding custom model
   */
  async handleAddCustomModel(
    webview: vscode.Webview,
    configJson: string,
    apiKey?: string
  ): Promise<void> {
    if (!this.deps.configService) {
      webview.postMessage({
        type: 'customModelAdded',
        success: false,
        message: 'Config service not available',
      });
      return;
    }

    try {
      const result = await this.deps.configService.addCustomModel(configJson, apiKey);
      this.sendModelPresets(webview);

      webview.postMessage({
        type: 'customModelAdded',
        ...result,
      });
    } catch (error) {
      webview.postMessage({
        type: 'customModelAdded',
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
