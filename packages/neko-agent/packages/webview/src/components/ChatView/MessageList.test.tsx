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

  it('passes plugin availability into markdown storyboard Canvas transfer actions', () => {
    virtualItems = [{ index: 0, key: 'storyboard', start: 0 }];
    registerDefaultRenderers();

    renderWithI18n(
      <MessageActionsProvider pluginsAvailable={{ canvas: true, cut: false, sketch: false }}>
        <MessageList
          messages={[createStoryboardMarkdownMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByRole('button', { name: /Canvas/ })).toBeTruthy();
  });

  it('renders storyboard resources from prior assistant ReadImage context', () => {
    virtualItems = [
      { index: 0, key: 'read-image', start: 0 },
      { index: 1, key: 'storyboard', start: 80 },
    ];

    renderWithI18n(
      <MessageActionsProvider pluginsAvailable={{ canvas: true }}>
        <MessageList
          messages={[createReadImageContextMessage(), createStoryboardMarkdownMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByAltText('Page 1').getAttribute('src')).toBe('vscode-webview://page-1.jpg');
    expect(screen.queryByText(/no image resource context/)).toBeNull();
    expect(screen.queryByText('P1')).toBeNull();
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
      screen.getByRole('button', { name: 'Clear record: comic-to-storyboard (Domain skill)' }),
    );
    expect(onClearActiveSkill).toHaveBeenCalledOnce();
  });

  it('localizes active skill lifecycle metadata while preserving raw tokens as titles', () => {
    virtualItems = [{ index: 0, key: 'skill-notice', start: 0 }];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          activeSkillNotice={{
            skillName: 'creation-persona',
            records: [
              {
                id: 'record-1',
                skillName: 'creation-persona',
                slot: 'stagePersona',
                owner: 'creation-profile',
                clearable: false,
                lockedReason: 'Creation stage persona is cleared when its owning stage exits',
              },
            ],
          }}
        />
      </MessageActionsProvider>,
      'zh-cn',
    );

    expect(screen.getByText('阶段人设').getAttribute('title')).toBe('stagePersona');
    expect(screen.getByText('创作 Profile').getAttribute('title')).toBe('creation-profile');
    expect(screen.getByText('随所属创作阶段退出自动清理').getAttribute('title')).toBe(
      'Creation stage persona is cleared when its owning stage exits',
    );
    expect(screen.queryByText('stagePersona')).toBeNull();
    expect(screen.queryByText('creation-profile')).toBeNull();
    expect(
      screen.queryByText('Creation stage persona is cleared when its owning stage exits'),
    ).toBeNull();
  });

  it('does not render activation progress as a standalone row above messages', () => {
    virtualItems = [];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          activationProgress={[
            {
              conversationId: 'conv-1',
              activationId: 'activation-1',
              target: 'skill',
              action: 'activate',
              name: 'quality-review',
              source: 'agent-tool',
              requestedBy: 'agent',
              reason: 'Agent selected review',
              status: 'succeeded',
              events: [
                activationEvent('event-1', 'requested', 'succeeded', 1),
                activationEvent('event-2', 'validated', 'succeeded', 2),
                activationEvent('event-3', 'active', 'succeeded', 3),
              ],
            },
          ]}
        />
      </MessageActionsProvider>,
    );

    expect(screen.queryByRole('button', { name: /Skill succeeded/ })).toBeNull();
    expect(screen.queryByText('quality-review')).toBeNull();
    expect(screen.queryByText('requested')).toBeNull();
  });
});

function renderWithI18n(node: React.ReactElement, locale: 'en' | 'zh-cn' = 'en') {
  const service = new I18nService(locale);
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

function createReadImageContextMessage(): Message {
  return {
    id: 'message-read-image',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    contentBlocks: [
      {
        id: 'read-image-block',
        type: 'tool_call',
        timestamp: 10,
        toolCall: {
          id: 'read-image-1',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  alias: 'P1',
                  label: 'Page 1',
                  resourceRef: {
                    id: 'page-1',
                    scope: 'project',
                    provider: 'read-image',
                    kind: 'media',
                    source: { kind: 'file', projectRelativePath: 'images/page-1.jpg' },
                    locator: { kind: 'file', path: 'images/page-1.jpg' },
                    fingerprint: {
                      strategy: 'provider',
                      providerId: 'read-image',
                      value: 'page-1',
                    },
                  },
                },
              ],
            },
            attachments: [
              {
                type: 'image',
                path: 'vscode-webview://page-1.jpg',
                mimeType: 'image/jpeg',
              },
            ],
          },
        },
      },
    ],
  };
}

function createStoryboardMarkdownMessage(): Message {
  return {
    id: 'message-storyboard-markdown',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_001_000,
    contentBlocks: [
      {
        id: 'storyboard-text',
        type: 'text',
        timestamp: 20,
        content: [
          '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | full page | keep | 3s | Page opening frame | slow push | low rumble | lead |  | cinematic frame | needs-review | split-panels | story | narrative beat | true |  |',
        ].join('\n'),
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

function activationEvent(
  id: string,
  step:
    | 'requested'
    | 'validated'
    | 'loaded'
    | 'prepared'
    | 'record-created'
    | 'projected'
    | 'active'
    | 'failed',
  status: 'pending' | 'running' | 'succeeded' | 'failed',
  at: number,
) {
  return {
    id,
    activationId: 'activation-1',
    conversationId: 'conv-1',
    target: 'skill' as const,
    action: 'activate' as const,
    name: 'quality-review',
    step,
    status,
    source: 'agent-tool' as const,
    requestedBy: 'agent' as const,
    reason: 'Agent selected review',
    at,
  };
}
