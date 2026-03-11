/**
 * ChatView Component
 *
 * Scrollable message list container.
 * Renders all messages from the conversation store
 * with streaming state for the latest assistant message.
 * Includes inline activity indicator (Claude Code style).
 */

import React from 'react';
import { Box } from 'ink';
import { useConversationStore } from '../../stores/conversation-store';
import { MessageItem } from './MessageItem';
import { ActivityIndicator } from './ActivityIndicator';

export function ChatView(): React.JSX.Element {
  const messages = useConversationStore((s) => s.messages);
  const currentDelta = useConversationStore((s) => s.currentDelta);
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const currentThinking = useConversationStore((s) => s.currentThinking);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg, idx) => {
        const isLast = idx === messages.length - 1;
        const isLastAssistant = isLast && msg.role === 'assistant';

        return (
          <MessageItem
            key={msg.id}
            message={msg}
            isStreaming={isLastAssistant ? isStreaming : false}
            currentDelta={isLastAssistant ? currentDelta : ''}
            currentThinking={isLastAssistant ? currentThinking : ''}
          />
        );
      })}

      {/* Inline activity indicator — Claude Code style */}
      <ActivityIndicator />
    </Box>
  );
}
