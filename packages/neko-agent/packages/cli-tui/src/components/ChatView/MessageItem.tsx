/**
 * MessageItem Component
 *
 * Renders a single message in the conversation.
 * - User messages: > prefix with input text
 * - Assistant messages: thinking + tool calls + markdown content + todos
 * - System messages: error display
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/state';
import { INK_TOOL_ICONS, tokens } from '../../theme/tokens';
import { StreamingText } from './StreamingText';
import { ThinkingBlock } from './ThinkingBlock';
import { TodoList } from './TodoList';
import { MarkdownRenderer } from '../Markdown/MarkdownRenderer';

interface MessageItemProps {
  readonly message: Message;
  /** If this is the last assistant message, show streaming state */
  readonly isStreaming?: boolean;
  readonly currentDelta?: string;
  readonly currentThinking?: string;
}

export function MessageItem({
  message,
  isStreaming = false,
  currentDelta = '',
  currentThinking = '',
}: MessageItemProps): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>
          {'❯ '}
          {message.content}
        </Text>
      </Box>
    );
  }

  if (message.role === 'system') {
    return (
      <Box
        flexDirection="column"
        marginBottom={1}
        borderStyle="round"
        borderColor={message.isError ? tokens.error : tokens.muted}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text color={message.isError ? tokens.error : undefined}>{message.content}</Text>
      </Box>
    );
  }

  // Assistant message — full rendering pipeline
  const hasThinking = currentThinking || message.thinking;
  const thinkingContent = currentThinking || message.thinking || '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 1. Thinking block */}
      {hasThinking ? (
        <ThinkingBlock
          content={thinkingContent}
          isThinking={isStreaming && !!currentThinking && !currentDelta}
        />
      ) : null}

      {/* 2. Tool calls */}
      {message.toolCalls.map((tc) => (
        <ToolCallLine key={tc.id} name={tc.name} args={tc.arguments} status={tc.status} />
      ))}

      {/* 3. Streaming text or final markdown */}
      {isStreaming ? (
        <StreamingText content={currentDelta} isStreaming={true} />
      ) : message.content ? (
        <MarkdownRenderer content={message.content} />
      ) : null}

      {/* 4. Todo list */}
      {message.todos.length > 0 ? <TodoList todos={message.todos} /> : null}
    </Box>
  );
}

/** Compact tool call display line */
function ToolCallLine({
  name,
  args,
  status,
}: {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly status: string;
}): React.JSX.Element {
  const icon = INK_TOOL_ICONS[status as keyof typeof INK_TOOL_ICONS] ?? INK_TOOL_ICONS.pending;
  const statusColor =
    status === 'success'
      ? tokens.toolSuccess
      : status === 'error'
        ? tokens.toolError
        : tokens.toolPending;

  return (
    <Box>
      <Text>
        <Text color={statusColor}>{icon}</Text> <Text bold>{name}</Text>{' '}
        <Text dimColor>{summarizeArgs(args)}</Text>
      </Text>
    </Box>
  );
}

/** Create a short summary of tool arguments (max 60 chars) */
function summarizeArgs(args: Record<string, unknown>): string {
  const path = args['path'] ?? args['file_path'] ?? args['filePath'];
  if (typeof path === 'string') return truncate(path, 60);

  const command = args['command'] ?? args['cmd'];
  if (typeof command === 'string') return truncate(command, 60);

  const query = args['query'] ?? args['pattern'];
  if (typeof query === 'string') return truncate(query, 60);

  for (const value of Object.values(args)) {
    if (typeof value === 'string') return truncate(value, 60);
  }

  return '';
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
