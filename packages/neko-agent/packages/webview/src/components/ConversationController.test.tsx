import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SettingsState } from '@neko-agent/types';
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
    pendingSendRequest?: { id: number; input: { messageText?: string } } | null;
    initialInputRequest?: { id: number; messageText: string } | null;
    initialEntryPromptMenuRequest?: { id: number; menu: 'generate-assets' | 'roleplay' } | null;
    onInitialEntryPromptMenuRequestConsumed?: (id: number) => void;
  }) => (
    <div data-testid="chat-workspace">
      <span data-testid="entry-menu">{props.initialEntryPromptMenuRequest?.menu ?? 'none'}</span>
      <span data-testid="pending-send">
        {props.pendingSendRequest?.input.messageText ?? 'none'}
      </span>
      <span data-testid="initial-input">{props.initialInputRequest?.messageText ?? 'none'}</span>
    </div>
  ),
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
});

function createProps(): React.ComponentProps<typeof ConversationController> {
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
        <span data-testid="tab-count">{props.tabs.length}</span>
      </div>
    ),
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
