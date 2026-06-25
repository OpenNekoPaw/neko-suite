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
import {
  isAuthorizationFailure,
  type AccountAiCatalogCache,
} from '../../services/accountAiCatalogCache';
import { getLogger } from '../../base';
import { AGENT_SESSION_CONFIG_LOCKED_MESSAGE } from '@neko/agent/runtime';
import type { Task } from '@neko/shared';

interface AgentRunStateReader {
  hasRunningAgents(): boolean;
}

interface AgentTaskStateReader {
  list(): Promise<readonly Task[]>;
}

/**
 * Dependencies for SettingsHandler
 */
export interface SettingsHandlerDeps {
  platform?: Platform;
  accountAiCatalog?: AccountAiCatalogCache;
  agentRunState?: AgentRunStateReader;
  taskState?: AgentTaskStateReader;
}

const logger = getLogger('SettingsHandler');

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
  async sendSettings(
    webview: vscode.Webview,
    options: { readonly reloadConfig?: boolean } = {},
  ): Promise<void> {
    if (!this.deps.platform) return;
    try {
      if (options.reloadConfig === true) {
        this.deps.platform.config.reloadConfig();
      }

      const accountCatalog = await this.getAccountCatalogForSettingsProjection();
      const message = buildAssistantSettingsRuntimeDataMessage({
        getSettingsData: () =>
          this.deps.platform?.config.getAssistantSettingsData({
            accountCatalog,
          }),
      });
      if (message) {
        void webview.postMessage(message);
      }
    } catch (error) {
      logger.warn('Failed to send Agent settings data:', error);
      void webview.postMessage(
        buildAssistantSettingsUpdatedMessage({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load Agent settings',
        }),
      );
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
      updateSettingsFromWebview: async (updates) => {
        if (this.isModelConfigurationUpdate(updates)) {
          await this.assertModelConfigurationUnlocked();
        }
        await platform.config.applyRuntimeAssistantSettingsFromWebview(updates);
      },
    });
    webview.postMessage(message);
  }

  private async assertModelConfigurationUnlocked(): Promise<void> {
    if (this.deps.agentRunState?.hasRunningAgents()) {
      throw new Error(AGENT_SESSION_CONFIG_LOCKED_MESSAGE);
    }
    if (await this.hasActiveTasks()) {
      throw new Error(AGENT_SESSION_CONFIG_LOCKED_MESSAGE);
    }
  }

  private async hasActiveTasks(): Promise<boolean> {
    const tasks = await this.deps.taskState?.list();
    return tasks?.some((task) => task.status === 'pending' || task.status === 'running') ?? false;
  }

  private isModelConfigurationUpdate(settings: Record<string, unknown>): boolean {
    return MODEL_CONFIGURATION_UPDATE_KEYS.some((key) => key in settings);
  }

  private async getAccountCatalogForSettingsProjection() {
    try {
      const result = await this.deps.accountAiCatalog?.getSnapshot();
      return result?.snapshot ?? null;
    } catch (error) {
      if (isAuthorizationFailure(error)) {
        this.deps.accountAiCatalog?.invalidateForAuthFailure(error);
        logger.warn('Account AI catalog authorization failed for settings projection:', error);
        return null;
      }
      throw error;
    }
  }
}

const MODEL_CONFIGURATION_UPDATE_KEYS = [
  'providerId',
  'modelId',
  'selectedProviderId',
  'selectedModelId',
  'defaultProvider',
  'defaultModel',
  'defaultModels',
  'defaultMediaModels',
  'temperature',
  'topP',
  'maxTokens',
  'maxOutputTokens',
  'reasoningEffort',
  'thinkingBudget',
  'verbosity',
  'serviceTier',
  'llmConfig',
  'agentModels',
  'mediaModelSelection',
] as const;
