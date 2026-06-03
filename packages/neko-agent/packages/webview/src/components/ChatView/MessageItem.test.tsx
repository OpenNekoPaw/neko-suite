import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@/components/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { MessageItem } from './MessageItem';
import type { MessageIdentityMap } from './message-identity';

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: vi.fn(),
}));

describe('MessageItem identity rendering', () => {
  it('renders the character name for character dialogue assistant messages', () => {
    renderMessageItem({
      message: createMessage({ role: 'assistant', content: '我会自己确认。' }),
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: {
          displayName: '小橘',
          avatarLabel: '小橘',
          title: '小橘 (Character Dialogue)',
        },
      },
    });

    expect(screen.getAllByText('小橘')).toHaveLength(2);
    expect(screen.getByLabelText('小橘 (Character Dialogue)')).toBeTruthy();
  });

  it('renders the embodied user name for embody character user messages', () => {
    renderMessageItem({
      message: createMessage({ role: 'user', content: '我记得这里发生过什么？' }),
      identities: {
        user: {
          displayName: 'You as 小橘',
          avatarLabel: '小橘',
          title: 'You as 小橘',
        },
        assistant: {
          displayName: 'Character feedback',
          avatarLabel: 'CF',
          title: 'Character feedback',
        },
      },
    });

    expect(screen.getByText('You as 小橘')).toBeTruthy();
    expect(screen.getByLabelText('You as 小橘')).toBeTruthy();
  });
});

function renderMessageItem(input: { message: Message; identities: MessageIdentityMap }) {
  render(
    <MessageActionsProvider>
      <MessageItem message={input.message} conversationId="conv-1" identities={input.identities} />
    </MessageActionsProvider>,
  );
}

function createMessage(overrides: Pick<Message, 'role' | 'content'>): Message {
  return {
    id: `${overrides.role}-message-1`,
    role: overrides.role,
    content: overrides.content,
    timestamp: 1_717_200_000_000,
  };
}
