/**
 * Streaming Message Handlers
 *
 * Handles: thinking, response, streamText, streamComplete, streamThinking, thinkingComplete
 *
 * Uses ContentBlock pattern for sequential rendering:
 * - Each thinking/text segment is a separate content block
 * - Content blocks are rendered in chronological order
 */

import type { MessageHandler, HandlerRegistration } from './types';
import type { ContentBlock, AgentPhase, AgentState } from '@/components/types';

/**
 * Helper: Find or create a content block of the given type in the current streaming message
 * Returns the block ID for updates
 */
function findOrCreateContentBlock(
  contentBlocks: ContentBlock[],
  type: ContentBlock['type'],
  createNew: boolean = false
): { blocks: ContentBlock[]; blockId: string } {
  // Find the last block of this type that is still streaming/incomplete
  const lastBlockOfType = [...contentBlocks].reverse().find(b => {
    if (b.type !== type) return false;
    if (type === 'thinking') return !b.isThinkingComplete;
    if (type === 'text') return b.isStreaming;
    return false;
  });

  if (lastBlockOfType && !createNew) {
    return { blocks: contentBlocks, blockId: lastBlockOfType.id };
  }

  // Create new block
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
const handleThinking: MessageHandler = (message, context) => {
  if (context.isCurrentConversation(message.conversationId)) {
    context.setIsThinking(true);
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => ({
      messages: msgs,
      streaming: { ...streaming, isThinking: true },
    }));
  }
};

/**
 * Handle 'response' message - Complete response received (non-streaming)
 */
const handleResponse: MessageHandler = (message, context) => {
  if (context.isCurrentConversation(message.conversationId)) {
    context.setIsThinking(false);
    const newId = Date.now().toString();
    context.setMessages(prev => [
      ...prev,
      {
        id: newId,
        role: 'assistant',
        content: message.message,
        timestamp: Date.now(),
        contentBlocks: [{
          id: `block-${newId}`,
          type: 'text',
          timestamp: Date.now(),
          content: message.message,
          isStreaming: false,
        }],
      },
    ]);
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => {
      const newId = Date.now().toString();
      return {
        messages: [
          ...msgs,
          {
            id: newId,
            role: 'assistant' as const,
            content: message.message,
            timestamp: Date.now(),
            contentBlocks: [{
              id: `block-${newId}`,
              type: 'text' as const,
              timestamp: Date.now(),
              content: message.message,
              isStreaming: false,
            }],
          },
        ],
        streaming: { ...streaming, isThinking: false },
      };
    });
  }
};

/**
 * Handle 'streamText' message - Streaming text chunk
 */
const handleStreamText: MessageHandler = (message, context) => {
  // Use messageId from extension if provided, otherwise fall back to ref
  const targetMessageId = message.messageId || context.streamingMessageIdRef.current;

  if (context.isCurrentConversation(message.conversationId)) {
    context.setIsThinking(false);

    // Check if we have an existing message with this ID
    const hasExistingMessage = targetMessageId && context.streamingMessageIdRef.current === targetMessageId;

    if (!hasExistingMessage) {
      // Create new message with text content block
      // Use messageId from extension if provided
      const newId = message.messageId || Date.now().toString();
      const blockId = `block-${newId}`;
      context.streamingMessageIdRef.current = newId;
      context.setStreamingMessageId(newId);
      context.setMessages(prev => [
        ...prev,
        {
          id: newId,
          role: 'assistant',
          content: message.content || '',
          timestamp: Date.now(),
          isStreaming: true,
          contentBlocks: [{
            id: blockId,
            type: 'text',
            timestamp: Date.now(),
            content: message.content || '',
            isStreaming: true,
          }],
        },
      ]);
    } else {
      // Update existing message - append to last text block or create new one
      context.setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== targetMessageId) return msg;

          const blocks = msg.contentBlocks || [];
          const { blocks: updatedBlocks, blockId } = findOrCreateContentBlock(blocks, 'text');

          return {
            ...msg,
            content: msg.content + (message.content || ''),
            contentBlocks: updatedBlocks.map(b =>
              b.id === blockId
                ? { ...b, content: (b.content || '') + (message.content || '') }
                : b
            ),
          };
        })
      );
    }
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => {
      const targetId = message.messageId || streaming.streamingMessageId;
      const hasExisting = targetId && streaming.streamingMessageId === targetId;

      if (!hasExisting) {
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
              contentBlocks: [{
                id: blockId,
                type: 'text' as const,
                timestamp: Date.now(),
                content: message.content || '',
                isStreaming: true,
              }],
            },
          ],
          streaming: { streamingMessageId: newId, isThinking: false },
        };
      } else {
        return {
          messages: msgs.map(msg => {
            if (msg.id !== targetId) return msg;

            const blocks = msg.contentBlocks || [];
            const { blocks: updatedBlocks, blockId } = findOrCreateContentBlock(blocks, 'text');

            return {
              ...msg,
              content: msg.content + (message.content || ''),
              contentBlocks: updatedBlocks.map(b =>
                b.id === blockId
                  ? { ...b, content: (b.content || '') + (message.content || '') }
                  : b
              ),
            };
          }),
          streaming: { ...streaming, isThinking: false },
        };
      }
    });
  }
};

/**
 * Handle 'streamComplete' message - Streaming finished
 */
const handleStreamComplete: MessageHandler = (message, context) => {
  // Use messageId from extension if provided
  const targetMessageId = message.messageId || context.streamingMessageIdRef.current;

  if (context.isCurrentConversation(message.conversationId)) {
    if (targetMessageId) {
      context.setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== targetMessageId) return msg;

          // Mark all content blocks as complete
          const updatedBlocks = (msg.contentBlocks || []).map(b => ({
            ...b,
            isStreaming: false,
            isThinkingComplete: b.type === 'thinking' ? true : b.isThinkingComplete,
          }));

          return {
            ...msg,
            isStreaming: false,
            contentBlocks: updatedBlocks,
          };
        })
      );
      // Only clear ref if it matches the completed message
      if (context.streamingMessageIdRef.current === targetMessageId) {
        context.streamingMessageIdRef.current = null;
        context.setStreamingMessageId(null);
      }
    }
    context.setIsThinking(false);
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => {
      const targetId = message.messageId || streaming.streamingMessageId;
      return {
        messages: targetId
          ? msgs.map(msg => {
              if (msg.id !== targetId) return msg;

              const updatedBlocks = (msg.contentBlocks || []).map(b => ({
                ...b,
                isStreaming: false,
                isThinkingComplete: b.type === 'thinking' ? true : b.isThinkingComplete,
              }));

              return {
                ...msg,
                isStreaming: false,
                contentBlocks: updatedBlocks,
              };
            })
          : msgs,
        streaming: { streamingMessageId: null, isThinking: false },
      };
    });
  }
};

/**
 * Handle 'streamThinking' message - Stream AI thinking content
 * Creates a thinking content block that appears BEFORE text content
 */
const handleStreamThinking: MessageHandler = (message, context) => {
  // Use messageId from extension if provided, otherwise fall back to ref
  const targetMessageId = message.messageId || context.streamingMessageIdRef.current;

  if (context.isCurrentConversation(message.conversationId)) {
    context.setIsThinking(true);

    // Check if we have an existing message with this ID
    const hasExistingMessage = targetMessageId && context.streamingMessageIdRef.current === targetMessageId;

    if (!hasExistingMessage) {
      // Create new message with thinking content block
      // Use messageId from extension if provided
      const newId = message.messageId || Date.now().toString();
      const blockId = `block-thinking-${newId}`;
      context.streamingMessageIdRef.current = newId;
      context.setStreamingMessageId(newId);
      context.setMessages(prev => [
        ...prev,
        {
          id: newId,
          role: 'assistant',
          content: '',
          thinking: message.content || '',
          isThinkingComplete: false,
          timestamp: Date.now(),
          isStreaming: true,
          contentBlocks: [{
            id: blockId,
            type: 'thinking',
            timestamp: Date.now(),
            thinking: message.content || '',
            isThinkingComplete: false,
          }],
        },
      ]);
    } else {
      // Update existing message - append to thinking block or create one
      context.setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== targetMessageId) return msg;

          const blocks = msg.contentBlocks || [];
          const { blocks: updatedBlocks, blockId } = findOrCreateContentBlock(blocks, 'thinking');

          return {
            ...msg,
            thinking: (msg.thinking || '') + (message.content || ''),
            isThinkingComplete: false,
            contentBlocks: updatedBlocks.map(b =>
              b.id === blockId
                ? { ...b, thinking: (b.thinking || '') + (message.content || '') }
                : b
            ),
          };
        })
      );
    }
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => {
      const targetId = message.messageId || streaming.streamingMessageId;
      const hasExisting = targetId && streaming.streamingMessageId === targetId;

      if (!hasExisting) {
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
              contentBlocks: [{
                id: blockId,
                type: 'thinking' as const,
                timestamp: Date.now(),
                thinking: message.content || '',
                isThinkingComplete: false,
              }],
            },
          ],
          streaming: { streamingMessageId: newId, isThinking: true },
        };
      } else {
        return {
          messages: msgs.map(msg => {
            if (msg.id !== targetId) return msg;

            const blocks = msg.contentBlocks || [];
            const { blocks: updatedBlocks, blockId } = findOrCreateContentBlock(blocks, 'thinking');

            return {
              ...msg,
              thinking: (msg.thinking || '') + (message.content || ''),
              isThinkingComplete: false,
              contentBlocks: updatedBlocks.map(b =>
                b.id === blockId
                  ? { ...b, thinking: (b.thinking || '') + (message.content || '') }
                  : b
              ),
            };
          }),
          streaming: { ...streaming, isThinking: true },
        };
      }
    });
  }
};

/**
 * Handle 'thinkingComplete' message - AI finished thinking
 */
const handleThinkingComplete: MessageHandler = (message, context) => {
  if (context.isCurrentConversation(message.conversationId)) {
    if (context.streamingMessageIdRef.current) {
      context.setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== context.streamingMessageIdRef.current) return msg;

          // Mark all thinking blocks as complete
          const updatedBlocks = (msg.contentBlocks || []).map(b =>
            b.type === 'thinking' ? { ...b, isThinkingComplete: true } : b
          );

          return {
            ...msg,
            isThinkingComplete: true,
            contentBlocks: updatedBlocks,
          };
        })
      );
    }
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => ({
      messages: streaming.streamingMessageId
        ? msgs.map(msg => {
            if (msg.id !== streaming.streamingMessageId) return msg;

            const updatedBlocks = (msg.contentBlocks || []).map(b =>
              b.type === 'thinking' ? { ...b, isThinkingComplete: true } : b
            );

            return {
              ...msg,
              isThinkingComplete: true,
              contentBlocks: updatedBlocks,
            };
          })
        : msgs,
      streaming,
    }));
  }
};

/**
 * Handle 'messageQueued' message - Message was queued while agent is running
 */
const handleMessageQueued: MessageHandler = (message, context) => {
  // Add a system notification to show the message was queued
  if (context.isCurrentConversation(message.conversationId)) {
    const newId = `queued-${Date.now()}`;
    context.setMessages(prev => [
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
const handleMessageCancelled: MessageHandler = (message, context) => {
  if (context.isCurrentConversation(message.conversationId)) {
    // Mark current streaming message as cancelled and complete
    if (context.streamingMessageIdRef.current) {
      context.setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== context.streamingMessageIdRef.current) return msg;

          // Mark all content blocks as complete
          const updatedBlocks = (msg.contentBlocks || []).map(b => ({
            ...b,
            isStreaming: false,
            isThinkingComplete: b.type === 'thinking' ? true : b.isThinkingComplete,
          }));

          // Add cancelled indicator to content if it exists
          const cancelledNote = msg.content ? '\n\n*(Cancelled)*' : '*(Cancelled)*';

          return {
            ...msg,
            content: msg.content + cancelledNote,
            isStreaming: false,
            isCancelled: true,
            contentBlocks: updatedBlocks,
          };
        })
      );
      context.streamingMessageIdRef.current = null;
      context.setStreamingMessageId(null);
    }
    context.setIsThinking(false);
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => ({
      messages: streaming.streamingMessageId
        ? msgs.map(msg => {
            if (msg.id !== streaming.streamingMessageId) return msg;

            const updatedBlocks = (msg.contentBlocks || []).map(b => ({
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
          })
        : msgs,
      streaming: { streamingMessageId: null, isThinking: false },
    }));
  }
};

/**
 * Handle 'agentPhase' message - Agent execution phase change
 * Updates the agent state indicator (idle/thinking/acting/streaming)
 */
const handleAgentPhase: MessageHandler = (message, context) => {
  const phase = message.phase as AgentPhase;
  const toolName = message.toolName as string | undefined;
  const timestamp = (message.timestamp as number) || Date.now();

  if (context.isCurrentConversation(message.conversationId)) {
    // Update current conversation's agent state
    if (phase === 'idle') {
      context.setAgentState(null);
    } else {
      context.setAgentState({
        phase,
        toolName,
        startedAt: timestamp,
      });
    }
    // Also store in ref for conversation switching
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
    // Store in ref for non-current conversation
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

  // Trigger re-render to update AgentControlCenter
  context.forceAgentStateUpdate();
};

/**
 * Handle 'agentStateSnapshot' message - restore agent states after webview reload/visibility change
 */
const handleAgentStateSnapshot: MessageHandler = (message, context) => {
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
  { type: 'response', handler: handleResponse },
  { type: 'streamText', handler: handleStreamText },
  { type: 'streamComplete', handler: handleStreamComplete },
  { type: 'streamThinking', handler: handleStreamThinking },
  { type: 'thinkingComplete', handler: handleThinkingComplete },
  { type: 'messageCancelled', handler: handleMessageCancelled },
  { type: 'messageQueued', handler: handleMessageQueued },
  { type: 'agentPhase', handler: handleAgentPhase },
  { type: 'agentStateSnapshot', handler: handleAgentStateSnapshot },
];
