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
import { type Platform } from '@neko/platform';
import {
  buildConfigBridgeGlobalErrorMessage,
  buildConfigBridgeSsoSessionChangedMessage,
  NEKO_AUTH_EXTENSION_ID,
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

import type { PostMessageFn, WebviewConfigState } from './types';
import { broadcastToWebviews } from './broadcastHelper';
import { SkillSyncHandler } from './skillSyncHandler';
import { HookSyncHandler } from './hookSyncHandler';
import { ToolSkillHandler } from './toolSkillHandler';
import { ConfigFileHandler } from './configFileHandler';

export type { PostMessageFn } from './types';

const logger = getLogger('ConfigBridge');

export const CONFIG_BRIDGE_MESSAGE_TYPES = [
  'getConfig',
  'openUserConfigFile',
  'ssoLogin',
  'ssoLogout',
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
    _connectionStateManager?: unknown,
    context?: vscode.ExtensionContext,
  ) {
    // Initialize domain handlers
    void _connectionStateManager;
    this.skillSync = new SkillSyncHandler(getSkillFileService(), context);
    this.hookSync = new HookSyncHandler(getHookFileService());
    this.toolSkill = new ToolSkillHandler(context);
    this.configFile = new ConfigFileHandler(platform, this.activeWebviews);

    // Register disposable sub-handlers
    this.disposables.push(this.skillSync, this.hookSync, this.configFile);

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

  private async postConfigBridgeQuery(
    request: ConfigBridgeQueryRequest,
    postMessage: PostMessageFn,
  ): Promise<void> {
    const result = await runConfigBridgeQueryRuntime(request, {
      getConfigState: () => this.buildConfigState(),
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
