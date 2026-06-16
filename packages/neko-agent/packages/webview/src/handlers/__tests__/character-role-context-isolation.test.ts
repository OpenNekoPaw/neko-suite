import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it } from 'vitest';
import type { ExtensionToWebviewMessage, OpenTab } from '@neko-agent/types';
import type { Message } from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import { conversationHandlers } from '../conversation-handlers';
import { tabHandlers } from '../tab-handlers';
import type { HandlerRegistration, MessageHandlerContext, StreamingState } from '../types';

describe('character role context isolation', () => {
  it('keeps active conversation refs aligned for ordinary activeConversation updates', () => {
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');
    const harness = createContextHarness({
      activeConversationId: 'conv-old',
      activeTabId: 'tab-old',
      currentMessages: [],
      currentStreaming: { isThinking: true, streamingMessageId: 'old-stream' },
      openTabs: [{ id: 'tab-old', title: 'Old chat', conversationId: 'conv-old' }],
    });

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: {
          id: 'conv-a',
          title: 'Ordinary chat',
          messages: [ordinaryMessage],
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-a');
    expect(harness.context.streamingMessageIdRef.current).toBeNull();
    expect(harness.messages()).toEqual([ordinaryMessage]);
    expect(harness.streaming()).toEqual({ isThinking: false, streamingMessageId: null });
  });

  it('caches ordinary activeConversation updates without replacing an active role session view', () => {
    const roleTab: OpenTab = {
      id: 'tab-role',
      title: 'Character Dialogue: 小橘',
      conversationId: 'role-session-1',
      kind: 'character-dialogue',
    };
    const roleMessages = [message('role-message', 'assistant', '角色回复')];
    const harness = createContextHarness({
      activeConversationId: 'role-session-1',
      activeTabId: roleTab.id,
      currentMessages: roleMessages,
      currentStreaming: { isThinking: false, streamingMessageId: null },
      openTabs: [roleTab],
    });
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: {
          id: 'conv-a',
          title: 'Ordinary chat',
          messages: [ordinaryMessage],
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('role-session-1');
    expect(harness.context.activeConversationIdRef.current).toBe('role-session-1');
    expect(harness.activeTabId()).toBe('tab-role');
    expect(harness.messages()).toEqual(roleMessages);
    expect(harness.streaming()).toEqual({ isThinking: false, streamingMessageId: null });
    expect(harness.conversationMessages().get('conv-a')).toEqual([ordinaryMessage]);
    expect(harness.openTabs()).toHaveLength(2);
    expect(harness.openTabs()[0]).toEqual(roleTab);
    expect(harness.openTabs()[1]).toMatchObject({
      title: 'Ordinary chat',
      conversationId: 'conv-a',
    });
  });

  it('restores role session messages from tabState without displaying ordinary chat history', () => {
    const roleTab: OpenTab = {
      id: 'tab-embody',
      title: 'Embody: 小橘',
      conversationId: 'embody-session-1',
      kind: 'embody-character',
    };
    const ordinaryMessages = [message('ordinary-message', 'assistant', '普通 Agent 回复')];
    const roleMessages = [message('role-message', 'assistant', '角色反馈')];
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-conv-a',
      currentMessages: ordinaryMessages,
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'ordinary-stream',
        queuedMessageCount: 0,
      },
      cachedMessages: new Map([['embody-session-1', roleMessages]]),
      cachedStreaming: new Map([
        [
          'embody-session-1',
          { isThinking: false, streamingMessageId: null, queuedMessageCount: 0 },
        ],
      ]),
      openTabs: [{ id: 'tab-conv-a', title: 'Ordinary chat', conversationId: 'conv-a' }],
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: {
          openTabs: [
            { id: 'tab-conv-a', title: 'Ordinary chat', conversationId: 'conv-a' },
            roleTab,
          ],
          activeTabId: roleTab.id,
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('embody-session-1');
    expect(harness.context.activeConversationIdRef.current).toBe('embody-session-1');
    expect(harness.activeTabId()).toBe(roleTab.id);
    expect(harness.messages()).toEqual(roleMessages);
    expect(harness.conversationMessages().get('conv-a')).toEqual(ordinaryMessages);
    expect(harness.conversationStreaming().get('conv-a')).toEqual({
      isThinking: true,
      streamingMessageId: 'ordinary-stream',
      queuedMessageCount: 0,
    });
  });
});

function dispatch(
  handlers: readonly HandlerRegistration[],
  message: ExtensionToWebviewMessage,
  context: MessageHandlerContext,
): void {
  const registration = handlers.find((handler) => handler.type === message.type);
  expect(registration).toBeDefined();
  registration?.handler(message, context);
}

interface ContextHarnessOptions {
  activeConversationId: string;
  activeTabId: string | null;
  currentMessages: Message[];
  currentStreaming: StreamingState;
  openTabs: OpenTab[];
  cachedMessages?: Map<string, Message[]>;
  cachedStreaming?: Map<string, StreamingState>;
}

interface ContextHarness {
  context: MessageHandlerContext;
  activeConversationId(): string | null;
  activeTabId(): string | null;
  messages(): Message[];
  streaming(): StreamingState;
  openTabs(): OpenTab[];
  conversationMessages(): Map<string, Message[]>;
  conversationStreaming(): Map<string, StreamingState>;
}

function createContextHarness(options: ContextHarnessOptions): ContextHarness {
  let activeConversationId: string | null = options.activeConversationId;
  let activeTabId: string | null = options.activeTabId;
  let messages: Message[] = options.currentMessages;
  let openTabs: OpenTab[] = options.openTabs;
  let streaming: StreamingState = options.currentStreaming;
  let workItems: AgentWorkItemStore = new Map();
  let pluginsAvailable: PluginsAvailable = {};
  const activeConversationIdRef = ref<string | null>(options.activeConversationId);
  const streamingMessageIdRef = ref<string | null>(streaming.streamingMessageId);
  const conversationMessagesRef = ref(new Map<string, Message[]>(options.cachedMessages ?? []));
  const conversationStreamingRef = ref(
    new Map<string, StreamingState>(options.cachedStreaming ?? []),
  );

  const context: MessageHandlerContext = {
    messages,
    setMessages: createSetter(
      () => messages,
      (next) => {
        messages = next;
        context.messages = next;
      },
    ),
    isThinking: streaming.isThinking,
    setIsThinking: createSetter(
      () => streaming.isThinking,
      (next) => {
        streaming = { ...streaming, isThinking: next };
        context.isThinking = next;
      },
    ),
    setStreamingMessageId: createSetter(
      () => streaming.streamingMessageId,
      (next) => {
        streaming = { ...streaming, streamingMessageId: next };
        streamingMessageIdRef.current = next;
      },
    ),
    streamingMessageId: streaming.streamingMessageId,
    streamingMessageIdRef,
    activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs,
    activeTabId,
    setOpenTabs: createSetter(
      () => openTabs,
      (next) => {
        openTabs = next;
        context.openTabs = next;
      },
    ),
    setActiveTabId: createSetter(
      () => activeTabId,
      (next) => {
        activeTabId = next;
        context.activeTabId = next;
      },
    ),
    setActiveTab: noopDispatch(),
    setSettings: noopDispatch(),
    setSelectedModel: noopDispatch(),
    setMediaModelSelection: noopDispatch(),
    updateSettings: () => undefined,
    setPromptModeForConversation: () => undefined,
    setAgentState: noopDispatch(),
    conversationAgentStateRef: ref(new Map()),
    forceAgentStateUpdate: () => undefined,
    setSkills: noopDispatch(),
    setActiveSkill: noopDispatch(),
    setGlobalError: noopDispatch(),
    conversationTokenCountRef: ref(new Map()),
    conversationCompressingRef: ref(new Map()),
    forceUpdate: () => undefined,
    isCurrentConversation: (conversationId?: string) =>
      conversationId === activeConversationIdRef.current,
    updateNonCurrentConversation: (conversationId, updater) => {
      const existingMessages = conversationMessagesRef.current.get(conversationId) ?? [];
      const existingStreaming = conversationStreamingRef.current.get(conversationId) ?? {
        isThinking: false,
        streamingMessageId: null,
        queuedMessageCount: 0,
      };
      const result = updater(existingMessages, existingStreaming);
      conversationMessagesRef.current.set(conversationId, result.messages);
      conversationStreamingRef.current.set(conversationId, result.streaming);
    },
    setConversations: noopDispatch(),
    setActiveConversationId: createSetter(
      () => activeConversationId,
      (next) => {
        activeConversationId = next;
        context.activeConversationId = next;
      },
    ),
    setWorkItemsByConversation: createSetter(
      () => workItems,
      (next) => {
        workItems = next;
      },
    ),
    setProjectFiles: noopDispatch(),
    mentionSearchFilter: '',
    setMentionItems: noopDispatch(),
    setPluginCommands: noopDispatch(),
    setPluginsAvailable: createSetter(
      () => pluginsAvailable,
      (next) => {
        pluginsAvailable = next;
      },
    ),
    setShowOnboarding: noopDispatch(),
  };

  return {
    context,
    activeConversationId: () => activeConversationId,
    activeTabId: () => activeTabId,
    messages: () => messages,
    streaming: () => streaming,
    openTabs: () => openTabs,
    conversationMessages: () => conversationMessagesRef.current,
    conversationStreaming: () => conversationStreamingRef.current,
  };
}

function message(id: string, role: Message['role'], content: string): Message {
  return { id, role, content, timestamp: 1 };
}

function createSetter<T>(read: () => T, write: (next: T) => void): Dispatch<SetStateAction<T>> {
  return (action) => {
    write(typeof action === 'function' ? (action as (previous: T) => T)(read()) : action);
  };
}

function noopDispatch<T>(): Dispatch<SetStateAction<T>> {
  return () => undefined;
}

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}
