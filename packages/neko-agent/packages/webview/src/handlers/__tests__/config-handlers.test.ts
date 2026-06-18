import { describe, expect, it, vi } from 'vitest';
import type { ExtensionToWebviewMessage } from '@neko-agent/types';
import { configHandlers } from '../config-handlers';
import type { MessageHandlerContext } from '../types';

describe('configHandlers', () => {
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
          code: 'invalidJson',
          filePath: '/home/user/.neko/config.json',
          message:
            'Configuration file contains invalid JSON: /home/user/.neko/config.json. Fix the file, then open a new Agent session or tab.',
        },
      },
      context,
    );

    expect(context.setSettings).toHaveBeenCalledTimes(1);
    expect(context.setGlobalError).toHaveBeenCalledWith(
      'Configuration file contains invalid JSON: /home/user/.neko/config.json. Fix the file, then open a new Agent session or tab.',
    );
  });

  it('projects config state diagnostics into state and global error', () => {
    const context = createContext();

    dispatch(
      {
        type: 'configState',
        config: {
          configuredProviders: [],
          configDiagnostic: {
            code: 'empty',
            filePath: '/home/user/.neko/config.json',
            message:
              'Configuration file is empty: /home/user/.neko/config.json. Fix the file, then open a new Agent session or tab.',
          },
        },
      },
      context,
    );

    expect(context.setSettings).toHaveBeenCalledTimes(1);
    expect(context.setGlobalError).toHaveBeenCalledWith(
      'Configuration file is empty: /home/user/.neko/config.json. Fix the file, then open a new Agent session or tab.',
    );
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
    setOpenTabs: vi.fn(),
    setActiveTabId: vi.fn(),
    setActiveTab: vi.fn(),
    requestConfigSnapshot: vi.fn(),
    setSettings: vi.fn(),
    setSelectedModel: vi.fn(),
    setMediaModelSelection: vi.fn(),
    updateSettings: vi.fn(),
    setPromptModeForConversation: vi.fn(),
    setAgentState: vi.fn(),
    conversationAgentStateRef: { current: new Map() },
    forceAgentStateUpdate: vi.fn(),
    setSkills: vi.fn(),
    setActiveSkill: vi.fn(),
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
