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
import type { Platform } from '@neko/platform';
import { getLogger } from '../../base';
import type { SystemPromptManager } from '../systemPromptManager';
import type { ConversationHandler } from '../conversationHandler';
import type { SettingsManager } from '../settingsManager';
import type { IAgentManager } from '../../ai/agentManager';
import type { MessageHandler } from '../messageHandler';

const logger = getLogger('PlanModeHandler');

/**
 * Dependencies for PlanModeHandler
 */
export interface PlanModeHandlerDeps {
  systemPrompt: SystemPromptManager;
  conversations: ConversationHandler;
  agentManager?: IAgentManager;
  platform?: Platform;
  settings: SettingsManager;
  messages?: MessageHandler;
}

/**
 * Handler for plan mode webview messages
 */
export class PlanModeHandler {
  constructor(private deps: PlanModeHandlerDeps) {}

  updateDeps(partial: Partial<PlanModeHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  handleSetPromptMode(webview: vscode.Webview, mode: 'default' | 'plan'): void {
    this.deps.systemPrompt.setMode(mode);
    this.sendPromptMode(webview);
  }

  handleTogglePlanMode(webview: vscode.Webview): void {
    this.deps.systemPrompt.togglePlanMode();
    this.sendPromptMode(webview);
  }

  sendPromptMode(webview: vscode.Webview): void {
    webview.postMessage({
      type: 'promptModeChanged',
      mode: this.deps.systemPrompt.getMode(),
      isPlanMode: this.deps.systemPrompt.isPlanMode(),
    });
  }

  async handlePlanApprove(
    webview: vscode.Webview,
    planId: string,
    conversationId: string,
    filePath?: string,
  ): Promise<void> {
    logger.info('Plan approved:', { planId, conversationId, filePath });

    // Persist the plan status change
    this._updatePlanStatusInConversation(conversationId, planId, 'approved');

    // Update plan status in UI
    webview.postMessage({
      type: 'planStatusUpdate',
      planId,
      conversationId,
      status: 'approved',
    });

    // If we have a plan file, read it and execute with auto mode
    if (filePath) {
      try {
        const fs = await import('fs');
        const planContent = await fs.promises.readFile(filePath, 'utf-8');

        // Switch agent to auto mode and execute the plan
        const agentRunner = this.deps.agentManager?.get(conversationId);
        if (agentRunner && this.deps.platform) {
          // Temporarily switch to auto mode for plan execution
          await agentRunner.configure(this._buildAgentConfig());

          // Send message to execute the approved plan
          const executeMessage = `The plan has been approved. Please execute the following plan:\n\n${planContent}`;
          this.deps.messages?.handleUserMessage(webview, executeMessage);
        }
      } catch (error) {
        logger.error('Failed to read plan file:', error);
        webview.postMessage({
          type: 'error',
          message: `Failed to read plan file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    } else {
      // No file path - just notify the agent
      const agentRunner = this.deps.agentManager?.get(conversationId);
      if (agentRunner && this.deps.platform) {
        await agentRunner.configure(this._buildAgentConfig());

        this.deps.messages?.handleUserMessage(
          webview,
          'The plan has been approved. Please proceed with the implementation.',
        );
      }
    }
  }

  handlePlanReject(webview: vscode.Webview, planId: string, conversationId: string): void {
    logger.info('Plan rejected:', { planId, conversationId });

    // Persist the plan status change
    this._updatePlanStatusInConversation(conversationId, planId, 'rejected');

    // Update plan status in UI
    webview.postMessage({
      type: 'planStatusUpdate',
      planId,
      conversationId,
      status: 'rejected',
    });

    // Notify the user
    webview.postMessage({
      type: 'streamText',
      conversationId,
      content:
        '\n\n---\n**Plan rejected.** Please provide more details or a different approach if you would like me to create a new plan.',
    });
  }

  handlePlanStepAction(
    webview: vscode.Webview,
    planId: string,
    stepId: string,
    conversationId: string,
    action: 'approve' | 'reject',
  ): void {
    logger.info('Plan step action:', { planId, stepId, conversationId, action });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Persist the step status change
    this._updatePlanStepInConversation(conversationId, planId, stepId, { status: newStatus });

    // Update step status in UI
    webview.postMessage({
      type: 'planStepStatusUpdate',
      planId,
      stepId,
      conversationId,
      status: newStatus,
    });
  }

  handlePlanStepModify(
    webview: vscode.Webview,
    planId: string,
    stepId: string,
    newDescription: string,
    conversationId: string,
  ): void {
    logger.info('Plan step modified:', { planId, stepId, newDescription, conversationId });

    // Persist the step modification
    this._updatePlanStepInConversation(conversationId, planId, stepId, {
      status: 'modified',
      description: newDescription,
    });

    // Update step in UI
    webview.postMessage({
      type: 'planStepStatusUpdate',
      planId,
      stepId,
      conversationId,
      status: 'modified',
      newDescription,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Build the common agent config used for all plan execution branches. */
  private _buildAgentConfig() {
    return {
      platform: this.deps.platform!,
      systemPrompt: this.deps.settings.customSystemPrompt || this.deps.systemPrompt.getPrompt(),
      maxIterations: Infinity,
      autoExecuteTools: true,
      temperature: this.deps.settings.temperature,
      maxTokens: this.deps.settings.maxTokens,
      executionMode: 'auto' as const,
      thinkingBudget: this.deps.settings.thinkingBudget,
    };
  }

  private _updatePlanStepInConversation(
    conversationId: string,
    planId: string,
    stepId: string,
    update: { status?: string; description?: string },
  ): void {
    const conversation = this.deps.conversations.manager.get(conversationId);
    if (!conversation) {
      logger.warn('Conversation not found for plan step update:', conversationId);
      return;
    }

    let updated = false;
    const updatedMessages = conversation.messages.map((message) => {
      if (!message.contentBlocks) return message;

      const updatedBlocks = message.contentBlocks.map((block) => {
        if (block.type !== 'plan' || !block.plan) return block;

        // Type assertion for plan structure
        const plan = block.plan as {
          id: string;
          steps: Array<{ id: string; status: string; description: string }>;
        };

        if (plan.id !== planId) return block;

        // Update the step
        const updatedSteps = plan.steps.map((step) => {
          if (step.id !== stepId) return step;
          updated = true;
          return {
            ...step,
            ...(update.status && { status: update.status }),
            ...(update.description && { description: update.description }),
          };
        });

        return {
          ...block,
          plan: {
            ...plan,
            steps: updatedSteps,
          },
        };
      });

      return {
        ...message,
        contentBlocks: updatedBlocks,
      };
    });

    if (updated) {
      this.deps.conversations.manager.updateMessages(conversationId, updatedMessages);
      logger.info('Persisted plan step update:', { conversationId, planId, stepId, update });
    }
  }

  private _updatePlanStatusInConversation(
    conversationId: string,
    planId: string,
    status: 'approved' | 'rejected',
  ): void {
    const conversation = this.deps.conversations.manager.get(conversationId);
    if (!conversation) {
      logger.warn('Conversation not found for plan status update:', conversationId);
      return;
    }

    let updated = false;
    const updatedMessages = conversation.messages.map((message) => {
      if (!message.contentBlocks) return message;

      const updatedBlocks = message.contentBlocks.map((block) => {
        if (block.type !== 'plan' || !block.plan) return block;

        // Type assertion for plan structure
        const plan = block.plan as {
          id: string;
          status: string;
        };

        if (plan.id !== planId) return block;

        updated = true;
        return {
          ...block,
          plan: {
            ...plan,
            status,
          },
        };
      });

      return {
        ...message,
        contentBlocks: updatedBlocks,
      };
    });

    if (updated) {
      this.deps.conversations.manager.updateMessages(conversationId, updatedMessages);
      logger.info('Persisted plan status update:', { conversationId, planId, status });
    }
  }
}
