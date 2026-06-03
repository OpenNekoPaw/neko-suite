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
import type { CharacterDialogueController } from '../characterDialogueController';
import { getLogger } from '../../base';
import {
  NPC_TEST_BENCH_AS_SLASH_COMMAND_NAME,
  NPC_TEST_BENCH_EXIT_AS_SLASH_COMMAND_NAME,
} from '@neko/shared';

function normalizeNpcSlashCommandName(command: string): string {
  return command.trim().replace(/^\/+/, '').toLowerCase();
}

function getSlashCommandLogger() {
  return getLogger('SlashCommandHandler');
}

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
  characterDialogue?: CharacterDialogueController;
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
    const startTime = Date.now();
    const logger = getSlashCommandLogger();
    logger.debug('neko.agent.command.slash.request', {
      command,
      conversationId,
      hasArgs: args !== undefined && args.length > 0,
      argChars: args?.length ?? 0,
    });
    logger.debug('neko.agent.command.slash.request.raw', {
      command,
      conversationId,
      args,
    });

    try {
      const normalizedCommand = normalizeNpcSlashCommandName(command);
      if (normalizedCommand === NPC_TEST_BENCH_AS_SLASH_COMMAND_NAME) {
        await this.deps.characterDialogue?.launchFromSlash({ args, conversationId });
        logger.debug('neko.agent.command.slash.result', {
          command,
          conversationId,
          durationMs: Date.now() - startTime,
          handled: Boolean(this.deps.characterDialogue),
          source: 'character-dialogue',
        });
        return;
      }

      if (normalizedCommand === NPC_TEST_BENCH_EXIT_AS_SLASH_COMMAND_NAME) {
        await this.deps.characterDialogue?.exitActive(conversationId);
        logger.debug('neko.agent.command.slash.result', {
          command,
          conversationId,
          durationMs: Date.now() - startTime,
          handled: Boolean(this.deps.characterDialogue),
          source: 'character-dialogue',
        });
        return;
      }

      const result = await runExtensionSlashCommandRuntime(
        { command, conversationId, ...(args !== undefined ? { args } : {}) },
        this._createRuntimeDeps(webview),
        this._createRuntimeEffects(webview),
      );
      logger.debug('neko.agent.command.slash.result', {
        command: result.command,
        conversationId,
        durationMs: Date.now() - startTime,
        handled: result.handled,
        source: result.source,
      });
    } catch (error) {
      logger.warn('neko.agent.command.slash.failed', {
        command,
        conversationId,
        durationMs: Date.now() - startTime,
        error: summarizeSlashCommandError(error),
      });
      throw error;
    }
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
    const logger = getSlashCommandLogger();
    logger.debug('neko.agent.command.skillPrompt.dispatch', {
      conversationId: dispatch.conversationId,
      messageChars: dispatch.messageText.length,
      sessionMode: dispatch.sessionMode,
      hasExecutionOverrides: dispatch.executionOverrides !== undefined,
    });
    logger.debug('neko.agent.command.skillPrompt.dispatch.raw', dispatch);
    return this.deps.messages?.handleUserMessage(webview, dispatch);
  }
}

function summarizeSlashCommandError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}
