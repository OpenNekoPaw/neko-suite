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
import {
  executeSkillMarketRequest,
  type Platform,
  type SkillMarketExecutionRequest,
} from '@neko/platform';
import {
  buildConfigBridgeConnectionStateChangedMessage,
  buildConfigBridgeGlobalErrorMessage,
  buildConfigBridgeMarketplaceExecutionMessage,
  buildConfigBridgeSsoSessionChangedMessage,
  NEKO_AUTH_EXTENSION_ID,
  projectConfigBridgeMarketplaceRequest,
  runConfigBridgeQueryRuntime,
  runConfigBridgeSsoLoginRuntime,
  runConfigBridgeSsoLogoutRuntime,
  type ConfigBridgeQueryRequest,
} from '@neko/agent/runtime';
import { getLogger } from '../../base';
import type {
  ConfiguredSkill,
  ConfiguredSlashCommand,
  ConfiguredHook,
  ConfiguredToolGroup,
  IAuthSession,
} from '@neko/shared';
import { type WebviewToExtensionMessage } from '@neko-agent/types';
/** Minimal interface matching neko.neko-auth extension exports (defined locally to avoid cross-extension import). */
interface NekoAuthAPI {
  getSession(): Promise<IAuthSession | null>;
  login(options?: { force?: boolean }): Promise<IAuthSession>;
  logout(): Promise<void>;
  onDidChangeSession: (listener: (session: IAuthSession | null) => void) => { dispose(): void };
}
import { getSkillFileService } from '../SkillFileService';
import { getHookFileService } from '../HookFileService';
import type { ConnectionStateManager, ConnectionStateChangeEvent } from '../connectionStateManager';

import type { PostMessageFn, WebviewConfigState } from './types';
import { broadcastToWebviews } from './broadcastHelper';
import { SkillSyncHandler } from './skillSyncHandler';
import { HookSyncHandler } from './hookSyncHandler';
import { ToolSkillHandler } from './toolSkillHandler';
import { ConfigFileHandler } from './configFileHandler';
import { resolveNekoMarketRuntime } from '../marketBridge';

export type { PostMessageFn } from './types';
export type { ConfigStateWithStatus } from './types';

const logger = getLogger('ConfigBridge');

export const CONFIG_BRIDGE_MESSAGE_TYPES = [
  'getConfig',
  'openUserConfigFile',
  'ssoLogin',
  'ssoLogout',
  'market:search',
  'market:install',
  'market:uninstall',
  'market:listInstalled',
  'market:checkUpdates',
  'market:getFeatured',
] as const satisfies readonly WebviewToExtensionMessage['type'][];

// ---------------------------------------------------------------------------
// neko-auth inter-extension helper
// ---------------------------------------------------------------------------

async function getNekoAuthAPI(): Promise<NekoAuthAPI | undefined> {
  const ext = vscode.extensions.getExtension<NekoAuthAPI>(NEKO_AUTH_EXTENSION_ID);
  if (!ext) return undefined;
  await ext.activate();
  return ext.exports;
}

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

    // Broadcast updated configState to webviews whenever ~/.neko/config.json changes
    // (e.g. after neko-market installs an Ollama model and refreshModels writes new entries)
    const unsubscribeConfig = platform.config.onUserConfigChange(() => {
      void this.broadcastConfigBridgeQuery({ type: 'getConfig' });
    });
    this.disposables.push({ dispose: unsubscribeConfig });

    // Subscribe to neko-auth session changes and broadcast to all webviews.
    // Deferred async: neko-auth may not be activated yet when ConfigBridge constructs.
    void this.initAuthSubscription();
  }

  /**
   * Register a webview to receive broadcasts
   */
  private async initAuthSubscription(): Promise<void> {
    const auth = await getNekoAuthAPI();
    if (!auth) return;
    const sub = auth.onDidChangeSession((session) => {
      broadcastToWebviews(this.activeWebviews, buildConfigBridgeSsoSessionChangedMessage(session));
    });
    this.disposables.push(sub);
  }

  registerWebview(postMessage: PostMessageFn): vscode.Disposable {
    this.activeWebviews.add(postMessage);

    // Send current connection states immediately.
    void this.postConfigBridgeQuery({ type: 'getConnectionStates' }, postMessage);

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
    message: WebviewToExtensionMessage,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const marketRequest = projectConfigBridgeMarketplaceRequest(message);
      if (marketRequest) {
        await this.handleSkillMarketRequest(postMessage, marketRequest);
        return true;
      }

      switch (message.type) {
        case 'getConfig':
          await this.postConfigBridgeQuery({ type: 'getConfig' }, postMessage);
          return true;

        case 'openUserConfigFile':
          await this.configFile.handleOpenUserConfigFile();
          return true;

        case 'ssoLogin': {
          await runConfigBridgeSsoLoginRuntime(
            { ...(message.force !== undefined ? { force: message.force } : {}) },
            {
              getAuth: () => getNekoAuthAPI(),
              postMessage,
            },
          );
          return true;
        }

        case 'ssoLogout': {
          await runConfigBridgeSsoLogoutRuntime({
            getAuth: () => getNekoAuthAPI(),
            postMessage,
          });
          return true;
        }

        default:
          return false;
      }
    } catch (error) {
      logger.error(`Error handling ${message.type}:`, error);
      postMessage(buildConfigBridgeGlobalErrorMessage({ action: message.type, error }));
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

  private buildConfigState(): WebviewConfigState {
    return this.platform.config.getAssistantConfigState();
  }

  private broadcastConnectionStateChange(event: ConnectionStateChangeEvent): void {
    broadcastToWebviews(
      this.activeWebviews,
      buildConfigBridgeConnectionStateChangedMessage({
        id: event.id,
        serviceType: event.type,
        status: event.newStatus,
        ...(event.error !== undefined ? { error: event.error } : {}),
      }),
    );
  }

  private async handleSkillMarketRequest(
    postMessage: PostMessageFn,
    request: SkillMarketExecutionRequest,
  ): Promise<void> {
    const market = (await resolveNekoMarketRuntime()) ?? this.platform.skillMarket;
    await executeSkillMarketRequest({
      market,
      request,
      onEvent: (event) => {
        postMessage(buildConfigBridgeMarketplaceExecutionMessage(event));
      },
      logger,
    });
  }

  private async postConfigBridgeQuery(
    request: ConfigBridgeQueryRequest,
    postMessage: PostMessageFn,
  ): Promise<void> {
    const result = await runConfigBridgeQueryRuntime(request, {
      getConfigState: () => this.buildConfigState(),
      getConnectionStates: () => this.connectionStateManager?.getStatesMap() || {},
      waitForSkillsInit: () => this.skillSync.waitForInit(),
      getSkills: () => this.skillSync.getSkills(),
      getCommands: () => this.skillSync.getCommands(),
      getHooks: () => this.hookSync.getHooks(),
      getToolSkills: () => this.toolSkill.getToolSkills(),
    });
    if (result.message) {
      postMessage(result.message);
    }
  }

  private broadcastConfigBridgeQuery(request: ConfigBridgeQueryRequest): void {
    for (const postMessage of this.activeWebviews) {
      void this.postConfigBridgeQuery(request, postMessage).catch((error) => {
        logger.error(`Failed to broadcast ${request.type}:`, error);
      });
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.activeWebviews.clear();
  }
}
