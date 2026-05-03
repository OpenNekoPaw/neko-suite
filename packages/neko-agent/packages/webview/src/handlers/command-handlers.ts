/**
 * Command Message Handlers
 *
 * Handles: slashCommandResult
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration, MessageHandlerContext } from './types';
import type { PromptModeChangedMessage, SlashCommandResultMessage } from './messages';
import type { SlashCommandResultEffect } from '@neko-agent/types';
import {
  projectCloseCurrentConversationTab,
  projectSlashCommandResultMessage,
} from '../presenters/command-result-presenter';

/**
 * Handle 'slashCommandResult' message - Result from slash command execution
 */
const handleSlashCommandResult: MessageHandler<'slashCommandResult'> = (
  message: SlashCommandResultMessage,
  context,
) => {
  const projection = projectSlashCommandResultMessage(message);
  for (const effect of projection.effects) {
    applySlashCommandEffect(effect, context);
  }
};

const handlePromptModeChanged: MessageHandler<'promptModeChanged'> = (
  message: PromptModeChangedMessage,
  context,
) => {
  context.setPromptModeForConversation(message.conversationId, message.mode);
};

function applySlashCommandEffect(
  effect: SlashCommandResultEffect,
  context: MessageHandlerContext,
): void {
  switch (effect.type) {
    case 'appendAssistantMessage':
      context.setMessages((prev) => [...prev, effect.message]);
      break;
    case 'closeCurrentTab': {
      const projection = projectCloseCurrentConversationTab({
        openTabs: context.openTabs,
        activeConversationId: context.activeConversationId,
      });
      if (!projection.updated) return;
      context.setOpenTabs(projection.openTabs);
      context.setActiveTabId(projection.activeTabId);
      context.setActiveConversationId(projection.activeConversationId);
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
];
