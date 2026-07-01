/**
 * Command Message Handlers
 *
 * Handles: slashCommandResult
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration, MessageHandlerContext } from './types';
import type {
  AgentCapabilityLifecycleResultMessage,
  PromptModeChangedMessage,
  SlashCommandResultMessage,
} from './messages';
import type { SlashCommandResultEffect } from '@neko-agent/types';
import type { ContentBlock } from '@neko-agent/types';
import {
  projectCloseCurrentConversationTab,
  projectSlashCommandResultMessage,
} from '../presenters/command-result-presenter';
import { updateConversation } from './message-updater';

/**
 * Handle 'slashCommandResult' message - Result from slash command execution
 */
const handleSlashCommandResult: MessageHandler<'slashCommandResult'> = (
  message: SlashCommandResultMessage,
  context,
) => {
  const projection = projectSlashCommandResultMessage(message);
  for (const effect of projection.effects) {
    applySlashCommandEffect(effect, context, message.conversationId);
  }
};

const handlePromptModeChanged: MessageHandler<'promptModeChanged'> = (
  message: PromptModeChangedMessage,
  context,
) => {
  context.setPromptModeForConversation(message.conversationId, message.mode);
};

const handleAgentCapabilityLifecycleResult: MessageHandler<'agentCapabilityLifecycleResult'> = (
  message: AgentCapabilityLifecycleResultMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (messages, streamingMessageId) => ({
    messages: [
      ...messages,
      {
        id: `canvas-markdown-capability-${message.requestId}`,
        role: 'assistant',
        content: projectCanvasMarkdownCapabilityResultContent(message),
        ...(message.lifecycleResult
          ? {
              contentBlocks: [projectCanvasMarkdownLifecycleContentBlock(message)],
            }
          : {}),
        timestamp: Date.now(),
      },
    ],
    streamingMessageId,
  }));
};

function applySlashCommandEffect(
  effect: SlashCommandResultEffect,
  context: MessageHandlerContext,
  conversationId: string | undefined,
): void {
  switch (effect.type) {
    case 'appendAssistantMessage':
      updateConversation(context, conversationId, (messages, streamingMessageId) => ({
        messages: [...messages, effect.message],
        streamingMessageId,
      }));
      break;
    case 'closeCurrentTab': {
      if (!conversationId || !context.isCurrentConversation(conversationId)) return;
      const projection = projectCloseCurrentConversationTab({
        openTabs: context.openTabs,
        activeConversationId: context.activeConversationId,
      });
      if (!projection.updated) return;
      context.setOpenTabs(projection.openTabs);
      context.setActiveTabId(projection.activeTabId);
      context.setActiveConversationId(projection.activeConversationId);
      context.activeConversationIdRef.current = projection.activeConversationId;
      break;
    }
    case 'setPromptMode':
      context.setPromptModeForConversation(effect.conversationId, effect.promptMode);
      break;
    case 'setActiveTab':
      context.setActiveTab(effect.activeTab);
      break;
  }
}

/**
 * All command handler registrations
 */
export const commandHandlers: HandlerRegistration[] = [
  defineHandler('slashCommandResult', handleSlashCommandResult),
  defineHandler('promptModeChanged', handlePromptModeChanged),
  defineHandler('agentCapabilityLifecycleResult', handleAgentCapabilityLifecycleResult),
];

function projectCanvasMarkdownLifecycleContentBlock(
  message: AgentCapabilityLifecycleResultMessage,
): ContentBlock {
  if (!message.lifecycleResult) {
    throw new Error('Canvas Markdown lifecycle content block requires a lifecycle result.');
  }
  return {
    id: `canvas-lifecycle-${message.requestId}`,
    type: 'canvas_lifecycle',
    timestamp: Date.now(),
    canvasLifecycle: {
      requestId: message.requestId,
      success: message.success,
      result: message.lifecycleResult,
      ...(message.error ? { error: message.error } : {}),
    },
  };
}

function projectCanvasMarkdownCapabilityResultContent(
  message: AgentCapabilityLifecycleResultMessage,
): string {
  const lifecycle = message.lifecycleResult;
  if (lifecycle) {
    const diagnostics = lifecycle.diagnostics
      .map((diagnostic) => `- ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`)
      .join('\n');
    const changed = lifecycle.changedRefs?.length
      ? `\nChanged refs: ${lifecycle.changedRefs
          .map((ref) => [ref.packageId, ref.kind, ref.id].filter(Boolean).join(':'))
          .join(', ')}`
      : lifecycle.reviewArtifact
        ? `\nReview artifact: ${[
            lifecycle.reviewArtifact.packageId,
            lifecycle.reviewArtifact.kind,
            lifecycle.reviewArtifact.id,
          ]
            .filter(Boolean)
            .join(':')}`
        : '';
    const actions = projectLifecycleActions(lifecycle.actions);
    return [
      `Canvas lifecycle action ${lifecycle.status}: ${lifecycle.capabilityId}`,
      diagnostics ? `Diagnostics:\n${diagnostics}` : '',
      changed.trim(),
      actions.trim(),
      message.error ? `Error: ${message.error}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  const result = message.result;
  if (!result) {
    return `Canvas Markdown action failed: ${message.error ?? 'Unknown error.'}`;
  }

  const diagnostics = result.diagnostics
    .map((diagnostic) => `- ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`)
    .join('\n');
  const created = result.nodeIds?.length
    ? `\nCreated nodes: ${result.nodeIds.join(', ')}`
    : result.draftNodeId
      ? `\nCreated draft: ${result.draftNodeId}`
      : result.tableNodeId
        ? `\nCreated table: ${result.tableNodeId}`
        : '';
  const actions = result.actions?.length
    ? [
        'Available Canvas actions:',
        ...result.actions.map(
          (action) =>
            `- ${action.label ?? action.actionId} (${action.capabilityId ?? result.capabilityId})`,
        ),
      ].join('\n')
    : '';
  const status = message.success ? result.status : 'blocked';
  return [
    `Canvas Markdown action ${status}: ${result.capabilityId}`,
    diagnostics ? `Diagnostics:\n${diagnostics}` : '',
    created.trim(),
    actions.trim(),
    message.error ? `Error: ${message.error}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function projectLifecycleActions(
  actions:
    | NonNullable<NonNullable<AgentCapabilityLifecycleResultMessage['lifecycleResult']>['actions']>
    | undefined,
): string {
  if (!actions?.length) return '';
  return [
    'Available Canvas lifecycle actions:',
    ...actions.map((action) => {
      const detail = [
        action.capabilityId,
        action.phase,
        action.requiresApproval ? 'approval required' : 'no approval required',
        action.sourceRef
          ? `source ${[action.sourceRef.packageId, action.sourceRef.kind, action.sourceRef.id]
              .filter(Boolean)
              .join(':')}`
          : undefined,
      ]
        .filter(Boolean)
        .join(', ');
      return `- ${action.label ?? action.actionId}${detail ? ` (${detail})` : ''}`;
    }),
  ].join('\n');
}
