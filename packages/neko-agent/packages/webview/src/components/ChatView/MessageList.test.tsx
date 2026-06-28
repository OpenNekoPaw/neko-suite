import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { MessageList } from './MessageList';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import { I18nProvider } from '@/i18n/I18nContext';
import { chat as enChat } from '@/i18n/locales/en/chat';
import { chat as zhCnChat } from '@/i18n/locales/zh-cn/chat';
import { I18nService } from '@neko/shared';

const scrollToMock = vi.fn();
const requestAnimationFrameMock = vi.fn<(callback: FrameRequestCallback) => number>();
const cancelAnimationFrameMock = vi.fn<(handle: number) => void>();
let virtualItems: Array<{ index: number; key: string; start: number }> = [];

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => virtualItems,
    getTotalSize: () => 120,
    getOffsetForIndex: () => [120, 'end'] as const,
    measureElement: vi.fn(),
  }),
}));

describe('MessageList auto-scroll lifecycle', () => {
  beforeEach(() => {
    scrollToMock.mockClear();
    requestAnimationFrameMock.mockClear();
    cancelAnimationFrameMock.mockClear();
    virtualItems = [];

    requestAnimationFrameMock.mockReturnValue(1);
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: requestAnimationFrameMock,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: cancelAnimationFrameMock,
    });
    Object.defineProperty(HTMLDivElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancels pending auto-scroll frames when the list unmounts', () => {
    const { unmount } = render(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it('renders repeated tool blocks as a collapsed group in the virtualized list', () => {
    virtualItems = [{ index: 0, key: 'tool-group', start: 0 }];

    render(
      <MessageActionsProvider>
        <MessageList
          messages={[createToolMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByRole('button', { name: /ReadDocument x3/ })).toBeTruthy();
    expect(screen.getByText('/books/a.epub')).toBeTruthy();
  });

  it('passes plugin availability into composite block projections for Canvas transfer actions', () => {
    virtualItems = [{ index: 0, key: 'storyboard', start: 0 }];
    registerDefaultRenderers();

    renderWithI18n(
      <MessageActionsProvider pluginsAvailable={{ canvas: true, cut: false, sketch: false }}>
        <MessageList
          messages={[createCompositeStoryboardMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByRole('button', { name: /Canvas/ })).toBeTruthy();
  });

  it('renders collapsed process records before final content when they happened first', () => {
    virtualItems = [
      { index: 0, key: 'process-records', start: 0 },
      { index: 1, key: 'final-content', start: 80 },
    ];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessageWithFinalContentAndProcessRecords()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    const processRecordsButton = screen.getByRole('button', { name: /Process records/ });
    const finalContent = screen.getByText('Final storyboard summary.');
    expect(processRecordsButton.compareDocumentPosition(finalContent)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByText('Analyze source pages.')).toBeNull();
    expect(screen.queryByText('ReadDocument')).toBeNull();

    fireEvent.click(processRecordsButton);

    expect(screen.getByText(/Analyze source pages/)).toBeTruthy();
    expect(screen.getByText('ReadDocument')).toBeTruthy();
  });

  it('renders the active skill notice inside the virtualized conversation list', () => {
    const onClearActiveSkill = vi.fn();
    virtualItems = [{ index: 0, key: 'skill-notice', start: 0 }];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          activeSkillNotice={{
            skillName: 'comic-to-storyboard',
            allowedTools: ['ReadDocument'],
          }}
          onClearActiveSkill={onClearActiveSkill}
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByText('Active Skill records')).toBeTruthy();
    expect(screen.getByText('comic-to-storyboard')).toBeTruthy();
    expect(screen.getByText('Tool limit: 1')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear record: comic-to-storyboard (domainSkill)' }),
    );
    expect(onClearActiveSkill).toHaveBeenCalledOnce();
  });
});

function renderWithI18n(node: React.ReactElement) {
  const service = new I18nService('en');
  service.registerBundle('chat', 'en', enChat);
  service.registerBundle('chat', 'zh-cn', zhCnChat);
  return render(<I18nProvider service={service}>{node}</I18nProvider>);
}

function createMessage(id: string): Message {
  return {
    id,
    role: 'assistant',
    content: 'Hello',
    timestamp: 1_717_200_000_000,
  };
}

function createToolMessage(): Message {
  return {
    id: 'message-tools',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    contentBlocks: [
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      toolBlock('tool-2', 'ReadDocument', '/books/a.epub', 14),
      toolBlock('tool-3', 'ReadDocument', '/books/a.epub', 18),
    ],
  };
}

function createCompositeStoryboardMessage(): Message {
  return {
    id: 'message-storyboard',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    contentBlocks: [
      {
        id: 'block-composite',
        type: 'composite',
        timestamp: 1_717_200_000_000,
        composite: {
          template: 'storyboard-table',
          title: 'Storyboard',
          storyboardTable: {
            schemaVersion: 1,
            kind: 'storyboard-table',
            title: 'Storyboard',
            scenes: [
              {
                sceneId: 'scene-1',
                sceneTitle: 'Scene 1',
                shots: [
                  {
                    shotNumber: 1,
                    duration: 2,
                    visualDescription: 'Title page.',
                    characterAction: 'Static title card.',
                    imageStrategy: 'generate-new',
                  },
                ],
              },
            ],
          },
          sections: [
            {
              heading: 'Scene 1 / Shot 1',
              content: 'Title page.',
            },
          ],
        },
      },
    ],
  };
}

function createMessageWithFinalContentAndProcessRecords(): Message {
  return {
    id: 'message-with-process',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
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
