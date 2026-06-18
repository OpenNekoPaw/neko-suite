/**
 * Settings Handler - Handles settings-related webview messages
 *
 * Responsible for:
 * - Sending current settings to webview
 * - Updating settings from webview changes
 */

import * as vscode from 'vscode';
import {
  buildAssistantSettingsRuntimeDataMessage,
  runAssistantSettingsUpdateRuntime,
  type Platform,
} from '@neko/platform';
import { buildAssistantSettingsUpdatedMessage } from '@neko/platform/config/assistant-config';

/**
 * Dependencies for SettingsHandler
 */
export interface SettingsHandlerDeps {
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
  sendSettings(webview: vscode.Webview, options: { readonly reloadConfig?: boolean } = {}): void {
    if (!this.deps.platform) return;
    if (options.reloadConfig === true) {
      this.deps.platform.config.reloadConfig();
    }

    const message = buildAssistantSettingsRuntimeDataMessage({
      getSettingsData: () => this.deps.platform?.config.getAssistantSettingsData(),
    });
    if (message) {
      webview.postMessage(message);
    }
  }

  /**
   * Handle settings update from webview
   */
  async handleUpdateSettings(
    webview: vscode.Webview,
    settings: Record<string, unknown>,
  ): Promise<void> {
    if (!this.deps.platform) {
      webview.postMessage(
        buildAssistantSettingsUpdatedMessage({
          success: false,
          error: 'Platform is not initialized',
        }),
      );
      return;
    }

    const platform = this.deps.platform;
    const message = await runAssistantSettingsUpdateRuntime(settings, {
      updateSettingsFromWebview: (updates) =>
        platform.config.applyRuntimeAssistantSettingsFromWebview(updates),
    });
    webview.postMessage(message);
  }
}
