/**
 * Streaming Message Handlers
 *
 * Handles: thinking, response, streamText, streamComplete, streamThinking,
 *          thinkingComplete, messageCancelled, messageQueued, agentPhase, agentStateSnapshot
 *
 * Uses updateConversation for unified current/non-current routing.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  ThinkingMessage,
  StreamTextMessage,
  StreamCompleteMessage,
  StreamThinkingMessage,
  MessageCancelledMessage,
  MessageQueuedMessage,
  AgentPhaseMessage,
  AgentStateSnapshotMessage,
} from './messages';
import type { AgentStateStoreProjection } from '@neko-agent/types';
import { updateConversation } from './message-updater';
import type { MessageHandlerContext } from './types';
import {
  projectMessageCancelledIntoMessages,
  projectQueuedMessageIntoMessages,
  projectStreamingCompleteIntoMessages,
  projectStreamingTextIntoMessages,
  projectStreamingThinkingIntoMessages,
} from '../presenters/message-presenter';
import {
  projectAgentPhaseToStateStore,
  projectAgentStateSnapshot,
} from '../presenters/agent-state-presenter';

/**
 * Handle 'thinking' message - AI is processing (indicator only, no content)
 */
const handleThinking: MessageHandler<'thinking'> = (message: ThinkingMessage, context) => {
  updateConversation(context, message.conversationId, (msgs) => ({
    messages: msgs,
    isThinking: true,
  }));
};

/**
 * Handle 'streamText' message - Streaming text chunk
 */
const handleStreamText: MessageHandler<'streamText'> = (message: StreamTextMessage, context) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectStreamingTextIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
      content: message.content,
    });

    return {
      messages: projection.messages,
      streamingMessageId: projection.streamingMessageId,
      isThinking: projection.isThinking,
    };
  });
};

/**
 * Handle 'streamComplete' message - Streaming finished
 */
const handleStreamComplete: MessageHandler<'streamComplete'> = (
  message: StreamCompleteMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectStreamingCompleteIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
      contentBlocks: message.contentBlocks,
    });

    return {
      messages: projection.messages,
      streamingMessageId: projection.streamingMessageId,
      isThinking: projection.isThinking,
    };
  });
};

/**
 * Handle 'streamThinking' message - Stream AI thinking content
 */
const handleStreamThinking: MessageHandler<'streamThinking'> = (
  message: StreamThinkingMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectStreamingThinkingIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
      content: message.content,
    });

    return {
      messages: projection.messages,
      streamingMessageId: projection.streamingMessageId,
      isThinking: projection.isThinking,
    };
  });
};

/**
 * Handle 'messageQueued' message - Message was queued while agent is running
 */
const handleMessageQueued: MessageHandler<'messageQueued'> = (
  message: MessageQueuedMessage,
  context,
) => {
  if (context.isCurrentConversation(message.conversationId)) {
    context.setMessages(
      (prev) =>
        projectQueuedMessageIntoMessages({
          messages: prev,
          content: message.content,
        }).messages,
    );
  }
};

/**
 * Handle 'messageCancelled' message - User cancelled message generation
 */
const handleMessageCancelled: MessageHandler<'messageCancelled'> = (
  message: MessageCancelledMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectMessageCancelledIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
    });

    return {
      messages: projection.messages,
      streamingMessageId: projection.streamingMessageId,
      isThinking: projection.isThinking,
    };
  });
};

/**
 * Handle 'agentPhase' message - Agent execution phase change
 */
const handleAgentPhase: MessageHandler<'agentPhase'> = (message: AgentPhaseMessage, context) => {
  applyAgentStateProjection(
    context,
    projectAgentPhaseToStateStore({
      states: context.conversationAgentStateRef.current,
      activeConversationId: context.activeConversationIdRef.current,
      conversationId: message.conversationId,
      phase: message.phase,
      toolName: message.toolName,
      timestamp: message.timestamp,
    }),
  );
};

/**
 * Handle 'agentStateSnapshot' message - restore agent states after webview reload
 */
const handleAgentStateSnapshot: MessageHandler<'agentStateSnapshot'> = (
  message: AgentStateSnapshotMessage,
  context,
) => {
  const agentStates = Array.isArray(message.agentStates) ? message.agentStates : [];
  applyAgentStateProjection(
    context,
    projectAgentStateSnapshot({
      agentStates,
      activeConversationId: context.activeConversationIdRef.current,
    }),
  );
};

function applyAgentStateProjection(
  context: MessageHandlerContext,
  projection: AgentStateStoreProjection,
): void {
  context.conversationAgentStateRef.current = projection.states;
  context.setAgentState(projection.activeAgentState);
  context.forceAgentStateUpdate();
}

/**
 * All streaming handler registrations
 */
export const streamingHandlers: HandlerRegistration[] = [
  defineHandler('thinking', handleThinking),
  defineHandler('streamText', handleStreamText),
  defineHandler('streamComplete', handleStreamComplete),
  defineHandler('streamThinking', handleStreamThinking),
  defineHandler('messageCancelled', handleMessageCancelled),
  defineHandler('messageQueued', handleMessageQueued),
  defineHandler('agentPhase', handleAgentPhase),
  defineHandler('agentStateSnapshot', handleAgentStateSnapshot),
];
