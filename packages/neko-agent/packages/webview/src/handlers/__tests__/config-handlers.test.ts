import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionToWebviewMessage } from '@neko-agent/types';
import { configHandlers } from '../config-handlers';
import type { MessageHandlerContext } from '../types';

const messageMocks = vi.hoisted(() => ({
  updateSettingsMessage: vi.fn(),
}));

vi.mock('../../messages', () => ({
  AgentHostMessages: {
    updateSettings: messageMocks.updateSettingsMessage,
  },
  VSCodeMessages: {
    updateSettings: messageMocks.updateSettingsMessage,
  },
}));

describe('configHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats configChanged as a deprecated no-op', () => {
    const context = createContext();

    dispatch({ type: 'configChanged' }, context);

    expect(context.requestConfigSnapshot).not.toHaveBeenCalled();
    expect(context.setGlobalError).not.toHaveBeenCalled();
    expect(context.setSettings).not.toHaveBeenCalled();
  });

  it('projects safe settings diagnostics into state and global error', () => {
    const context = createContext();

    dispatch(
      {
        type: 'settingsData',
        providers: [],
        selectedProviderId: null,
        selectedModelId: null,
        configDiagnostic: {
          code: 'invalidToml',
          filePath: '/home/user/.neko/config.toml',
          message:
            'Configuration file contains invalid TOML: /home/user/.neko/config.toml. Fix the file, then open a new Agent session or tab.',
        },
      },
      context,
    );

    expect(context.setSettings).toHaveBeenCalledTimes(1);
    expect(context.setSelectedModel).toHaveBeenCalledWith('');
    expect(context.setGlobalError).toHaveBeenCalledWith(
      'Configuration file contains invalid TOML: /home/user/.neko/config.toml. Fix the file, then open a new Agent session or tab.',
    );
  });

  it('does not show a global error when settings data has no blocking diagnostic', () => {
    const context = createContext();

    dispatch(
      {
        type: 'settingsData',
        providers: [],
        selectedProviderId: null,
        selectedModelId: null,
        chatModelOptions: [],
        modelGroups: [],
      },
      context,
    );

    expect(context.setSettings).toHaveBeenCalledTimes(1);
    expect(context.setHasConfigSnapshot).not.toHaveBeenCalled();
    expect(context.setSelectedModel).toHaveBeenCalledWith('');
    expect(context.setGlobalError).not.toHaveBeenCalled();
  });

  it('hydrates the selected chat model when config has an explicit selection', () => {
    const context = createContext();

    dispatch(
      {
        type: 'settingsData',
        providers: [],
        selectedProviderId: 'openai',
        selectedModelId: 'gpt-4.1',
      },
      context,
    );

    expect(context.setSelectedModel).toHaveBeenCalledWith('openai:gpt-4.1');
  });

  it('keeps the current model when a stale settings snapshot selects a different available model', () => {
    const context = createContext();
    context.selectedModelRef = { current: 'neko-account-gateway:gpt-5.5' };

    dispatch(
      {
        type: 'settingsData',
        providers: [],
        selectedProviderId: 'deepseek-chat',
        selectedModelId: 'deepseek-v4-pro',
        chatModelOptions: [
          {
            id: 'deepseek-chat:deepseek-v4-pro',
            label: 'DeepSeek V4 Pro',
            providerId: 'deepseek-chat',
            modelId: 'deepseek-v4-pro',
            category: 'llm',
          },
          {
            id: 'neko-account-gateway:gpt-5.5',
            label: 'GPT 5.5',
            providerId: 'neko-account-gateway',
            modelId: 'gpt-5.5',
            category: 'llm',
          },
        ],
      },
      context,
    );

    expect(context.setSelectedModel).not.toHaveBeenCalled();
  });

  it('hydrates the first real LLM model when settings has no explicit selection', () => {
    const context = createContext();

    dispatch(
      {
        type: 'settingsData',
        providers: [],
        selectedProviderId: null,
        selectedModelId: null,
        chatModelOptions: [
          {
            id: 'neko-account-gateway:auto',
            label: 'Neko Official / Auto',
            providerId: 'neko-account-gateway',
            modelId: 'auto',
            category: 'llm',
          },
        ],
      },
      context,
    );

    expect(context.setSelectedModel).toHaveBeenCalledWith('neko-account-gateway:auto');
    expect(context.updateSettings).toHaveBeenCalledWith({
      selectedProviderId: 'neko-account-gateway',
      selectedModelId: 'auto',
    });
    expect(messageMocks.updateSettingsMessage).toHaveBeenCalledWith({
      providerId: 'neko-account-gateway',
      modelId: 'auto',
    });
  });

  it('prefers explicit config LLM models over account gateway models for automatic hydration', () => {
    const context = createContext();

    dispatch(
      {
        type: 'settingsData',
        providers: [],
        selectedProviderId: null,
        selectedModelId: null,
        chatModelOptions: [
          {
            id: 'neko-account-gateway:auto',
            label: 'Neko Official / Auto',
            providerId: 'neko-account-gateway',
            modelId: 'auto',
            source: 'account-gateway',
            category: 'llm',
          },
          {
            id: 'deepseek-direct:deepseek-chat',
            label: 'DeepSeek / deepseek-chat',
            providerId: 'deepseek-direct',
            modelId: 'deepseek-chat',
            source: 'explicit-config',
            category: 'llm',
          },
        ],
      },
      context,
    );

    expect(context.setSelectedModel).toHaveBeenCalledWith('deepseek-direct:deepseek-chat');
    expect(context.updateSettings).toHaveBeenCalledWith({
      selectedProviderId: 'deepseek-direct',
      selectedModelId: 'deepseek-chat',
    });
    expect(messageMocks.updateSettingsMessage).toHaveBeenCalledWith({
      providerId: 'deepseek-direct',
      modelId: 'deepseek-chat',
    });
  });

  it('keeps missing config diagnostics in state without a global error', () => {
    const context = createContext();

    dispatch(
      {
        type: 'configState',
        config: {
          configuredProviders: [],
          configDiagnostic: {
            code: 'missingConfig',
            filePath: '/home/user/.neko/config.toml',
            message:
              'Agent configuration file is missing: /home/user/.neko/config.toml. Create the config file with at least one enabled provider, chat model, and required provider credentials, then open a new Agent session or tab.',
          },
        },
      },
      context,
    );

    expect(context.setSettings).toHaveBeenCalledTimes(1);
    expect(context.setHasConfigSnapshot).toHaveBeenCalledWith(true);
    expect(context.setGlobalError).not.toHaveBeenCalled();
  });
});

function dispatch(message: ExtensionToWebviewMessage, context: MessageHandlerContext): void {
  const registration = configHandlers.find((handler) => handler.type === message.type);
  expect(registration).toBeDefined();
  registration?.handler(message, context);
}

function createContext(): MessageHandlerContext {
  return {
    messages: [],
    setMessages: vi.fn(),
    isThinking: false,
    setIsThinking: vi.fn(),
    setStreamingMessageId: vi.fn(),
    setQueuedMessageCount: vi.fn(),
    streamingMessageId: null,
    queuedMessageCount: 0,
    streamingMessageIdRef: { current: null },
    activeConversationId: null,
    activeConversationIdRef: { current: null },
    conversationMessagesRef: { current: new Map() },
    conversationStreamingRef: { current: new Map() },
    openTabs: [],
    activeTabId: null,
    isTablessConversationViewRef: { current: false },
    setOpenTabs: vi.fn(),
    setActiveTabId: vi.fn(),
    setActiveTab: vi.fn(),
    requestConfigSnapshot: vi.fn(),
    setSettings: vi.fn(),
    setHasConfigSnapshot: vi.fn(),
    setSelectedModel: vi.fn(),
    setMediaModelSelection: vi.fn(),
    updateSettings: vi.fn(),
    setPromptModeForConversation: vi.fn(),
    setAgentState: vi.fn(),
    conversationAgentStateRef: { current: new Map() },
    forceAgentStateUpdate: vi.fn(),
    setSkills: vi.fn(),
    setActiveSkill: vi.fn(),
    setActivationProgressByConversation: vi.fn(),
    setGlobalError: vi.fn(),
    conversationTokenCountRef: { current: new Map() },
    conversationCompressingRef: { current: new Map() },
    forceUpdate: vi.fn(),
    isCurrentConversation: () => true,
    updateNonCurrentConversation: vi.fn(),
    setConversations: vi.fn(),
    setActiveConversationId: vi.fn(),
    setWorkItemsByConversation: vi.fn(),
    setProjectFiles: vi.fn(),
    mentionSearchFilter: '',
    setMentionItems: vi.fn(),
    setPluginCommands: vi.fn(),
    setPluginsAvailable: vi.fn(),
    setShowOnboarding: vi.fn(),
  };
}
