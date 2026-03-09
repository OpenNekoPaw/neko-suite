/**
 * Settings Handler - Handles settings-related webview messages
 *
 * Responsible for:
 * - Sending current settings to webview
 * - Updating settings from webview changes
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import type { SettingsManager } from '../settingsManager';
import type { ProviderManager } from '../providerManager';

/**
 * Dependencies for SettingsHandler
 */
export interface SettingsHandlerDeps {
  settings: SettingsManager;
  providers?: ProviderManager;
  platform?: Platform;
}

/**
 * Handler for settings-related webview messages
 */
export class SettingsHandler {
  constructor(private deps: SettingsHandlerDeps) {}

  updateDeps(partial: Partial<SettingsHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * Send all settings data to webview
   */
  sendSettings(webview: vscode.Webview): void {
    if (!this.deps.providers) return;

    const providers = this.deps.providers.getAllProviders();
    const configuredProviders = this.deps.providers.getConfiguredProviders();
    const providerTemplates = this.deps.providers.getProviderTemplates();

    if (!this.deps.settings.selectedProviderId) {
      const defaultProvider = this.deps.providers.getDefaultProvider();
      if (defaultProvider) {
        this.deps.settings.selectedProviderId = defaultProvider.id;
        this.deps.settings.selectedModelId = defaultProvider.getDefaultModel();
      }
    }

    // Get chat model options from Platform ConfigManager
    const chatModelOptions = this.deps.platform?.config.getChatModelOptions() ?? [];

    webview.postMessage({
      type: 'settingsData',
      providers,
      configuredProviders,
      providerTemplates,
      selectedProviderId: this.deps.settings.selectedProviderId,
      selectedModelId: this.deps.settings.selectedModelId,
      systemPrompt: this.deps.settings.customSystemPrompt,
      autoExecuteTools: this.deps.settings.get('autoExecuteTools'),
      streamResponses: this.deps.settings.get('streamResponses'),
      showToolCalls: this.deps.settings.get('showToolCalls'),
      temperature: this.deps.settings.temperature,
      maxTokens: this.deps.settings.maxTokens,
      executionMode: this.deps.settings.executionMode,
      chatModelOptions,
    });
  }

  /**
   * Handle settings update from webview
   */
  handleUpdateSettings(webview: vscode.Webview, settings: Record<string, unknown>): void {
    if (settings.providerId !== undefined)
      this.deps.settings.selectedProviderId = settings.providerId as string;
    if (settings.modelId !== undefined)
      this.deps.settings.selectedModelId = settings.modelId as string;
    if (settings.systemPrompt !== undefined)
      this.deps.settings.customSystemPrompt = settings.systemPrompt as string;
    if (settings.autoExecuteTools !== undefined)
      this.deps.settings.set('autoExecuteTools', settings.autoExecuteTools as boolean);
    if (settings.streamResponses !== undefined)
      this.deps.settings.set('streamResponses', settings.streamResponses as boolean);
    if (settings.showToolCalls !== undefined)
      this.deps.settings.set('showToolCalls', settings.showToolCalls as boolean);
    if (settings.temperature !== undefined)
      this.deps.settings.set('temperature', settings.temperature as number);
    if (settings.maxTokens !== undefined)
      this.deps.settings.set('maxTokens', settings.maxTokens as number);
    if (settings.executionMode !== undefined)
      this.deps.settings.executionMode = settings.executionMode as 'plan' | 'ask' | 'auto';

    webview.postMessage({ type: 'settingsUpdated', success: true });
  }
}
