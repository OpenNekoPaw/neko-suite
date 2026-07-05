import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it } from 'vitest';
import type { AgentQueuedMessageItem, ExtensionToWebviewMessage, OpenTab } from '@neko-agent/types';
import type { Message } from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import { conversationHandlers } from '../conversation-handlers';
import { tabHandlers } from '../tab-handlers';
import type {
  HandlerRegistration,
  MessageHandlerContext,
  PendingForegroundConversationActivation,
  StreamingState,
} from '../types';

describe('character role context isolation', () => {
  it('keeps active conversation refs aligned for ordinary activeConversation updates', () => {
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');
    const harness = createContextHarness({
      activeConversationId: 'conv-old',
      activeTabId: 'tab-a',
      currentMessages: [],
      currentStreaming: { isThinking: true, streamingMessageId: 'old-stream' },
      openTabs: [{ id: 'tab-a', title: 'Ordinary chat', conversationId: 'conv-a' }],
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

  it('synchronizes foreground activeConversation messages and queue state into the session cache', () => {
    const staleMessage = message('stale-message', 'assistant', '旧缓存');
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');
    const queuedMessage = queuedMessageItem('queued-stale', 'conv-a');
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-a',
      currentMessages: [staleMessage],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'stale-stream',
        queuedMessageCount: 1,
        queuedMessages: [queuedMessage],
      },
      openTabs: [{ id: 'tab-a', title: 'Ordinary chat', conversationId: 'conv-a' }],
      cachedMessages: new Map([['conv-a', [staleMessage]]]),
      includeQueueSetters: true,
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

    expect(harness.messages()).toEqual([ordinaryMessage]);
    expect(harness.streaming()).toEqual({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
    expect(harness.conversationMessages().get('conv-a')).toEqual([ordinaryMessage]);
    expect(harness.conversationStreaming().get('conv-a')).toEqual({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
  });

  it('keeps foreground activeConversation active timeline in the session cache', () => {
    const activeTimeline: ActiveTurnTimelineState = {
      conversationId: 'conv-a',
      turnId: 'turn-a',
      messageId: 'assistant-stream',
      items: [],
      completed: false,
    };
    const cachedMessage = message('assistant-stream', 'assistant', 'partial');
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-a',
      currentMessages: [cachedMessage],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-stream',
        queuedMessageCount: 0,
        queuedMessages: [],
        activeTurnTimeline: activeTimeline,
      },
      openTabs: [{ id: 'tab-a', title: 'Ordinary chat', conversationId: 'conv-a' }],
      cachedMessages: new Map([['conv-a', [cachedMessage]]]),
      cachedStreaming: new Map([
        [
          'conv-a',
          {
            isThinking: true,
            streamingMessageId: 'assistant-stream',
            queuedMessageCount: 0,
            queuedMessages: [],
            activeTurnTimeline: activeTimeline,
          },
        ],
      ]),
      includeQueueSetters: true,
    });

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: {
          id: 'conv-a',
          title: 'Ordinary chat',
          messages: [message('persisted-message', 'assistant', 'persisted')],
        },
      },
      harness.context,
    );

    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline).toBe(
      activeTimeline,
    );
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

  it('activates a foreground new conversation response even while a role session tab is active', () => {
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
      cachedMessages: new Map([['role-session-1', roleMessages]]),
      pendingForegroundActivation: {
        reason: 'new-conversation',
        previousConversationIds: ['role-session-1', 'conv-old'],
      },
    });
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: {
          id: 'conv-new',
          title: 'New Chat',
          messages: [ordinaryMessage],
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-new');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-new');
    expect(harness.activeTabId()).not.toBe(roleTab.id);
    expect(harness.messages()).toEqual([ordinaryMessage]);
    expect(harness.conversationMessages().get('role-session-1')).toEqual(roleMessages);
    expect(harness.pendingForegroundActivation()).toBeNull();
    expect(harness.completedForegroundActivations()).toEqual(['conv-new']);
  });

  it('caches stale activeConversation responses while a different foreground switch is pending', () => {
    const messageA = message('message-a', 'assistant', 'A 回复');
    const messageB = message('message-b', 'assistant', 'B 回复');
    const messageC = message('message-c', 'assistant', 'C 回复');
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-c',
      currentMessages: [messageA],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      openTabs: [
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
        { id: 'tab-c', title: 'Chat C', conversationId: 'conv-c' },
      ],
      pendingForegroundActivation: {
        reason: 'switch-conversation',
        conversationId: 'conv-c',
      },
    });

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: {
          id: 'conv-b',
          title: 'Chat B',
          messages: [messageB],
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-a');
    expect(harness.activeTabId()).toBe('tab-c');
    expect(harness.messages()).toEqual([messageA]);
    expect(harness.conversationMessages().get('conv-b')).toEqual([messageB]);
    expect(harness.pendingForegroundActivation()).toEqual({
      reason: 'switch-conversation',
      conversationId: 'conv-c',
    });

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: {
          id: 'conv-c',
          title: 'Chat C',
          messages: [messageC],
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-c');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-c');
    expect(harness.activeTabId()).toBe('tab-c');
    expect(harness.messages()).toEqual([messageC]);
    expect(harness.pendingForegroundActivation()).toBeNull();
    expect(harness.completedForegroundActivations()).toEqual(['conv-c']);
  });

  it('does not let a late ordinary activeConversation response override the active tab', () => {
    const messageB = message('message-b', 'assistant', 'B 回复');
    const messageC = message('message-c', 'assistant', 'C 回复');
    const harness = createContextHarness({
      activeConversationId: 'conv-c',
      activeTabId: 'tab-c',
      currentMessages: [messageC],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      openTabs: [
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
        { id: 'tab-c', title: 'Chat C', conversationId: 'conv-c' },
      ],
    });

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: {
          id: 'conv-b',
          title: 'Chat B',
          messages: [messageB],
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-c');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-c');
    expect(harness.activeTabId()).toBe('tab-c');
    expect(harness.messages()).toEqual([messageC]);
    expect(harness.conversationMessages().get('conv-b')).toEqual([messageB]);
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
      queuedMessages: [],
    });
  });

  it('clears visible streaming and queue state when switching to an uncached ordinary tab', () => {
    const activeTimeline: ActiveTurnTimelineState = {
      conversationId: 'conv-a',
      turnId: 'turn-a',
      messageId: 'stream-a',
      items: [],
      completed: false,
    };
    const messageA = message('message-a', 'assistant', 'A 回复');
    const queuedA = queuedMessageItem('queued-a', 'conv-a');
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-a',
      currentMessages: [messageA],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'stream-a',
        queuedMessageCount: 1,
        queuedMessages: [queuedA],
        activeTurnTimeline: activeTimeline,
      },
      cachedMessages: new Map([['conv-a', [messageA]]]),
      cachedStreaming: new Map([
        [
          'conv-a',
          {
            isThinking: true,
            streamingMessageId: 'stream-a',
            queuedMessageCount: 1,
            queuedMessages: [queuedA],
            activeTurnTimeline: activeTimeline,
          },
        ],
      ]),
      openTabs: [
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ],
      includeQueueSetters: true,
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: {
          openTabs: [
            { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
            { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
          ],
          activeTabId: 'tab-b',
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-b');
    expect(harness.messages()).toEqual([]);
    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
    expect(harness.conversationStreaming().get('conv-b')).toEqual({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
  });

  it('restores ordinary tab messages when activeConversation arrives before restored tabState', () => {
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');
    const harness = createContextHarness({
      activeConversationId: null,
      activeTabId: null,
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null, queuedMessageCount: 0 },
      openTabs: [],
      isTablessConversationView: true,
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

    expect(harness.activeConversationId()).toBeNull();
    expect(harness.messages()).toEqual([]);
    expect(harness.conversationMessages().get('conv-a')).toEqual([ordinaryMessage]);

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: {
          openTabs: [{ id: 'tab-conv-a', title: 'Ordinary chat', conversationId: 'conv-a' }],
          activeTabId: 'tab-conv-a',
        },
      },
      harness.context,
    );

    expect(harness.context.isTablessConversationViewRef.current).toBe(false);
    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-a');
    expect(harness.activeTabId()).toBe('tab-conv-a');
    expect(harness.messages()).toEqual([ordinaryMessage]);
    expect(harness.streaming()).toEqual({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
    });
  });

  it('applies ordinary activeConversation after restored tabState leaves tabless mode', () => {
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');
    const harness = createContextHarness({
      activeConversationId: null,
      activeTabId: null,
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null, queuedMessageCount: 0 },
      openTabs: [],
      isTablessConversationView: true,
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: {
          openTabs: [{ id: 'tab-conv-a', title: 'Ordinary chat', conversationId: 'conv-a' }],
          activeTabId: 'tab-conv-a',
        },
      },
      harness.context,
    );

    expect(harness.context.isTablessConversationViewRef.current).toBe(false);
    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-a');
    expect(harness.messages()).toEqual([]);

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
    expect(harness.activeTabId()).toBe('tab-conv-a');
    expect(harness.messages()).toEqual([ordinaryMessage]);
  });

  it('keeps an explicitly empty tab state from restoring the closed active conversation', () => {
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-conv-a',
      currentMessages: [ordinaryMessage],
      currentStreaming: { isThinking: true, streamingMessageId: 'stream-a', queuedMessageCount: 0 },
      openTabs: [{ id: 'tab-conv-a', title: 'Ordinary chat', conversationId: 'conv-a' }],
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: {
          openTabs: [],
          activeTabId: null,
        },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBeNull();
    expect(harness.activeTabId()).toBeNull();
    expect(harness.messages()).toEqual([]);
    expect(harness.openTabs()).toEqual([]);
    expect(harness.context.isTablessConversationViewRef.current).toBe(true);

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

    expect(harness.activeConversationId()).toBeNull();
    expect(harness.activeTabId()).toBeNull();
    expect(harness.messages()).toEqual([]);
    expect(harness.openTabs()).toEqual([]);
    expect(harness.conversationMessages().get('conv-a')).toEqual([ordinaryMessage]);
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
  activeConversationId: string | null;
  activeTabId: string | null;
  currentMessages: Message[];
  currentStreaming: StreamingState;
  openTabs: OpenTab[];
  cachedMessages?: Map<string, Message[]>;
  cachedStreaming?: Map<string, StreamingState>;
  pendingForegroundActivation?: PendingForegroundConversationActivation | null;
  isTablessConversationView?: boolean;
  includeQueueSetters?: boolean;
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
  pendingForegroundActivation(): PendingForegroundConversationActivation | null;
  completedForegroundActivations(): string[];
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
  const isTablessConversationViewRef = ref(options.isTablessConversationView ?? false);
  const conversationMessagesRef = ref(new Map<string, Message[]>(options.cachedMessages ?? []));
  const conversationStreamingRef = ref(
    new Map<string, StreamingState>(options.cachedStreaming ?? []),
  );
  const pendingForegroundConversationActivationRef = ref(
    options.pendingForegroundActivation ?? null,
  );
  const completedForegroundActivations: string[] = [];

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
    queuedMessageCount: streaming.queuedMessageCount,
    queuedMessages: streaming.queuedMessages,
    setQueuedMessageCount: options.includeQueueSetters
      ? createSetter(
          () => streaming.queuedMessageCount ?? 0,
          (next) => {
            streaming = { ...streaming, queuedMessageCount: next };
            context.queuedMessageCount = next;
          },
        )
      : undefined,
    setQueuedMessages: options.includeQueueSetters
      ? createSetter(
          () => streaming.queuedMessages ?? [],
          (next) => {
            streaming = { ...streaming, queuedMessages: next };
            context.queuedMessages = next;
          },
        )
      : undefined,
    streamingMessageIdRef,
    activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs,
    activeTabId,
    isTablessConversationViewRef,
    pendingForegroundConversationActivationRef,
    completeForegroundConversationActivation: (conversationId) => {
      const pending = pendingForegroundConversationActivationRef.current;
      if (!pending) return;
      if (
        (pending.reason === 'new-conversation' &&
          pending.previousConversationIds.includes(conversationId)) ||
        (pending.reason === 'switch-conversation' && pending.conversationId !== conversationId)
      ) {
        return;
      }
      completedForegroundActivations.push(conversationId);
      pendingForegroundConversationActivationRef.current = null;
    },
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
    setActivationProgressByConversation: noopDispatch(),
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
    pendingForegroundActivation: () => pendingForegroundConversationActivationRef.current,
    completedForegroundActivations: () => completedForegroundActivations,
  };
}

function message(id: string, role: Message['role'], content: string): Message {
  return { id, role, content, timestamp: 1 };
}

function queuedMessageItem(id: string, conversationId: string): AgentQueuedMessageItem {
  return {
    id,
    conversationId,
    content: 'queued',
    createdAt: 1,
    source: 'composer',
  };
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
