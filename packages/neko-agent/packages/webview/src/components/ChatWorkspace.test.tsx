import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentState, Message, SettingsState } from '@neko-agent/types';
import type { ChatWorkspaceProps } from './ChatWorkspace';
import { ChatWorkspace } from './ChatWorkspace';

const vscodeMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  refreshConfigSnapshot: vi.fn(),
  searchProjectFiles: vi.fn(),
  getContextTokenCount: vi.fn(),
  getTasks: vi.fn(),
  getPromptMode: vi.fn(),
  getMessageQueue: vi.fn(),
  clearHistory: vi.fn(),
  compressContext: vi.fn(),
  setPromptMode: vi.fn(),
  cancelMessage: vi.fn(),
  cancelTask: vi.fn(),
  retryTask: vi.fn(),
  viewTaskResult: vi.fn(),
  promoteQueuedMessage: vi.fn(),
  cancelQueuedMessage: vi.fn(),
  editQueuedMessage: vi.fn(),
}));

vi.mock('@/messages', () => ({
  VSCodeMessages: vscodeMocks,
}));

vi.mock('@/components/ChatView', () => ({
  ChatView: (props: {
    activeConversationId: string | null;
    inputValue: string;
    onSend: (input?: { messageText?: string; displayMessageText?: string }) => void;
    onPromoteQueuedMessage?: (queueItemId: string) => void;
    onCancelQueuedMessage?: (queueItemId: string) => void;
    onEditQueuedMessage?: (queueItemId: string) => void;
    entryPromptMenu?: 'generate-assets' | 'roleplay' | null;
    onEntryPromptMenuChange?: (menu: 'generate-assets' | 'roleplay' | null) => void;
  }) => (
    <div>
      <button
        type="button"
        data-testid="send"
        onClick={() =>
          props.onSend({
            messageText: 'hello from tabless state',
            displayMessageText: 'hello from tabless state',
          })
        }
      >
        {props.activeConversationId ?? 'no-conversation'}
      </button>
      <button
        type="button"
        data-testid="entry-close"
        onClick={() => props.onEntryPromptMenuChange?.(null)}
      />
      <button
        type="button"
        data-testid="promote-queued"
        onClick={() => props.onPromoteQueuedMessage?.('queued-1')}
      />
      <button
        type="button"
        data-testid="cancel-queued"
        onClick={() => props.onCancelQueuedMessage?.('queued-1')}
      />
      <button
        type="button"
        data-testid="edit-queued"
        onClick={() => props.onEditQueuedMessage?.('queued-1')}
      />
      <span data-testid="entry-menu">{props.entryPromptMenu ?? 'none'}</span>
      <span data-testid="input-value">{props.inputValue}</span>
    </div>
  ),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  COMMON_SHORTCUTS: {
    focusInput: (handler: () => void) => ({ id: 'focusInput', handler }),
    clearConversation: (handler: () => void) => ({ id: 'clearConversation', handler }),
    newConversation: (handler: () => void) => ({ id: 'newConversation', handler }),
    copyLastResponse: (handler: () => void) => ({ id: 'copyLastResponse', handler }),
    cancel: (handler: () => void) => ({ id: 'cancel', handler }),
  },
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/hooks/useSlashCommands', () => ({
  useSlashCommands: () => ({
    handleSlashCommand: vi.fn(),
  }),
}));

describe('ChatWorkspace pending send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replays a tabless send after a new conversation is activated in default agent mode', () => {
    const onSendWithoutConversation = vi.fn();
    const onPendingSendRequestConsumed = vi.fn();
    const { rerender, getByTestId } = render(
      <ChatWorkspace
        {...createProps({
          activeConversationId: null,
          activeConversationIdRef: createRefWithCurrent<string | null>(null),
          activeTabConversationId: null,
          onSendWithoutConversation,
          onPendingSendRequestConsumed,
        })}
      />,
    );

    act(() => {
      getByTestId('send').click();
    });

    expect(onSendWithoutConversation).toHaveBeenCalledWith({
      messageText: 'hello from tabless state',
      displayMessageText: 'hello from tabless state',
    });
    expect(vscodeMocks.sendMessage).not.toHaveBeenCalled();

    rerender(
      <ChatWorkspace
        {...createProps({
          activeConversationId: 'conv-new',
          activeConversationIdRef: createRefWithCurrent<string | null>('conv-new'),
          activeTabConversationId: 'conv-new',
          pendingSendRequest: {
            id: 1,
            input: {
              messageText: 'hello from tabless state',
              displayMessageText: 'hello from tabless state',
            },
          },
          onSendWithoutConversation,
          onPendingSendRequestConsumed,
        })}
      />,
    );

    expect(vscodeMocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-new',
        message: 'hello from tabless state',
        sessionMode: 'agent',
      }),
    );
    expect(onPendingSendRequestConsumed).toHaveBeenCalledWith(1);

    rerender(
      <ChatWorkspace
        {...createProps({
          activeConversationId: 'conv-new',
          activeConversationIdRef: createRefWithCurrent<string | null>('conv-new'),
          activeTabConversationId: 'conv-new',
          pendingSendRequest: {
            id: 1,
            input: {
              messageText: 'hello from tabless state',
              displayMessageText: 'hello from tabless state',
            },
          },
          onSendWithoutConversation,
          onPendingSendRequestConsumed,
        })}
      />,
    );

    expect(vscodeMocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps running-turn queued sends out of transcript messages', () => {
    const setMessages = vi.fn();
    const onUserMessageSent = vi.fn();
    const { getByTestId } = render(
      <ChatWorkspace
        {...createProps({
          isThinking: true,
          setMessages,
          onUserMessageSent,
          streamingMessageIdRef: createRefWithCurrent<string | null>('assistant-streaming'),
        })}
      />,
    );

    fireEvent.click(getByTestId('send'));

    expect(vscodeMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        message: 'hello from tabless state',
      }),
    );
    expect(setMessages).not.toHaveBeenCalled();
    expect(onUserMessageSent).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      message: expect.objectContaining({
        role: 'user',
        content: 'hello from tabless state',
        isQueued: true,
      }),
    });
  });

  it('opens the asset generation entry prompt from an initial controller request', () => {
    const onInitialEntryPromptMenuRequestConsumed = vi.fn();
    render(
      <ChatWorkspace
        {...createProps({
          initialEntryPromptMenuRequest: { id: 1, menu: 'generate-assets' },
          onInitialEntryPromptMenuRequestConsumed,
        })}
      />,
    );

    expect(screen.getByTestId('entry-menu').textContent).toBe('generate-assets');
    expect(onInitialEntryPromptMenuRequestConsumed).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTestId('entry-close'));
    expect(screen.getByTestId('entry-menu').textContent).toBe('none');
  });

  it('prefills entry text after a new conversation is activated', () => {
    const onInitialInputRequestConsumed = vi.fn();
    const onMentionSearchFilterChange = vi.fn();
    render(
      <ChatWorkspace
        {...createProps({
          initialInputRequest: { id: 3, messageText: '@hero' },
          onInitialInputRequestConsumed,
          onMentionSearchFilterChange,
        })}
      />,
    );

    expect(screen.getByTestId('input-value').textContent).toBe('@hero');
    expect(onMentionSearchFilterChange).toHaveBeenCalledWith('hero');
    expect(vscodeMocks.searchProjectFiles).toHaveBeenCalledWith('hero', 'conv-1');
    expect(onInitialInputRequestConsumed).toHaveBeenCalledWith(3);
  });

  it('opens the roleplay entity prompt from an initial controller request and refreshes candidates', () => {
    const onMentionSearchFilterChange = vi.fn();
    const onInitialEntryPromptMenuRequestConsumed = vi.fn();
    render(
      <ChatWorkspace
        {...createProps({
          onMentionSearchFilterChange,
          initialEntryPromptMenuRequest: { id: 2, menu: 'roleplay' },
          onInitialEntryPromptMenuRequestConsumed,
        })}
      />,
    );

    expect(onMentionSearchFilterChange).toHaveBeenCalledWith('');
    expect(vscodeMocks.searchProjectFiles).toHaveBeenCalledWith('', 'conv-1', {
      purpose: 'roleplay',
    });
    expect(screen.getByTestId('entry-menu').textContent).toBe('roleplay');
    expect(onInitialEntryPromptMenuRequestConsumed).toHaveBeenCalledWith(2);
  });

  it('restores a queued edit request into an empty composer', () => {
    const onQueuedEditRequestConsumed = vi.fn();
    render(
      <ChatWorkspace
        {...createProps({
          queuedEditRequest: {
            id: 7,
            conversationId: 'conv-1',
            item: {
              id: 'queued-1',
              conversationId: 'conv-1',
              content: '重新整理这条消息',
              createdAt: 1,
              source: 'composer',
            },
          },
          onQueuedEditRequestConsumed,
        })}
      />,
    );

    expect(screen.getByTestId('input-value').textContent).toBe('重新整理这条消息');
    expect(onQueuedEditRequestConsumed).toHaveBeenCalledWith(7);
  });

  it('does not overwrite an existing composer draft for queued edit restore', () => {
    const onQueuedEditRequestConsumed = vi.fn();
    const onQueuedEditConflict = vi.fn();
    render(
      <ChatWorkspace
        {...createProps({
          initialInputRequest: { id: 1, messageText: '已有草稿' },
          queuedEditRequest: {
            id: 7,
            conversationId: 'conv-1',
            item: {
              id: 'queued-1',
              conversationId: 'conv-1',
              content: '被移除的排队消息',
              createdAt: 1,
              source: 'composer',
            },
          },
          onQueuedEditRequestConsumed,
          onQueuedEditConflict,
        })}
      />,
    );

    expect(screen.getByTestId('input-value').textContent).toBe('已有草稿');
    expect(onQueuedEditConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        item: expect.objectContaining({ id: 'queued-1' }),
      }),
    );
    expect(onQueuedEditRequestConsumed).toHaveBeenCalledWith(7);
  });

  it('routes queued message controls through the VSCode message facade', () => {
    const { getByTestId } = render(<ChatWorkspace {...createProps()} />);

    fireEvent.click(getByTestId('promote-queued'));
    expect(vscodeMocks.promoteQueuedMessage).toHaveBeenCalledWith('conv-1', 'queued-1');
    fireEvent.click(getByTestId('cancel-queued'));
    expect(vscodeMocks.cancelQueuedMessage).toHaveBeenCalledWith('conv-1', 'queued-1');
    fireEvent.click(getByTestId('edit-queued'));
    expect(vscodeMocks.editQueuedMessage).toHaveBeenCalledWith('conv-1', 'queued-1');
  });
});

function createProps(overrides: Partial<ChatWorkspaceProps> = {}): ChatWorkspaceProps {
  const noop = vi.fn();
  return {
    messages: [],
    setMessages: noop as React.Dispatch<React.SetStateAction<Message[]>>,
    isThinking: false,
    setIsThinking: noop as React.Dispatch<React.SetStateAction<boolean>>,
    streamingMessageId: null,
    queuedMessageCount: 0,
    setStreamingMessageId: noop as React.Dispatch<React.SetStateAction<string | null>>,
    streamingMessageIdRef: createRefWithCurrent<string | null>(null),
    activeConversationId: 'conv-1',
    activeConversationIdRef: createRefWithCurrent<string | null>('conv-1'),
    activeTabConversationId: 'conv-1',
    conversationKind: 'chat',
    queuedMessages: [],
    clearMessages: noop,
    settings: createSettings(),
    updateSettings: noop,
    selectedModel: 'auto',
    setSelectedModel: noop as React.Dispatch<React.SetStateAction<string>>,
    mediaModelSelection: { image: 'none', video: 'none', audio: 'none' },
    setMediaModelSelection: noop as React.Dispatch<
      React.SetStateAction<{ image: string; video: string; audio: string }>
    >,
    mentionItems: [],
    onMentionSearchFilterChange: noop,
    pluginCommands: [],
    workItems: [],
    pluginsAvailable: {},
    setActiveTab: noop as React.Dispatch<React.SetStateAction<'chat'>>,
    conversationMessagesRef: createRefWithCurrent(new Map()),
    conversationStreamingRef: createRefWithCurrent(new Map()),
    conversationTokenCountRef: createRefWithCurrent(new Map()),
    conversationCompressingRef: createRefWithCurrent(new Map()),
    conversationAgentStateRef: createRefWithCurrent(new Map<string, AgentState>()),
    contextTokenCount: 0,
    isCompressing: false,
    mediaModelCallCount: 0,
    skills: [],
    activeSkill: null,
    setActiveSkill: noop as React.Dispatch<React.SetStateAction<ChatWorkspaceProps['activeSkill']>>,
    contextChips: [],
    ambientNodes: [],
    onAddContextChip: noop,
    onRemoveContextChip: noop,
    onInjectContextChip: noop,
    agentState: null,
    handleMessage: noop,
    setAmbientNodes: noop as React.Dispatch<
      React.SetStateAction<Array<{ nodeId: string; type: string; summary: string }>>
    >,
    onNewChat: noop,
    sessionCleanupRef: createRefWithCurrent(null),
    ...overrides,
  };
}

function createSettings(): SettingsState {
  return {
    providers: [],
    configuredProviders: [],
    selectedProviderId: 'test',
    selectedModelId: 'test-model',
    systemPrompt: '',
    autoExecuteTools: false,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.2,
    maxTokens: 8192,
    executionMode: 'ask',
    promptMode: 'default',
    chatModelOptions: [
      {
        id: 'test-model',
        providerId: 'test',
        modelId: 'test-model',
        label: 'Test Model',
        category: 'llm',
      },
    ],
    modelGroups: [],
    ssoSession: null,
  };
}

function createRefWithCurrent<T>(current: T): React.MutableRefObject<T> {
  const ref = createRef<T>() as React.MutableRefObject<T>;
  ref.current = current;
  return ref;
}
