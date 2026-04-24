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
import { createSkillWorkflowId } from '@neko/agent';
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

    // Handle builtin commands first
    if (this._handleBuiltinCommand(webview, cmdName, args)) {
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
  private _handleBuiltinCommand(webview: vscode.Webview, cmdName: string, args?: string): boolean {
    switch (cmdName) {
      case 'clear':
      case 'cls': {
        const currentConversationId = this.deps.conversations.getActiveId();
        if (currentConversationId) {
          this.deps.agentManager?.clearHistory(currentConversationId);
        }
        this.deps.conversations.clearCurrent();
        webview.postMessage({ type: 'historyCleared' });
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: 'Conversation cleared',
        });
        return true;
      }

      case 'exit':
      case 'quit':
      case 'q':
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: 'Goodbye!',
          action: 'exit',
        });
        return true;

      case 'help':
      case 'h':
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showHelp',
        });
        return true;

      case 'new':
        this.deps.conversations.create();
        this.deps.sendConversationList();
        this.deps.sendActiveConversation();
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: 'New conversation created',
        });
        return true;

      case 'status':
      case 's':
        this.sendStatusInfo(webview);
        return true;

      case 'compact':
        this.deps.contextHandler.compressContext(
          webview,
          this.deps.conversations.getActiveId() ?? undefined,
        );
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: 'Context compression initiated',
        });
        return true;

      case 'model':
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showModelSelector',
        });
        return true;

      case 'settings':
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showSettings',
        });
        return true;

      case 'plan': {
        this.deps.planModeHandler.handleTogglePlanMode(webview);
        const newPlanMode = this.deps.systemPrompt.isPlanMode();
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'togglePlanMode',
          data: { planMode: newPlanMode },
          message: `Plan mode ${newPlanMode ? 'enabled' : 'disabled'}`,
        });
        const nextPrompt = args?.trim();
        if (newPlanMode && nextPrompt && this.deps.messages) {
          void this.deps.messages.handleUserMessage(
            webview,
            nextPrompt,
            undefined,
            undefined,
            undefined,
            undefined,
            this.deps.conversations.getActiveId(),
          );
        }
        return true;
      }

      case 'tasks':
      case 'todos':
        this.deps.taskHandler.sendTasks(webview);
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showTasks',
        });
        return true;

      case 'mcp':
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showMCPServers',
        });
        return true;

      case 'permissions':
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showPermissions',
        });
        return true;

      case 'init':
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'initProject',
        });
        return true;

      case 'resume': {
        const conversations = this.deps.conversations.list();
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'resumeConversation',
          data: {
            conversations: conversations.map((c) => {
              const conv = this.deps.conversations.manager.get(c.id);
              return {
                id: c.id,
                title: c.title,
                messageCount: conv?.messages.length ?? 0,
              };
            }),
          },
        });
        return true;
      }

      default:
        return false;
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
    metadata: {
      idc: {
        entrySignal: 'workflow-template',
        taskShape: 'multi-step',
        workflowId: createSkillWorkflowId(skill.name),
      },
    },
  };
}
