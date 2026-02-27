/**
 * Provider Handler - Handles provider/model management messages
 *
 * Responsible for:
 * - Adding/removing model providers
 * - Toggling providers and models on/off
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providerManager';
import type { SettingsManager } from '../settingsManager';

/**
 * Dependencies for ProviderHandler
 */
export interface ProviderHandlerDeps {
  providers?: ProviderManager;
  settings: SettingsManager;
  sendSettings: () => void;
  getWebview: () => vscode.Webview | undefined;
}

/**
 * Handler for provider/model management webview messages
 */
export class ProviderHandler {
  constructor(private deps: ProviderHandlerDeps) {}

  async handleAddModel(model: any): Promise<void> {
    if (!this.deps.providers) return;

    const result = await this.deps.providers.addProvider(model);
    this.deps.sendSettings();

    const webview = this.deps.getWebview();
    if (webview) {
      webview.postMessage({
        type: 'modelAdded',
        success: result.success,
        modelType: model.type,
        error: result.error,
      });
    }
  }

  async handleRemoveModel(modelType: string): Promise<void> {
    if (!this.deps.providers) return;

    const result = await this.deps.providers.removeProvider(modelType);

    if (this.deps.settings.selectedProviderId === modelType) {
      this.deps.settings.selectedProviderId = null;
      this.deps.settings.selectedModelId = null;
    }

    this.deps.sendSettings();

    const webview = this.deps.getWebview();
    if (webview) {
      webview.postMessage({
        type: 'modelRemoved',
        success: result.success,
        modelType,
        error: result.error,
      });
    }
  }

  async handleToggleProvider(providerType: string, enabled: boolean): Promise<void> {
    if (!this.deps.providers) return;

    await this.deps.providers.toggleProvider(providerType, enabled);

    if (!enabled && this.deps.settings.selectedProviderId === providerType) {
      this.deps.settings.selectedProviderId = null;
      this.deps.settings.selectedModelId = null;
    }

    this.deps.sendSettings();
  }

  async handleToggleModel(providerType: string, modelId: string, enabled: boolean): Promise<void> {
    if (!this.deps.providers) return;

    await this.deps.providers.toggleModel(providerType, modelId, enabled);

    if (!enabled && this.deps.settings.selectedProviderId === providerType && this.deps.settings.selectedModelId === modelId) {
      this.deps.settings.selectedModelId = null;
    }

    this.deps.sendSettings();
  }
}
