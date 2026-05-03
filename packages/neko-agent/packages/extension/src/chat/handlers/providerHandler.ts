/**
 * Provider Handler - Handles provider/model management messages
 *
 * Responsible for:
 * - Adding/removing model providers
 * - Toggling providers and models on/off
 */

import * as vscode from 'vscode';
import {
  runAssistantProviderConfigMutationNotificationRuntime,
  type AssistantProviderConfigInput,
  type AssistantProviderMutationRuntimeRequest,
  type Platform,
} from '@neko/platform';
import { getLogger } from '../../base';

const logger = getLogger('ProviderHandler');

/**
 * Dependencies for ProviderHandler
 */
export interface ProviderHandlerDeps {
  platform?: Platform;
  sendSettings: () => void;
  getWebview: () => vscode.Webview | undefined;
}

/**
 * Handler for provider/model management webview messages
 */
export class ProviderHandler {
  constructor(private deps: ProviderHandlerDeps) {}

  updateDeps(partial: Partial<ProviderHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  async handleAddModel(model: AssistantProviderConfigInput): Promise<void> {
    await this.runMutation({ type: 'addModel', model });
  }

  async handleRemoveModel(modelType: string): Promise<void> {
    await this.runMutation({ type: 'removeModel', providerId: modelType });
  }

  async handleToggleProvider(providerType: string, enabled: boolean): Promise<void> {
    await this.runMutation({ type: 'toggleProvider', providerId: providerType, enabled });
  }

  async handleToggleModel(providerType: string, modelId: string, enabled: boolean): Promise<void> {
    await this.runMutation({ type: 'toggleModel', providerId: providerType, modelId, enabled });
  }

  private async runMutation(request: AssistantProviderMutationRuntimeRequest): Promise<void> {
    await runAssistantProviderConfigMutationNotificationRuntime(
      request,
      this.deps.platform?.config,
      {
        sendSettings: this.deps.sendSettings,
        postMessage: async (message) => {
          await this.deps.getWebview()?.postMessage(message);
        },
        onError: (error) => logger.error('Failed to update provider settings:', error),
      },
    );
  }
}
