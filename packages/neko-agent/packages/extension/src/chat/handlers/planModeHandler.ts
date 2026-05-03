/**
 * Plan Mode Handler - Handles plan mode and plan approval/rejection messages
 *
 * Responsible for:
 * - Setting/toggling prompt mode (default/plan)
 * - Plan approval and execution
 * - Plan rejection
 * - Plan step actions (approve/reject/modify)
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import {
  runPlanApprovalRuntime,
  runPlanRejectionRuntime,
  runSendConversationPromptModeRuntime,
  runSetConversationPromptModeRuntime,
  runPlanStepActionRuntime,
  runPlanStepModificationRuntime,
  runToggleConversationPromptModeRuntime,
  type PlanApprovalExecutionDispatch,
  type PlanReviewConversationStore,
  type PlanReviewRuntimeEffects,
  type PlanReviewRuntimeMessage,
  type PlanStepReviewAction,
  type ConversationPromptModeRuntime,
} from '@neko/agent';
import { getLogger } from '../../base';
import type { SystemPromptManager } from '../systemPromptManager';
import type { ConversationBridge } from '../conversationBridge';
import type { AgentMessageTurnHandler } from '../agentMessageTurnHandler';

const logger = getLogger('PlanModeHandler');

/**
 * Dependencies for PlanModeHandler
 */
export interface PlanModeHandlerDeps {
  systemPrompt: SystemPromptManager | ConversationPromptModeRuntimeProvider;
  conversations: ConversationBridge;
  messages?: AgentMessageTurnHandler;
  readPlanFile?: (filePath: string) => Promise<string>;
}

export interface ConversationPromptModeRuntimeProvider {
  getPromptModeRuntime(): ConversationPromptModeRuntime;
}

/**
 * Handler for plan mode webview messages
 */
export class PlanModeHandler {
  constructor(private deps: PlanModeHandlerDeps) {}

  updateDeps(partial: Partial<PlanModeHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  handleSetPromptMode(
    webview: vscode.Webview,
    conversationId: string,
    mode: 'default' | 'plan',
  ): void {
    void this._runPromptModeRuntime(() =>
      runSetConversationPromptModeRuntime(
        { conversationId, mode },
        this.deps.systemPrompt.getPromptModeRuntime(),
        this._createPromptModeRuntimeEffects(webview),
      ),
    );
  }

  handleTogglePlanMode(webview: vscode.Webview, conversationId: string): void {
    void this._runPromptModeRuntime(() =>
      runToggleConversationPromptModeRuntime(
        { conversationId },
        this.deps.systemPrompt.getPromptModeRuntime(),
        this._createPromptModeRuntimeEffects(webview),
      ),
    );
  }

  sendPromptMode(webview: vscode.Webview, conversationId: string): void {
    void this._runPromptModeRuntime(() =>
      runSendConversationPromptModeRuntime(
        { conversationId },
        this.deps.systemPrompt.getPromptModeRuntime(),
        this._createPromptModeRuntimeEffects(webview),
      ),
    );
  }

  async handlePlanApprove(
    webview: vscode.Webview,
    planId: string,
    conversationId: string,
    filePath?: string,
  ): Promise<void> {
    logger.info('Plan approved:', { planId, conversationId, filePath });
    await this._runPlanReviewRuntime(() =>
      runPlanApprovalRuntime(
        { planId, conversationId, filePath },
        this._createPlanRuntimeStore(),
        this._createPlanRuntimeEffects(webview),
      ),
    );
  }

  async handlePlanReject(
    webview: vscode.Webview,
    planId: string,
    conversationId: string,
  ): Promise<void> {
    logger.info('Plan rejected:', { planId, conversationId });
    await this._runPlanReviewRuntime(() =>
      runPlanRejectionRuntime(
        { planId, conversationId },
        this._createPlanRuntimeStore(),
        this._createPlanRuntimeEffects(webview),
      ),
    );
  }

  async handlePlanStepAction(
    webview: vscode.Webview,
    planId: string,
    stepId: string,
    conversationId: string,
    action: PlanStepReviewAction,
  ): Promise<void> {
    logger.info('Plan step action:', { planId, stepId, conversationId, action });
    await this._runPlanReviewRuntime(() =>
      runPlanStepActionRuntime(
        { planId, stepId, conversationId, action },
        this._createPlanRuntimeStore(),
        this._createPlanRuntimeEffects(webview),
      ),
    );
  }

  async handlePlanStepModify(
    webview: vscode.Webview,
    planId: string,
    stepId: string,
    newDescription: string,
    conversationId: string,
  ): Promise<void> {
    logger.info('Plan step modified:', { planId, stepId, newDescription, conversationId });
    await this._runPlanReviewRuntime(() =>
      runPlanStepModificationRuntime(
        { planId, stepId, conversationId, newDescription },
        this._createPlanRuntimeStore(),
        this._createPlanRuntimeEffects(webview),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _runPlanReviewRuntime(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      logger.error('Plan review bridge failed:', error);
    }
  }

  private async _runPromptModeRuntime(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      logger.error('Prompt mode bridge failed:', error);
    }
  }

  private _createPromptModeRuntimeEffects(webview: vscode.Webview): {
    postMessage(message: Parameters<typeof webview.postMessage>[0]): Promise<void>;
  } {
    return {
      postMessage: async (message): Promise<void> => {
        await webview.postMessage(message);
      },
    };
  }

  private _createPlanRuntimeStore(): PlanReviewConversationStore {
    return {
      getMessages: (conversationId) => this.deps.conversations.get(conversationId)?.messages,
      updateMessages: (conversationId, messages) =>
        this.deps.conversations.updateMessagesForConversation(conversationId, messages),
    };
  }

  private _createPlanRuntimeEffects(webview: vscode.Webview): PlanReviewRuntimeEffects {
    return {
      postMessage: async (message: PlanReviewRuntimeMessage): Promise<void> => {
        await webview.postMessage(message);
      },
      readPlanFile: (filePath: string): Promise<string> =>
        this.deps.readPlanFile?.(filePath) ?? fs.readFile(filePath, 'utf-8'),
      executePlanApproval: async (dispatch: PlanApprovalExecutionDispatch): Promise<void> => {
        await this.deps.messages?.handleUserMessage(webview, dispatch);
      },
      onMissingConversation: (input: { conversationId: string; planId: string }): void => {
        logger.warn('Conversation not found for plan review update:', input);
      },
      onPlanMessageNotUpdated: (input: { conversationId: string; planId: string }): void => {
        logger.warn('Plan message not found for review update:', input);
      },
      onError: (error: unknown): void => {
        logger.error('Plan review runtime failed:', error);
      },
    };
  }
}
