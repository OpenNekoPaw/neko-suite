/**
 * Slash Command Handler - Handles slash command invocation from webview
 *
 * Responsible for:
 * - Dispatching builtin commands (/clear, /help, /new, /status, etc.)
 * - Delegating skill-based commands to SkillHandler
 * - Sending status information
 */

import * as vscode from 'vscode';
import type { Skill } from '@neko/shared';
import {
  createSkillExecutionIdcMetadata,
  getCommandHandler,
  resolveSlashCommandCatalogEntry,
  type CommandContext,
  type CommandResult,
} from '@neko/agent';
import type { IAgentManager } from '../../ai/agentManager';
import type { ConversationHandler } from '../conversationHandler';
import type { SettingsManager } from '../settingsManager';
import type { SystemPromptManager } from '../systemPromptManager';
import type { SkillHandler } from './skillHandler';
import type { TaskHandler } from './taskHandler';
import type { ContextHandler } from './contextHandler';
import type { PlanModeHandler } from './planModeHandler';
import type { MessageHandler } from '../messageHandler';

/**
 * Dependencies for SlashCommandHandler
 */
export interface SlashCommandHandlerDeps {
  conversations: ConversationHandler;
  agentManager?: IAgentManager;
  settings: SettingsManager;
  systemPrompt: SystemPromptManager;
  messages?: MessageHandler;
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
  async handleCommand(webview: vscode.Webview, command: string, args?: string): Promise<void> {
    // Remove leading / if present
    const cmdName = command.startsWith('/') ? command.slice(1) : command;

    const builtinHandled = this._handleBuiltinCommand(webview, cmdName, args);
    if (typeof builtinHandled === 'boolean') {
      if (builtinHandled) {
        return;
      }
    } else if (await builtinHandled) {
      return;
    }

    // If not a builtin command, try skill-based slash command
    const result = await this.deps.skillHandler.handleSlashCommand(webview, cmdName, args);

    if (result) {
      if (result.applied) {
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: `Command /${cmdName} activated`,
          injection: result.injection,
        });

        // Apply injection to AgentSession so the system prompt and allowed tools take effect
        if (result.injection) {
          const conversationId = this.deps.conversations.getActiveId();
          if (conversationId) {
            this.deps.agentManager?.applySkillInjection(
              conversationId,
              result.injection,
              result.skill,
            );

            const nextPrompt = args?.trim();
            if (nextPrompt && this.deps.messages) {
              const executionOverrides = _createSlashExecutionOverrides(result.skill);
              await this.deps.messages.handleUserMessage(
                webview,
                nextPrompt,
                undefined,
                undefined,
                undefined,
                undefined,
                conversationId,
                undefined,
                undefined,
                undefined,
                undefined,
                executionOverrides,
              );
            }
          }
        }
      } else {
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: false,
          error: result.error || `Failed to execute command: /${cmdName}`,
        });
      }
    } else {
      // Command not found
      webview.postMessage({
        type: 'slashCommandResult',
        command: cmdName,
        success: false,
        error: `Unknown command: /${cmdName}. Type /help for available commands.`,
      });
    }
  }

  /**
   * Send status information to webview
   */
  sendStatusInfo(webview: vscode.Webview): void {
    const activeConversationId = this.deps.conversations.getActiveId();
    const conversations = this.deps.conversations.list();
    const activeConversation = activeConversationId
      ? this.deps.conversations.manager.get(activeConversationId)
      : null;

    // Get provider and model info
    const providerId = this.deps.settings.selectedProviderId;
    const modelId = this.deps.settings.selectedModelId;

    // Get skill info
    const activeSkill = this.deps.skillHandler.getActiveSkill();

    // Get context token count
    const tokenCount = activeConversationId
      ? (this.deps.agentManager?.getContextTokenCount(activeConversationId) ?? 0)
      : 0;

    webview.postMessage({
      type: 'slashCommandResult',
      command: 'status',
      success: true,
      action: 'showStatus',
      data: {
        provider: providerId,
        model: modelId,
        conversationCount: conversations.length,
        activeConversationId,
        messageCount: activeConversation?.messages.length ?? 0,
        tokenCount,
        activeSkill: activeSkill?.skill.name,
        planMode: this.deps.systemPrompt.isPlanMode(),
        executionMode: this.deps.settings.executionMode,
      },
    });
  }

  /**
   * Handle builtin commands
   * @returns true if the command was handled, false otherwise
   */
  private _handleBuiltinCommand(
    webview: vscode.Webview,
    cmdName: string,
    rawArgs?: string,
  ): boolean | Promise<boolean> {
    const skillService = this.deps.skillHandler.getSkillService();
    const commandEntry = resolveSlashCommandCatalogEntry(cmdName, {
      surface: 'extension',
      skills: skillService?.registry.listAllSkills(),
    });
    if (!commandEntry || commandEntry.source !== 'builtin') {
      return false;
    }

    const handler = getCommandHandler(cmdName);
    if (!handler) {
      return false;
    }

    const activeConversationId = this.deps.conversations.getActiveId() ?? undefined;
    const result = handler(_parseBuiltinArgs(rawArgs), this._createCommandContext(webview));
    if (_isPromiseLike(result)) {
      return result.then(async (resolved) => {
        await this._dispatchBuiltinCommandResult(
          webview,
          cmdName,
          rawArgs,
          activeConversationId,
          resolved,
        );
        return true;
      });
    }

    const dispatched = this._dispatchBuiltinCommandResult(
      webview,
      cmdName,
      rawArgs,
      activeConversationId,
      result,
    );
    if (_isPromiseLike(dispatched)) {
      return dispatched.then(() => true);
    }

    return true;
  }

  private _createCommandContext(webview: vscode.Webview): CommandContext {
    const skillService = this.deps.skillHandler.getSkillService();

    return {
      ...(skillService
        ? {
            skillService: {
              registry: {
                skillCount: skillService.registry.skillCount,
                listSkills: () => skillService.registry.listSkills(),
                listAllSkills: () => skillService.registry.listAllSkills(),
                getSkill: (name: string) => skillService.registry.getSkill(name),
                getSkillByCommand: (name: string) => skillService.registry.getSkillByCommand(name),
                searchSkills: (keyword: string) => skillService.registry.searchSkills(keyword),
              },
              skillCount: skillService.registry.skillCount,
              getActiveSkill: () => this.deps.skillHandler.getActiveSkill()?.skill ?? null,
              clearActiveSkill: () => this.deps.skillHandler.clearActiveSkill(),
            },
          }
        : {}),
      config: {
        provider: this.deps.settings.selectedProviderId,
        model: this.deps.settings.selectedModelId,
      },
      conversations: {
        list: () => this.deps.conversations.list(),
        getActiveId: () => this.deps.conversations.getActiveId(),
        create: () => this.deps.conversations.create(),
        clearCurrent: () => this.deps.conversations.clearCurrent(),
      },
      planMode: {
        isEnabled: () => this.deps.systemPrompt.isPlanMode(),
        toggle: () => {
          this.deps.planModeHandler.handleTogglePlanMode(webview);
          return this.deps.systemPrompt.isPlanMode();
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

  private _dispatchBuiltinCommandResult(
    webview: vscode.Webview,
    cmdName: string,
    rawArgs: string | undefined,
    activeConversationId: string | undefined,
    result: CommandResult,
  ): void | Promise<void> {
    if (result.action === 'showStatus') {
      this.sendStatusInfo(webview);
      return;
    }

    if (result.action === 'clearHistory') {
      if (activeConversationId) {
        this.deps.agentManager?.clearHistory(activeConversationId);
      }
      webview.postMessage({ type: 'historyCleared' });
    }

    if (result.action === 'newConversation') {
      this.deps.sendConversationList();
      this.deps.sendActiveConversation();
    }

    if (result.action === 'showTasks') {
      this.deps.taskHandler.sendTasks(webview);
    }

    const data = _extensionCommandData(result, this.deps.conversations);
    const message = _extensionCommandMessage(result);
    const payload = {
      type: 'slashCommandResult' as const,
      command: cmdName,
      success: !result.error,
      ...(result.action ? { action: result.action } : {}),
      ...(data ? { data } : {}),
      ...(message ? { message } : {}),
      ...(result.error ? { error: result.error } : {}),
    };
    webview.postMessage(payload);

    if (
      result.action === 'togglePlanMode' &&
      this.deps.systemPrompt.isPlanMode() &&
      rawArgs?.trim() &&
      this.deps.messages
    ) {
      return this.deps.messages.handleUserMessage(
        webview,
        rawArgs.trim(),
        undefined,
        undefined,
        undefined,
        undefined,
        this.deps.conversations.getActiveId(),
      );
    }
  }
}

function _createSlashExecutionOverrides(
  skill: Skill | undefined,
): { metadata?: Record<string, unknown> } | undefined {
  if (!skill) {
    return undefined;
  }

  const legacyPipelines = Reflect.get(skill as object, 'pipelines');
  const hasWorkflowTemplate =
    (skill.phases?.length ?? 0) > 0 ||
    (typeof legacyPipelines === 'object' && legacyPipelines !== null);

  if (!hasWorkflowTemplate) {
    return undefined;
  }

  return {
    metadata: createSkillExecutionIdcMetadata(skill),
  };
}

function _parseBuiltinArgs(rawArgs?: string): string[] {
  if (!rawArgs) {
    return [];
  }

  return rawArgs
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

function _isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function _extensionCommandData(
  result: CommandResult,
  conversations: ConversationHandler,
): Record<string, unknown> | undefined {
  if (result.action === 'resumeConversation') {
    return {
      conversations: conversations.list().map((conversation) => {
        const loaded = conversations.manager.get(conversation.id);
        return {
          id: conversation.id,
          title: conversation.title,
          messageCount: loaded?.messages.length ?? 0,
        };
      }),
    };
  }

  return result.data;
}

function _extensionCommandMessage(result: CommandResult): string | undefined {
  if (result.action === 'clearHistory') {
    return 'Conversation cleared';
  }

  switch (result.action) {
    case 'showHelp':
    case 'showStatus':
    case 'showModelSelector':
    case 'showSettings':
    case 'showPermissions':
    case 'showTasks':
    case 'showMCPServers':
    case 'resumeConversation':
    case 'initProject':
      return undefined;
    default:
      return result.output;
  }
}
