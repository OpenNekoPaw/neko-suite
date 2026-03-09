/**
 * TodoList Component
 *
 * Renders a real-time task list with status icons.
 * Aligned with opencode TUI and CLI theme icon conventions.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { TodoItem } from '../../types/state';
import { tokens, TODO_ICONS } from '../../theme/tokens';
import { Spinner } from '../shared/Spinner';

interface TodoListProps {
  readonly todos: TodoItem[];
}

export function TodoList({ todos }: TodoListProps): React.JSX.Element {
  if (todos.length === 0) return <Text />;

  return (
    <Box flexDirection="column" marginBottom={0}>
      {todos.map((todo, idx) => (
        <TodoItemView key={idx} todo={todo} />
      ))}
    </Box>
  );
}

function TodoItemView({ todo }: { readonly todo: TodoItem }): React.JSX.Element {
  const colorKey = `todo${capitalize(normalizeStatus(todo.status))}` as keyof typeof tokens;
  const color = (tokens[colorKey] as string | undefined) ?? tokens.muted;
  const icon = TODO_ICONS[todo.status] ?? TODO_ICONS.pending;

  return (
    <Box>
      {todo.status === 'in_progress' ? (
        <>
          <Spinner />
          <Text color={color}> {todo.content}</Text>
        </>
      ) : (
        <Text color={color}>
          {icon} {todo.content}
        </Text>
      )}
    </Box>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Normalize status for theme lookup (in_progress → InProgress) */
function normalizeStatus(status: TodoItem['status']): string {
  switch (status) {
    case 'in_progress':
      return 'InProgress';
    case 'pending':
      return 'Pending';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
  }
}
