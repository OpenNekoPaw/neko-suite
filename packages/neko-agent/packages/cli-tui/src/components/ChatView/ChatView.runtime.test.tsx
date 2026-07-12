import React from 'react';
import { Box } from 'ink';
import { cleanup } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderWithPresentation } from '../../__tests__/render-with-presentation';
import { useAgentStore } from '../../stores/agent-store';
import { useConversationStore } from '../../stores/conversation-store';
import { useUIStore } from '../../stores/ui-store';
import type { Message } from '../../types/state';
import { ChatView } from './ChatView';

beforeEach(() => {
  useAgentStore.getState().reset();
  useConversationStore.getState().clearMessages();
  useUIStore.setState({ scrollOffset: 0, scrollLimit: 0 });
});

afterEach(() => cleanup());

describe('ChatView runtime viewport', () => {
  it('shows the live bottom by default and can scroll to older rows', async () => {
    useConversationStore.getState().replaceMessages(
      Array.from({ length: 5 }, (_, index): Message => ({
        id: `message-${index + 1}`,
        role: 'user',
        content: `message-${index + 1}`,
        toolCalls: [],
        todos: [],
        timestamp: index,
      })),
    );

    const view = renderWithPresentation(
      <Box height={4} flexDirection="column">
        <ChatView />
      </Box>,
    );
    await waitForInkUpdate();

    expect(view.lastFrame()).toContain('message-5');
    expect(view.lastFrame()).not.toContain('message-1');

    useUIStore.getState().scrollUp(4);
    await waitForInkUpdate();

    expect(view.lastFrame()).toContain('message-3');
    expect(view.lastFrame()).not.toContain('message-5');

    useUIStore.getState().scrollToBottom();
    await waitForInkUpdate();
    expect(view.lastFrame()).toContain('message-5');
  });
});

async function waitForInkUpdate(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
