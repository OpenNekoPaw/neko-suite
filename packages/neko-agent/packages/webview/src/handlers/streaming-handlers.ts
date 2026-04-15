/**
 * Streaming Message Handlers
 *
 * Handles: thinking, response, streamText, streamComplete, streamThinking,
 *          thinkingComplete, messageCancelled, messageQueued, agentPhase, agentStateSnapshot
 *
 * Uses updateConversation for unified current/non-current routing.
 */

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
import type { ContentBlock, AgentPhase, AgentState } from '@/components/types';
import { updateConversation } from './message-updater';

/**
 * Helper: Find or create a content block of the given type in the current streaming message
 */
function findOrCreateContentBlock(
  contentBlocks: ContentBlock[],
  type: ContentBlock['type'],
  createNew: boolean = false,
): { blocks: ContentBlock[]; blockId: string } {
  const lastBlockOfType = [...contentBlocks].reverse().find((b) => {
    if (b.type !== type) return false;
    if (type === 'thinking') return !b.isThinkingComplete;
    if (type === 'text') return b.isStreaming;
    return false;
  });

  if (lastBlockOfType && !createNew) {
    return { blocks: contentBlocks, blockId: lastBlockOfType.id };
  }

  const newBlock: ContentBlock = {
    id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: Date.now(),
    ...(type === 'thinking' ? { thinking: '', isThinkingComplete: false } : {}),
    ...(type === 'text' ? { content: '', isStreaming: true } : {}),
  };

  return {
    blocks: [...contentBlocks, newBlock],
    blockId: newBlock.id,
  };
}

/**
 * Handle 'thinking' message - AI is processing (indicator only, no content)
 */
const handleThinking: MessageHandler = (message: ThinkingMessage, context) => {
  updateConversation(context, message.conversationId, (msgs) => ({
    messages: msgs,
    isThinking: true,
  }));
};

/**
 * Handle 'streamText' message - Streaming text chunk
 */
const handleStreamText: MessageHandler = (message: StreamTextMessage, context) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const targetMessageId = message.messageId || streamingId;
    const hasExistingMessage = targetMessageId && streamingId === targetMessageId;

    if (!hasExistingMessage) {
      // Create new message with text content block
      const newId = message.messageId || Date.now().toString();
      const blockId = `block-${newId}`;
      return {
        messages: [
          ...msgs,
          {
            id: newId,
            role: 'assistant' as const,
            content: message.content || '',
            timestamp: Date.now(),
            isStreaming: true,
            contentBlocks: [
              {
                id: blockId,
                type: 'text' as const,
                timestamp: Date.now(),
                content: message.content || '',
                isStreaming: true,
              },
            ],
          },
        ],
        streamingMessageId: newId,
        isThinking: false,
      };
    }

    // Update existing message - append to last text block or create new one
    return {
      messages: msgs.map((msg) => {
        if (msg.id !== targetMessageId) return msg;

        const blocks = msg.contentBlocks || [];
        const { blocks: updatedBlocks, blockId } = findOrCreateContentBlock(blocks, 'text');

        return {
          ...msg,
          content: msg.content + (message.content || ''),
          contentBlocks: updatedBlocks.map((b) =>
            b.id === blockId ? { ...b, content: (b.content || '') + (message.content || '') } : b,
          ),
        };
      }),
      isThinking: false,
    };
  });
};

/**
 * Handle 'streamComplete' message - Streaming finished
 */
const handleStreamComplete: MessageHandler = (message: StreamCompleteMessage, context) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const targetMessageId = message.messageId || streamingId;

    if (!targetMessageId) {
      return { messages: msgs, isThinking: false };
    }

    return {
      messages: msgs.map((msg) => {
        if (msg.id !== targetMessageId) return msg;

        const updatedBlocks = (msg.contentBlocks || []).map((b) => ({
          ...b,
          isStreaming: false,
          isThinkingComplete: b.type === 'thinking' ? true : b.isThinkingComplete,
        }));

        return {
          ...msg,
          isStreaming: false,
          contentBlocks: updatedBlocks,
        };
      }),
      // Only clear streamingMessageId if it matches
      streamingMessageId: streamingId === targetMessageId ? null : undefined,
      isThinking: false,
    };
  });
};

/**
 * Handle 'streamThinking' message - Stream AI thinking content
 */
const handleStreamThinking: MessageHandler = (message: StreamThinkingMessage, context) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const targetMessageId = message.messageId || streamingId;
    const hasExistingMessage = targetMessageId && streamingId === targetMessageId;

    if (!hasExistingMessage) {
      // Create new message with thinking content block
      const newId = message.messageId || Date.now().toString();
      const blockId = `block-thinking-${newId}`;
      return {
        messages: [
          ...msgs,
          {
            id: newId,
            role: 'assistant' as const,
            content: '',
            thinking: message.content || '',
            isThinkingComplete: false,
            timestamp: Date.now(),
            isStreaming: true,
            contentBlocks: [
              {
                id: blockId,
                type: 'thinking' as const,
                timestamp: Date.now(),
                thinking: message.content || '',
                isThinkingComplete: false,
              },
            ],
          },
        ],
        streamingMessageId: newId,
        isThinking: true,
      };
    }

    // Update existing message - append to thinking block or create one
    return {
      messages: msgs.map((msg) => {
        if (msg.id !== targetMessageId) return msg;

        const blocks = msg.contentBlocks || [];
        const { blocks: updatedBlocks, blockId } = findOrCreateContentBlock(blocks, 'thinking');

        return {
          ...msg,
          thinking: (msg.thinking || '') + (message.content || ''),
          isThinkingComplete: false,
          contentBlocks: updatedBlocks.map((b) =>
            b.id === blockId ? { ...b, thinking: (b.thinking || '') + (message.content || '') } : b,
          ),
        };
      }),
      isThinking: true,
    };
  });
};

/**
 * Handle 'messageQueued' message - Message was queued while agent is running
 */
const handleMessageQueued: MessageHandler = (message: MessageQueuedMessage, context) => {
  if (context.isCurrentConversation(message.conversationId)) {
    const newId = `queued-${Date.now()}`;
    context.setMessages((prev) => [
      ...prev,
      {
        id: newId,
        role: 'system',
        content: message.content || 'Message queued - will be processed after current response',
        timestamp: Date.now(),
        isQueued: true,
      },
    ]);
  }
};

/**
 * Handle 'messageCancelled' message - User cancelled message generation
 */
const handleMessageCancelled: MessageHandler = (message: MessageCancelledMessage, context) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    if (!streamingId) {
      return { messages: msgs, isThinking: false };
    }

    return {
      messages: msgs.map((msg) => {
        if (msg.id !== streamingId) return msg;

        const updatedBlocks = (msg.contentBlocks || []).map((b) => ({
          ...b,
          isStreaming: false,
          isThinkingComplete: b.type === 'thinking' ? true : b.isThinkingComplete,
        }));

        const cancelledNote = msg.content ? '\n\n*(Cancelled)*' : '*(Cancelled)*';

        return {
          ...msg,
          content: msg.content + cancelledNote,
          isStreaming: false,
          isCancelled: true,
          contentBlocks: updatedBlocks,
        };
      }),
      streamingMessageId: null,
      isThinking: false,
    };
  });
};

/**
 * Handle 'agentPhase' message - Agent execution phase change
 */
const handleAgentPhase: MessageHandler = (message: AgentPhaseMessage, context) => {
  const phase = message.phase as AgentPhase;
  const toolName = message.toolName as string | undefined;
  const timestamp = (message.timestamp as number) || Date.now();

  if (context.isCurrentConversation(message.conversationId)) {
    if (phase === 'idle') {
      context.setAgentState(null);
    } else {
      context.setAgentState({ phase, toolName, startedAt: timestamp });
    }
    if (message.conversationId) {
      if (phase === 'idle') {
        context.conversationAgentStateRef.current.delete(message.conversationId);
      } else {
        context.conversationAgentStateRef.current.set(message.conversationId, {
          phase,
          toolName,
          startedAt: timestamp,
        });
      }
    }
  } else if (message.conversationId) {
    if (phase === 'idle') {
      context.conversationAgentStateRef.current.delete(message.conversationId);
    } else {
      context.conversationAgentStateRef.current.set(message.conversationId, {
        phase,
        toolName,
        startedAt: timestamp,
      });
    }
  }

  context.forceAgentStateUpdate();
};

/**
 * Handle 'agentStateSnapshot' message - restore agent states after webview reload
 */
const handleAgentStateSnapshot: MessageHandler = (message: AgentStateSnapshotMessage, context) => {
  const agentStates = Array.isArray(message.agentStates) ? message.agentStates : [];
  const nextMap = new Map<string, AgentState>();

  for (const entry of agentStates) {
    if (!entry || typeof entry.conversationId !== 'string') continue;
    const phase = entry.phase as AgentPhase | undefined;
    if (!phase || phase === 'idle') continue;

    nextMap.set(entry.conversationId, {
      phase,
      toolName: typeof entry.toolName === 'string' ? entry.toolName : undefined,
      startedAt: typeof entry.startedAt === 'number' ? entry.startedAt : Date.now(),
    });
  }

  context.conversationAgentStateRef.current = nextMap;

  const activeConversationId = context.activeConversationIdRef.current;
  if (activeConversationId) {
    context.setAgentState(nextMap.get(activeConversationId) ?? null);
  } else {
    context.setAgentState(null);
  }

  context.forceAgentStateUpdate();
};

/**
 * All streaming handler registrations
 */
export const streamingHandlers: HandlerRegistration[] = [
  { type: 'thinking', handler: handleThinking },
  { type: 'streamText', handler: handleStreamText },
  { type: 'streamComplete', handler: handleStreamComplete },
  { type: 'streamThinking', handler: handleStreamThinking },
  { type: 'messageCancelled', handler: handleMessageCancelled },
  { type: 'messageQueued', handler: handleMessageQueued },
  { type: 'agentPhase', handler: handleAgentPhase },
  { type: 'agentStateSnapshot', handler: handleAgentStateSnapshot },
];
