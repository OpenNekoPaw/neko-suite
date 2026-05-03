/**
 * Slash Command Handler - Handles slash command invocation from webview
 *
 * Responsible for:
 * - Dispatching builtin commands (/clear, /help, /new, /status, etc.)
 * - Delegating skill-based commands to SkillHandler
 * - Sending status information
 */

import * as vscode from 'vscode';
import {
  buildConversationHistoryClearedMessage,
  buildExtensionSlashStatusPayload,
  runExtensionSlashCommandRuntime,
  type ExtensionCommandHostEffect,
  type ExtensionSlashCommandExecutionDispatch,
  type ExtensionSlashCommandRuntimeDeps,
  type ExtensionSlashCommandRuntimeEffects,
} from '@neko/agent';
import type { IAgentManager } from '../../ai/agentManager';
import type { ConversationBridge } from '../conversationBridge';
import type { SettingsManager } from '../settingsManager';
import type { SystemPromptManager } from '../systemPromptManager';
import type { SkillHandler } from './skillHandler';
import type { TaskHandler } from './taskHandler';
import type { ContextHandler } from './contextHandler';
import type { PlanModeHandler } from './planModeHandler';
import type { AgentMessageTurnHandler } from '../agentMessageTurnHandler';

/**
 * Dependencies for SlashCommandHandler
 */
export interface SlashCommandHandlerDeps {
  conversations: ConversationBridge;
  agentManager?: IAgentManager;
  settings: SettingsManager;
  systemPrompt: SystemPromptManager;
  messages?: AgentMessageTurnHandler;
  skillHandler: SkillHandler;
  taskHandler: TaskHandler;
  contextHandler: ContextHandler;
  planModeHandler: PlanModeHandler;
  /** Callback to send conversation list to webview */
  sendConversationList: () => void;
  /** Callback to send active conversation to webview */
  sendActiveConversation: () => void;
}

/**
 * Handler for slash command webview messages
 */
export class SlashCommandHandler {
  constructor(private deps: SlashCommandHandlerDeps) {}

  updateDeps(partial: Partial<SlashCommandHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * Handle slash command invocation
   * Supports both builtin commands and skill-based commands
   */
  async handleCommand(
    webview: vscode.Webview,
    command: string,
    args: string | undefined,
    conversationId: string,
  ): Promise<void> {
    await runExtensionSlashCommandRuntime(
      { command, conversationId, ...(args !== undefined ? { args } : {}) },
      this._createRuntimeDeps(webview),
      this._createRuntimeEffects(webview),
    );
  }

  /**
   * Send status information to webview
   */
  sendStatusInfo(webview: vscode.Webview, conversationId: string): void {
    webview.postMessage(
      buildExtensionSlashStatusPayload({
        conversationId,
        deps: this._createRuntimeDeps(webview),
      }),
    );
  }

  private _createRuntimeDeps(webview: vscode.Webview): ExtensionSlashCommandRuntimeDeps {
    const skillService = this.deps.skillHandler.getSkillService();

    return {
      conversations: {
        list: () => this.deps.conversations.list(),
        getMessageCount: (conversationId) =>
          this.deps.conversations.getMessageCount(conversationId),
        create: () => this.deps.conversations.create(),
        clearCurrent: (conversationId) =>
          this.deps.conversations.updateMessagesForConversation(conversationId, []),
      },
      skills: {
        skillCount: () => skillService?.registry.skillCount ?? 0,
        listSkills: () => skillService?.registry.listSkills() ?? [],
        listAllSkills: () => skillService?.registry.listAllSkills() ?? [],
        getSkill: (name) => skillService?.registry.getSkill(name),
        getSkillByCommand: (name) => skillService?.registry.getSkillByCommand(name),
        searchSkills: (keyword) => skillService?.registry.searchSkills(keyword) ?? [],
        getActiveSkillName: (conversationId) =>
          this.deps.skillHandler.getActiveSkill(conversationId)?.skill.name ?? null,
        clearActiveSkill: (conversationId) =>
          this.deps.skillHandler.clearActiveSkill(conversationId),
        applySlashCommand: (input) =>
          this.deps.skillHandler.handleSlashCommand(
            webview,
            input.command,
            input.conversationId,
            input.args,
          ),
      },
      settings: {
        provider: this.deps.settings.selectedProviderId,
        model: this.deps.settings.selectedModelId,
        executionMode: this.deps.settings.executionMode,
      },
      planMode: {
        isEnabled: (conversationId) => this.deps.systemPrompt.isPlanMode(conversationId),
        toggle: (conversationId) => {
          this.deps.planModeHandler.handleTogglePlanMode(webview, conversationId);
          return this.deps.systemPrompt.isPlanMode(conversationId);
        },
      },
      contextManager: {
        getTokenCount: (conversationId: string) =>
          this.deps.agentManager?.getContextTokenCount(conversationId) ?? 0,
        compress: async (conversationId: string) => {
          await this.deps.contextHandler.compressContext(webview, conversationId);
        },
      },
    };
  }

  private _createRuntimeEffects(webview: vscode.Webview): ExtensionSlashCommandRuntimeEffects {
    return {
      postMessage: async (message) => {
        await webview.postMessage(message);
      },
      executeHostEffect: (effect) => this._executeCommandHostEffect(webview, effect),
      executeSkillPrompt: (dispatch) => this._executeSkillPrompt(webview, dispatch),
    };
  }

  private _executeCommandHostEffect(
    webview: vscode.Webview,
    effect: ExtensionCommandHostEffect,
  ): void | Promise<void> {
    switch (effect.type) {
      case 'clearAgentHistory':
        this.deps.agentManager?.clearHistory(effect.conversationId);
        return;
      case 'postHistoryCleared':
        void webview.postMessage(buildConversationHistoryClearedMessage(effect.conversationId));
        return;
      case 'refreshConversationList':
        this.deps.sendConversationList();
        return;
      case 'refreshActiveConversation':
        this.deps.sendActiveConversation();
        return;
      case 'sendTasks':
        this.deps.taskHandler.sendTasks(webview, effect.conversationId);
        return;
      case 'executePlanPrompt':
        return this.deps.messages?.handleUserMessage(webview, {
          conversationId: effect.conversationId,
          messageText: effect.messageText,
          sessionMode: effect.sessionMode,
        });
    }
  }

  private _executeSkillPrompt(
    webview: vscode.Webview,
    dispatch: ExtensionSlashCommandExecutionDispatch,
  ): Promise<void> | undefined {
    return this.deps.messages?.handleUserMessage(webview, dispatch);
  }
}
