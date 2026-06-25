import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/types';
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

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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

describe('MessageItem tool aggregation', () => {
  it('renders consecutive repeated tool calls as a collapsed group', () => {
    renderMessageItem({
      message: createMessage({
        role: 'assistant',
        content: '',
        contentBlocks: [
          toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
          toolBlock('tool-2', 'ReadDocument', '/books/a.epub', 14),
          toolBlock('tool-3', 'ReadDocument', '/books/a.epub', 18),
        ],
      }),
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    expect(screen.getByRole('button', { name: /ReadDocument x3/ })).toBeTruthy();
    expect(screen.getByText('/books/a.epub')).toBeTruthy();
    expect(screen.getByText('3 succeeded')).toBeTruthy();
    expect(screen.queryAllByText('ReadDocument')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /ReadDocument x3/ }));

    expect(screen.getAllByText('ReadDocument')).toHaveLength(3);
  });

  it('collapses process records before final assistant content when they happened first', () => {
    renderMessageItem({
      message: createMessage({
        role: 'assistant',
        content: '',
        contentBlocks: [
          {
            id: 'thinking-1',
            type: 'thinking',
            timestamp: 1,
            thinking: 'Analyze source pages.',
            isThinkingComplete: true,
          },
          toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
          {
            id: 'text-1',
            type: 'text',
            timestamp: 20,
            content: 'Final storyboard summary.',
          },
        ],
      }),
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const processRecordsButton = screen.getByRole('button', { name: /chat.processRecords.title/ });
    const finalContent = screen.getByText('Final storyboard summary.');
    expect(processRecordsButton.compareDocumentPosition(finalContent)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByText('ReadDocument')).toBeNull();

    fireEvent.click(processRecordsButton);

    expect(screen.getByText(/Analyze source pages/)).toBeTruthy();
    expect(screen.getByText('ReadDocument')).toBeTruthy();
  });
});

describe('MessageItem reference rendering', () => {
  it('renders non-preview user attachments with the shared reference token', () => {
    renderMessageItem({
      message: {
        ...createMessage({ role: 'user', content: 'Please inspect this.' }),
        attachments: [
          {
            id: 'attachment-1',
            name: 'brief.md',
            type: 'file',
            size: 1024,
          },
        ],
      },
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.className).toContain('agent-reference-token');
    expect(token?.getAttribute('data-reference-variant')).toBe('inline');
    expect(token?.getAttribute('data-reference-kind')).toBe('file');
    expect(screen.getByText('brief.md')).toBeTruthy();
    expect(screen.getByText('1.0 KB')).toBeTruthy();
  });

  it('keeps workspace attachment parent paths visible in user messages', () => {
    renderMessageItem({
      message: {
        ...createMessage({ role: 'user', content: 'Please inspect this.' }),
        attachments: [
          {
            id: 'attachment-video',
            name: '1080P.mp4',
            type: 'video',
            path: 'cases/1080P.mp4',
          },
        ],
      },
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.getAttribute('data-reference-kind')).toBe('video');
    expect(screen.getByText('1080P.mp4')).toBeTruthy();
    expect(screen.getByText('cases')).toBeTruthy();
  });

  it('renders stored context references with the shared reference token', () => {
    renderMessageItem({
      message: {
        ...createMessage({ role: 'user', content: 'Please inspect this node.' }),
        contextReferences: [
          {
            id: 'node-1',
            type: 'canvas-node',
            label: '#1 wide shot',
            navigationData: { nodeId: 'node-1' },
          },
        ],
      },
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.getAttribute('data-reference-kind')).toBe('canvas');
    expect(token?.getAttribute('data-reference-variant')).toBe('attached');
    expect(screen.getByText('#1 wide shot')).toBeTruthy();
  });

  it('renders selected file reference context with parent path metadata', () => {
    renderMessageItem({
      message: {
        ...createMessage({ role: 'user', content: '分析' }),
        contextReferences: [
          {
            id: 'file-ref:${A}/books/story.epub',
            type: 'file',
            label: 'story.epub',
            summary: '${A}/books/story.epub',
            mediaType: 'document',
            navigationData: {
              path: '${A}/books/story.epub',
              filePath: '${A}/books/story.epub',
            },
          },
        ],
      },
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.getAttribute('data-reference-kind')).toBe('file');
    expect(screen.getByText('story.epub')).toBeTruthy();
    expect(screen.getByText('${A}/books')).toBeTruthy();
  });
});

function renderMessageItem(input: { message: Message; identities: MessageIdentityMap }) {
  render(
    <MessageActionsProvider>
      <MessageItem message={input.message} conversationId="conv-1" identities={input.identities} />
    </MessageActionsProvider>,
  );
}

function createMessage(
  overrides: Pick<Message, 'role' | 'content'> & Partial<Pick<Message, 'contentBlocks'>>,
): Message {
  return {
    id: `${overrides.role}-message-1`,
    role: overrides.role,
    content: overrides.content,
    timestamp: 1_717_200_000_000,
    ...(overrides.contentBlocks ? { contentBlocks: overrides.contentBlocks } : {}),
  };
}

function toolBlock(id: string, name: string, filePath: string, duration: number) {
  return {
    id: `block-${id}`,
    type: 'tool_call' as const,
    timestamp: duration,
    toolCall: {
      id,
      name,
      arguments: { file_path: filePath },
      result: {
        success: true,
        data: { file_path: filePath },
        duration,
      },
    },
  };
}
