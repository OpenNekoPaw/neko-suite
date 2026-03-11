/**
 * ConfigBridge - Unified config message routing service
 *
 * Thin orchestrator that delegates to domain-specific handlers:
 * - PromptSyncHandler: Prompt CRUD + file system sync
 * - SkillSyncHandler: Skill file scanning + caching + enabled state
 * - HookSyncHandler: Hook file scanning + caching
 * - ToolSkillHandler: ToolSkill registration + enabled state
 * - ConfigFileHandler: Config file import/watching + openUserConfigFile
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import { getLogger } from '../../base';
import type {
  ConfigState,
  ProviderConfig,
  ModelConfig,
  ConfiguredSkill,
  ConfiguredSlashCommand,
  ConfiguredHook,
  ConfiguredToolGroup,
} from '@neko/shared';
import { getSkillFileService } from '../SkillFileService';
import { getHookFileService } from '../HookFileService';
import type { ConnectionStateManager, ConnectionStateChangeEvent } from '../connectionStateManager';

import type { PostMessageFn } from './types';
import { broadcastToWebviews } from './broadcastHelper';
import { SkillSyncHandler } from './skillSyncHandler';
import { HookSyncHandler } from './hookSyncHandler';
import { ToolSkillHandler } from './toolSkillHandler';
import { ConfigFileHandler } from './configFileHandler';

export type { PostMessageFn } from './types';
export type { ConfigStateWithStatus } from './types';

const logger = getLogger('ConfigBridge');

/**
 * ConfigBridge - message routing orchestrator
 */
export class ConfigBridge implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private activeWebviews: Set<PostMessageFn> = new Set();

  // Domain handlers
  private readonly skillSync: SkillSyncHandler;
  private readonly hookSync: HookSyncHandler;
  private readonly toolSkill: ToolSkillHandler;
  private readonly configFile: ConfigFileHandler;

  constructor(
    private readonly platform: Platform,
    private readonly connectionStateManager?: ConnectionStateManager,
    context?: vscode.ExtensionContext,
  ) {
    // Initialize domain handlers
    this.skillSync = new SkillSyncHandler(getSkillFileService(), this.activeWebviews, context);
    this.hookSync = new HookSyncHandler(getHookFileService(), this.activeWebviews);
    this.toolSkill = new ToolSkillHandler(this.activeWebviews, context);
    this.configFile = new ConfigFileHandler(platform, this.activeWebviews);

    // Register disposable sub-handlers
    this.disposables.push(this.skillSync, this.hookSync, this.configFile);

    // Listen for connection state changes
    if (connectionStateManager) {
      const listener = connectionStateManager.addListener((event) => {
        this.broadcastConnectionStateChange(event);
      });
      this.disposables.push(listener);
    }

    // Initialize all handlers
    this.skillSync.init();
    this.hookSync.init();
    void this.configFile.init();
  }

  /**
   * Register a webview to receive broadcasts
   */
  registerWebview(postMessage: PostMessageFn): vscode.Disposable {
    this.activeWebviews.add(postMessage);

    // Send current connection states immediately
    if (this.connectionStateManager) {
      postMessage({
        type: 'connectionStates',
        states: this.connectionStateManager.getStatesMap(),
      });
    }

    return {
      dispose: () => {
        this.activeWebviews.delete(postMessage);
      },
    };
  }

  /**
   * Handle a config-related message from webview
   * @returns true if message was handled, false otherwise
   */
  async handleMessage(
    message: { type: string; [key: string]: unknown },
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    const cm = this.platform.config;

    try {
      switch (message.type) {
        case 'getConfig':
          postMessage({ type: 'configState', config: this.buildConfigState() });
          return true;

        case 'getConfigWithStatus':
          postMessage({
            type: 'configStateWithStatus',
            config: this.buildConfigStateWithStatus(),
          });
          return true;

        case 'getSkills':
          await this.skillSync.waitForInit();
          postMessage({
            type: 'skillsData',
            skills: this.skillSync.getSkills(),
            commands: this.skillSync.getCommands(),
          });
          return true;

        case 'getHooks':
          postMessage({
            type: 'hooksData',
            hooks: this.hookSync.getHooks(),
          });
          return true;

        case 'getConnectionStates':
          if (this.connectionStateManager) {
            postMessage({
              type: 'connectionStates',
              states: this.connectionStateManager.getStatesMap(),
            });
          }
          return true;

        case 'getToolSkills':
          postMessage({
            type: 'toolSkillsData',
            toolSkills: this.toolSkill.getToolSkills(),
          });
          return true;

        case 'updateProvider':
          await cm.setProvider(message.provider as ProviderConfig);
          this.notifyChange(postMessage, 'provider', (message.provider as ProviderConfig).id);
          return true;

        case 'updateModel':
          await cm.setModel(message.model as ModelConfig);
          this.notifyChange(postMessage, 'model', (message.model as ModelConfig).id);
          return true;

        case 'deleteProvider':
          await cm.removeProvider((message.providerId || message.id) as string);
          this.notifyChange(postMessage, 'provider', (message.providerId || message.id) as string);
          return true;

        case 'deleteModel':
          await cm.removeModel((message.modelId || message.id) as string);
          this.notifyChange(postMessage, 'model', (message.modelId || message.id) as string);
          return true;

        case 'listProviderModels': {
          const providerId = message.providerId as string;
          const requestId = message.requestId as string;
          this.handleListProviderModels(providerId, requestId, postMessage);
          return true;
        }

        case 'validateApiKey': {
          const providerId = message.providerId as string;
          const modelId = message.modelId as string | undefined;
          const requestId = message.requestId as string;
          this.handleValidateApiKey(providerId, modelId, requestId, postMessage);
          return true;
        }

        case 'openUserConfigFile':
          await this.configFile.handleOpenUserConfigFile();
          return true;

        default:
          return false;
      }
    } catch (error) {
      logger.error(`Error handling ${message.type}:`, error);
      postMessage({
        type: 'error',
        message: `Failed to ${message.type}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return true;
    }
  }

  // ---- Public accessors (used by chatProvider) ----

  setToolSkills(toolSkills: ConfiguredToolGroup[]): void {
    this.toolSkill.setToolSkills(toolSkills);
  }

  getSkills(): ConfiguredSkill[] {
    return this.skillSync.getSkills();
  }

  getCommands(): ConfiguredSlashCommand[] {
    return this.skillSync.getCommands();
  }

  getHooks(): ConfiguredHook[] {
    return this.hookSync.getHooks();
  }

  getToolSkills(): ConfiguredToolGroup[] {
    return this.toolSkill.getToolSkills();
  }

  // ---- Private helpers ----

  private buildConfigState(): ConfigState {
    const cm = this.platform.config;
    return {
      providers: cm.getProviders(),
      models: cm.getModels(),
      mcpServers: cm.getMCPServers(),
      skills: this.skillSync.getSkills(),
      commands: this.skillSync.getCommands(),
    };
  }

  private buildConfigStateWithStatus() {
    return {
      ...this.buildConfigState(),
      connectionStates: this.connectionStateManager?.getStatesMap() || {},
    };
  }

  private notifyChange(
    postMessage: PostMessageFn,
    changeType: 'provider' | 'model' | 'mcp' | 'all',
    id: string,
  ): void {
    postMessage({ type: 'configChanged', changeType, id });
  }

  private async handleListProviderModels(
    providerId: string,
    requestId: string,
    postMessage: PostMessageFn,
  ): Promise<void> {
    try {
      const service = this.platform.createService();
      const models = await service.listProviderModelsDetailed(providerId);
      postMessage({
        type: 'providerModelsResult',
        requestId,
        providerId,
        success: true,
        models,
      });
    } catch (error) {
      logger.error(`Error listing models for ${providerId}:`, error);
      postMessage({
        type: 'providerModelsResult',
        requestId,
        providerId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleValidateApiKey(
    providerId: string,
    modelId: string | undefined,
    requestId: string,
    postMessage: PostMessageFn,
  ): Promise<void> {
    try {
      const service = this.platform.createService();
      const result = await service.validateProviderApiKey(providerId, modelId);
      postMessage({
        type: 'validateApiKeyResult',
        requestId,
        providerId,
        modelId,
        success: true,
        valid: result.valid,
        error: result.error,
      });
    } catch (error) {
      logger.error(
        `Error validating API key for ${providerId}${modelId ? ` model ${modelId}` : ''}:`,
        error,
      );
      postMessage({
        type: 'validateApiKeyResult',
        requestId,
        providerId,
        modelId,
        success: false,
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private broadcastConnectionStateChange(event: ConnectionStateChangeEvent): void {
    broadcastToWebviews(this.activeWebviews, {
      type: 'connectionStateChanged',
      id: event.id,
      serviceType: event.type,
      status: event.newStatus,
      error: event.error,
    });
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.activeWebviews.clear();
  }
}
