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
  ConfiguredSkill,
  ConfiguredSlashCommand,
  ConfiguredHook,
  ConfiguredToolGroup,
  IAuthSession,
} from '@neko/shared';
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

import type { PostMessageFn } from './types';
import { broadcastToWebviews } from './broadcastHelper';
import { SkillSyncHandler } from './skillSyncHandler';
import { HookSyncHandler } from './hookSyncHandler';
import { ToolSkillHandler } from './toolSkillHandler';
import { ConfigFileHandler } from './configFileHandler';

export type { PostMessageFn } from './types';
export type { ConfigStateWithStatus } from './types';

const logger = getLogger('ConfigBridge');

// ---------------------------------------------------------------------------
// neko-auth inter-extension helper
// ---------------------------------------------------------------------------

function getNekoAuthAPI(): NekoAuthAPI | undefined {
  return vscode.extensions.getExtension<NekoAuthAPI>('neko.neko-auth')?.exports;
}

function toSsoSession(s: IAuthSession): { user: string; plan?: string; usage?: number } {
  return { user: s.user, plan: s.plan, usage: s.usage };
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

    // Subscribe to neko-auth session changes and broadcast to all webviews
    const auth = getNekoAuthAPI();
    if (auth) {
      const sub = auth.onDidChangeSession((session) => {
        broadcastToWebviews(this.activeWebviews, {
          type: 'ssoSessionChanged',
          session: session ? toSsoSession(session) : null,
        });
      });
      this.disposables.push(sub);
    }
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

        case 'openUserConfigFile':
          await this.configFile.handleOpenUserConfigFile();
          return true;

        case 'ssoLogin': {
          const auth = getNekoAuthAPI();
          if (!auth) {
            postMessage({
              type: 'ssoError',
              error: 'neko-auth extension is not installed or active',
            });
            return true;
          }
          try {
            const session = await auth.login({ force: message.force as boolean | undefined });
            postMessage({ type: 'ssoSessionChanged', session: toSsoSession(session) });
          } catch (err) {
            postMessage({
              type: 'ssoError',
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return true;
        }

        case 'ssoLogout': {
          await getNekoAuthAPI()?.logout();
          postMessage({ type: 'ssoSessionChanged', session: null });
          return true;
        }

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

  private buildConfigState(): Pick<ConfigState, 'providers'> {
    const cm = this.platform.config;
    return {
      providers: cm.getProviders(),
    };
  }

  private buildConfigStateWithStatus() {
    return {
      ...this.buildConfigState(),
      connectionStates: this.connectionStateManager?.getStatesMap() || {},
    };
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
