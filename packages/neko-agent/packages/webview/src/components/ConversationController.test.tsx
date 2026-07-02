import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationSummary, Message, SettingsState } from '@neko-agent/types';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import { ConversationController } from './ConversationController';

const vscodeMocks = vi.hoisted(() => ({
  getConversations: vi.fn(),
  getActiveConversation: vi.fn(),
  refreshConfigSnapshot: vi.fn(),
  getAgentStates: vi.fn(),
  getSkills: vi.fn(),
  getTabState: vi.fn(),
  updateTabState: vi.fn(),
  newConversation: vi.fn(),
  switchConversation: vi.fn(),
  searchProjectFiles: vi.fn(),
  getContextTokenCount: vi.fn(),
  getTasks: vi.fn(),
  getPromptMode: vi.fn(),
  getMessageQueue: vi.fn(),
}));

vi.mock('@/messages', () => ({
  VSCodeMessages: vscodeMocks,
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    locale: 'en',
    t: (key: string) =>
      ({
        'chat.emptyState.title': 'Neko Suite Creative Assistant',
        'chat.emptyState.description': 'Create stories, characters, scenes, and materials.',
        'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
        'chat.emptyState.entry.startChat': 'Start Chat',
        'chat.emptyState.entry.generateAssets': 'Generate Assets',
        'chat.emptyState.entry.roleplay': 'Roleplay',
        'chat.emptyState.entry.startChatHelper': 'Chat helper',
        'chat.emptyState.entry.generateAssetsHelper': 'Asset helper',
        'chat.emptyState.entry.roleplayHelper': 'Roleplay helper',
        'chat.input.placeholder': 'Type anything...',
        'chat.input.thinkingPlaceholder': 'Type next message...',
        'chat.input.queuePlaceholder': '{count} queued...',
        'chat.input.attach': 'Attach',
        'chat.input.commands': 'Commands',
        'chat.input.send': 'Send',
        'chat.input.queue': 'Queue',
        'chat.input.control.mode': 'Mode and model',
        'chat.input.control.params': 'Tool parameters',
        'chat.autoMode': 'Auto',
        'chat.selectModel': 'Select model',
        'chat.noModelsAvailable': 'No available models',
        'chat.sessionMode.sections.agent': 'Direct Agent Collaboration',
        'chat.sessionMode.sections.media': 'Media Generation',
        'chat.sessionMode.agent': 'Creative Collaboration',
        'chat.sessionMode.agentDesc': 'Refine ideas.',
        'chat.sessionMode.short.agent': 'Agent',
        'chat.sessionMode.summary.agent': 'Refine ideas.',
        'chat.sessionMode.image': 'Image Generation',
        'chat.sessionMode.imageDesc': 'Create images.',
        'chat.sessionMode.short.image': 'Image',
        'chat.sessionMode.summary.image': 'Create images.',
        'chat.sessionMode.video': 'Video Generation',
        'chat.sessionMode.videoDesc': 'Create videos.',
        'chat.sessionMode.short.video': 'Video',
        'chat.sessionMode.summary.video': 'Create videos.',
        'chat.sessionMode.audio': 'Sound Generation',
        'chat.sessionMode.audioDesc': 'Create sounds.',
        'chat.sessionMode.short.audio': 'Audio',
        'chat.sessionMode.summary.audio': 'Create sounds.',
        'chat.sessionMode.badge.agent': 'Chat',
        'chat.sessionMode.badge.image': 'Image',
        'chat.sessionMode.badge.video': 'Video',
        'chat.sessionMode.badge.audio': 'Sound',
        'chat.generation.category.image': 'Image',
        'chat.generation.category.video': 'Video',
        'chat.generation.category.audio': 'Audio',
        'chat.generation.model.none': 'Do not use',
        'chat.generation.model.noneShort': 'none',
        'chat.generation.model.select': 'Select {category} model',
        'chat.generation.model.unconfigured': 'No {category} model',
        'chat.generation.param.ratio': 'Ratio',
        'chat.generation.param.resolution': 'Resolution',
      })[key] ?? key,
  }),
}));

vi.mock('@/components/ChatWorkspace', () => ({
  ChatWorkspace: (props: {
    activeConversationId?: string | null;
    activeTabConversationId?: string | null;
    messages?: Message[];
    isForegroundConversationActivationPending?: boolean;
    activationProgress?: readonly ActivationProgressTimeline[];
    handleMessage?: (event: MessageEvent) => void;
    pendingSendRequest?: { id: number; input: { messageText?: string } } | null;
    initialInputRequest?: { id: number; messageText: string } | null;
    initialEntryPromptMenuRequest?: { id: number; menu: 'generate-assets' | 'roleplay' } | null;
    onInitialEntryPromptMenuRequestConsumed?: (id: number) => void;
  }) => {
    const isConversationSwitching = Boolean(
      props.isForegroundConversationActivationPending ||
      (props.activeTabConversationId &&
        props.activeTabConversationId !== props.activeConversationId),
    );

    useEffect(() => {
      if (!props.handleMessage) return;
      const listener = (event: MessageEvent) => props.handleMessage?.(event);
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    }, [props.handleMessage]);

    return (
      <div data-testid="chat-workspace">
        <span data-testid="workspace-conversation">{props.activeConversationId ?? 'none'}</span>
        <span data-testid="workspace-tab-conversation">
          {props.activeTabConversationId ?? 'none'}
        </span>
        <span data-testid="workspace-messages">
          {props.messages?.map((message) => message.content).join('|') ?? ''}
        </span>
        <span data-testid="workspace-switching">
          {isConversationSwitching ? 'switching' : 'idle'}
        </span>
        <span data-testid="workspace-activation-progress">
          {props.activationProgress?.map((timeline) => timeline.name).join(',') ?? 'none'}
        </span>
        <span data-testid="entry-menu">{props.initialEntryPromptMenuRequest?.menu ?? 'none'}</span>
        <span data-testid="pending-send">
          {props.pendingSendRequest?.input.messageText ?? 'none'}
        </span>
        <span data-testid="initial-input">{props.initialInputRequest?.messageText ?? 'none'}</span>
      </div>
    );
  },
}));

vi.mock('@/components/ChatView/InputArea', async () => {
  const { useInputAreaContext } = await vi.importActual<
    typeof import('@/components/ChatView/InputAreaContext')
  >('@/components/ChatView/InputAreaContext');
  return {
    InputArea: (props: {
      inputValue: string;
      onInputChange: (value: string) => void;
      onSend: () => void;
      disabled?: boolean;
      entryPromptMenu?: 'generate-assets' | 'roleplay' | null;
    }) => {
      const { onRequestFiles } = useInputAreaContext();
      return (
        <div>
          <input
            placeholder="Type anything..."
            value={props.inputValue}
            disabled={props.disabled}
            onChange={(event) => {
              const value = event.currentTarget.value;
              props.onInputChange(value);
              if (value.startsWith('@')) {
                onRequestFiles?.(value.slice(1));
              }
            }}
          />
          <button type="button" disabled={props.disabled} onClick={() => props.onSend()}>
            Send
          </button>
          <span data-testid="entry-page-menu">{props.entryPromptMenu ?? 'none'}</span>
        </div>
      );
    },
  };
});

describe('ConversationController entry state', () => {
  it('shows entry content only when no tabs are open and opens asset prompts from the entry button', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    expect(screen.getByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeTruthy();
    expect(screen.queryByTestId('chat-workspace')).toBeNull();
    expect(vscodeMocks.getTabState).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Generate Assets/ }));
    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.queryByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeNull();
    expect(screen.getByTestId('entry-menu').textContent).toBe('generate-assets');
  });

  it('opens a new chat tab from the start chat entry button', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Start Chat/ }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.queryByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeNull();
    expect(screen.getByTestId('entry-menu').textContent).toBe('none');
    expect(screen.getByTestId('pending-send').textContent).toBe('none');
    expect(screen.getByTestId('initial-input').textContent).toBe('none');
  });

  it('opens roleplay prompts from the entry button', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Roleplay/ }));

    expect(vscodeMocks.newConversation).not.toHaveBeenCalled();
    expect(vscodeMocks.searchProjectFiles).toHaveBeenCalledWith('', undefined, {
      purpose: 'roleplay',
    });
    expect(screen.getByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeTruthy();
    expect(screen.getByTestId('entry-page-menu').textContent).toBe('roleplay');
  });

  it('disables entry controls while the new tab is being activated', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Assets/ }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Generate Assets/ }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByPlaceholderText('Type anything...').hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Roleplay/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);
  });

  it('starts a new tab and sends entry text in chat mode', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: 'develop the city mood' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.getByTestId('pending-send').textContent).toBe('develop the city mood');
    expect(screen.getByTestId('initial-input').textContent).toBe('none');
  });

  it('runs entry-page mention search without opening a chat tab', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: '@hero' },
    });

    expect(vscodeMocks.newConversation).not.toHaveBeenCalled();
    expect(vscodeMocks.searchProjectFiles).toHaveBeenCalledWith('hero', undefined, {
      purpose: 'entry',
    });
    expect(screen.getByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.getByTestId('pending-send').textContent).toBe('@hero');
    expect(screen.getByTestId('initial-input').textContent).toBe('none');
  });

  it('returns to the entry page after closing the last tab and keeps entry mention search tabless', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Start Chat/ }));
    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'Draft Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.queryByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeNull();
    expect(screen.getByTestId('chat-workspace')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close Draft Chat' }));

    expect(screen.getByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeTruthy();
    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: '@hero' },
    });

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.searchProjectFiles).toHaveBeenCalledWith('hero', undefined, {
      purpose: 'entry',
    });
  });

  it('starts a new tab with asset prompt and preserves existing entry text as initial input', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: 'make a rain scene' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Generate Assets/ }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.getByTestId('entry-menu').textContent).toBe('generate-assets');
    expect(screen.getByTestId('initial-input').textContent).toBe('make a rain scene');
    expect(screen.getByTestId('pending-send').textContent).toBe('none');
  });

  it('does not project activation progress from a different conversation into the active tab', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Start Chat/ }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-a', title: 'Skill chat', messages: [] },
          },
        }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentCapabilityActivationProgress',
            conversationId: 'conv-a',
            events: [createActivationEvent('conv-a', 'ai-generate')],
          },
        }),
      );
    });
    expect(screen.getByTestId('workspace-activation-progress').textContent).toBe('ai-generate');
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Skill chat', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Clean chat', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-b',
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-activation-progress').textContent).toBe('');
  });

  it('does not display the previous conversation transcript after opening a history conversation', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: '分析前10页，生成分镜表', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: '生成猫猫玩耍的图片', messageCount: 1, updatedAt: 1 },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open 分析前10页，生成分镜表' }));
    expect(vscodeMocks.switchConversation).toHaveBeenCalledWith('conv-a');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: {
              id: 'conv-a',
              title: '分析前10页，生成分镜表',
              messages: [message('message-a', '分析前10页，生成分镜表')],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-conversation').textContent).toBe('conv-a');
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-a');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('分析前10页，生成分镜表');

    fireEvent.click(screen.getByRole('button', { name: 'Open 生成猫猫玩耍的图片' }));

    expect(vscodeMocks.switchConversation).toHaveBeenCalledWith('conv-b');
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-switching').textContent).toBe('switching');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: {
              id: 'conv-b',
              title: '生成猫猫玩耍的图片',
              messages: [message('message-b', '生成猫猫玩耍的图片')],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-switching').textContent).toBe('idle');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('生成猫猫玩耍的图片');
  });
});

function createActivationEvent(conversationId: string, name: string) {
  return {
    id: `${conversationId}-event-1`,
    activationId: `${conversationId}-activation-1`,
    conversationId,
    target: 'skill',
    action: 'activate',
    name,
    step: 'active',
    status: 'succeeded',
    source: 'agent-tool',
    requestedBy: 'agent',
    at: 1,
  };
}

interface CreatePropsOptions {
  readonly history?: readonly ConversationSummary[];
}

function createProps(
  options: CreatePropsOptions = {},
): React.ComponentProps<typeof ConversationController> {
  return {
    settings: createSettings(),
    setSettings: vi.fn(),
    setHasConfigSnapshot: vi.fn(),
    setProjectFiles: vi.fn(),
    mentionItems: [],
    setMentionItems: vi.fn(),
    mentionSearchFilter: '',
    setMentionSearchFilter: vi.fn(),
    pluginCommands: [],
    setPluginCommands: vi.fn(),
    updateSettings: vi.fn(),
    workItemsByConversation: new Map(),
    setWorkItemsByConversation: vi.fn(),
    pluginsAvailable: {},
    setPluginsAvailable: vi.fn(),
    setShowOnboarding: vi.fn(),
    renderHeader: (props) => (
      <div data-testid="header">
        <button type="button" onClick={props.onNewChat}>
          New
        </button>
        {props.tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => props.onCloseTab(tab.id)}>
            Close {tab.title}
          </button>
        ))}
        {options.history?.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => props.onOpenConversation(conversation.id, conversation.title)}
          >
            Open {conversation.title}
          </button>
        ))}
        <span data-testid="tab-count">{props.tabs.length}</span>
      </div>
    ),
  };
}

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    timestamp: 1,
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
