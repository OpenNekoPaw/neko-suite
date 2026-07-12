import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentSessionDiagnosticMessage,
  ConversationSummary,
  ExtensionToWebviewMessage,
  OpenTab,
} from '@neko-agent/types';
import type { Message } from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import { conversationHandlers } from '../conversation-handlers';
import { tabHandlers } from '../tab-handlers';
import type {
  HandlerRegistration,
  MessageHandlerContext,
  PendingForegroundConversationActivation,
  StreamingState,
} from '../types';

describe('character role context isolation', () => {
  it('projects creative lifecycle results without coupling them to Tab rendering', () => {
    const harness = createContextHarness({
      conversations: [creativeConversation('active')],
    });

    dispatch(
      conversationHandlers,
      {
        type: 'conversationLifecycleResult',
        conversationId: 'background-1',
        action: 'archive',
        success: true,
        state: 'archived',
        diagnostics: [],
      },
      harness.context,
    );

    expect(harness.conversations()[0]?.creativeAi?.lifecycleState).toBe('archived');
  });

  it('routes conversation diagnostics without replacing global UI state', () => {
    const harness = createContextHarness();

    dispatch(
      conversationHandlers,
      {
        type: 'sessionDiagnostic',
        code: 'stale-tab-state-revision',
        severity: 'error',
        action: 'activate-conversation',
        conversationId: 'conv-background',
        message: 'Background activation was rejected.',
      },
      harness.context,
    );

    expect(harness.globalError()).toBeNull();
    expect(harness.conversationDiagnostics()).toEqual([
      expect.objectContaining({
        conversationId: 'conv-background',
        code: 'stale-tab-state-revision',
      }),
    ]);
  });

  it('ingests activeConversation into the conversation cache without rebinding shared content state', () => {
    const harness = createContextHarness();
    const authoritativeMessage = message('authoritative', 'assistant', 'authoritative snapshot');

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: conversation('conv-a', [authoritativeMessage]),
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-a');
    expect(harness.messages()).toEqual([message('visible-old', 'assistant', 'visible old')]);
    expect(harness.streaming()).toEqual({
      isThinking: true,
      streamingMessageId: 'visible-stream',
      queuedMessageCount: 2,
    });
    expect(harness.conversationMessages().get('conv-a')).toEqual([authoritativeMessage]);
    expect(harness.conversationStreaming().get('conv-a')).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
    });
    expect(harness.forceUpdateCount()).toBe(1);
    expect(harness.flushedConversations()).toEqual([]);
  });

  it('caches a stale activeConversation response without changing active Tab metadata', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-a',
      openTabs: [{ id: 'tab-a', title: 'A', conversationId: 'conv-a' }],
    });
    const backgroundMessage = message('background', 'assistant', 'background snapshot');

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: conversation('conv-b', [backgroundMessage]),
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.activeTabId()).toBe('tab-a');
    expect(harness.openTabs()).toEqual([{ id: 'tab-a', title: 'A', conversationId: 'conv-a' }]);
    expect(harness.conversationMessages().get('conv-b')).toEqual([backgroundMessage]);
    expect(harness.messages()).toEqual([message('visible-old', 'assistant', 'visible old')]);
  });

  it('does not let an ordinary snapshot replace an active character-role Tab', () => {
    const roleTab: OpenTab = {
      id: 'tab-role',
      title: 'Role',
      conversationId: 'role-session',
      kind: 'character-dialogue',
      characterDialogueSession: {
        sessionId: 'role-session',
        entityId: 'character-1',
        displayName: 'Role',
        mode: 'roleplay',
        profile: {
          entityRef: { entityId: 'character-1', entityKind: 'character' },
          displayName: 'Role',
          aliases: [],
          facts: [],
          sparsity: 'thin',
        },
        summary: 'Role',
        startedAt: '2026-01-01T00:00:00.000Z',
        projectRoot: '/workspace',
        status: 'active',
      },
    };
    const harness = createContextHarness({
      activeConversationId: 'role-session',
      activeTabId: roleTab.id,
      openTabs: [roleTab],
    });

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: conversation('conv-a', [message('ordinary', 'assistant', 'ordinary')]),
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('role-session');
    expect(harness.activeTabId()).toBe(roleTab.id);
    expect(harness.openTabs()[0]).toEqual(roleTab);
    expect(harness.conversationMessages().get('conv-a')).toHaveLength(1);
  });

  it('accepts an explicit foreground activation while preserving Tab-owned content state', () => {
    const roleTab: OpenTab = {
      id: 'tab-role',
      title: 'Role',
      conversationId: 'role-session',
      kind: 'embody-character',
    };
    const harness = createContextHarness({
      activeConversationId: 'role-session',
      activeTabId: roleTab.id,
      openTabs: [roleTab],
      pendingForegroundActivation: {
        reason: 'switch-conversation',
        conversationId: 'conv-a',
        activationId: 7,
        tabStateRevision: 3,
      },
    });

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: conversation('conv-a', [message('new', 'assistant', 'new')]),
        activation: { activationId: 7, tabStateRevision: 3 },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.openTabs().some((tab) => tab.conversationId === 'conv-a')).toBe(true);
    expect(harness.completedForegroundActivations()).toEqual(['conv-a']);
    expect(harness.context.tabStateRevisionRef?.current).toBe(3);
    expect(harness.messages()).toEqual([message('visible-old', 'assistant', 'visible old')]);
  });

  it('applies tabState as runtime binding and visibility state only', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-a',
      openTabs: [{ id: 'tab-a', title: 'A', conversationId: 'conv-a' }],
    });
    const nextTabs: OpenTab[] = [
      { id: 'tab-a', title: 'A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'B', conversationId: 'conv-b' },
    ];

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        revision: 2,
        tabState: { openTabs: nextTabs, activeTabId: 'tab-b' },
      },
      harness.context,
    );

    expect(harness.reconciliations()).toEqual([
      {
        bindings: [
          { tabId: 'tab-a', conversationId: 'conv-a' },
          { tabId: 'tab-b', conversationId: 'conv-b' },
        ],
        activeTabId: 'tab-b',
      },
    ]);
    expect(harness.activeTabId()).toBe('tab-b');
    expect(harness.messages()).toEqual([message('visible-old', 'assistant', 'visible old')]);
    expect(harness.streaming()).toEqual({
      isThinking: true,
      streamingMessageId: 'visible-stream',
      queuedMessageCount: 2,
    });
    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.flushedConversations()).toEqual([]);
  });

  it('keeps shared content untouched when the final Tab closes', () => {
    const harness = createContextHarness();

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        revision: 1,
        tabState: { openTabs: [], activeTabId: null },
      },
      harness.context,
    );

    expect(harness.context.isTablessConversationViewRef.current).toBe(true);
    expect(harness.activeConversationId()).toBeNull();
    expect(harness.messages()).toEqual([message('visible-old', 'assistant', 'visible old')]);
    expect(harness.streaming()).toEqual({
      isThinking: true,
      streamingMessageId: 'visible-stream',
      queuedMessageCount: 2,
    });
  });

  it('fails visibly when tabState cannot reconcile Tab render runtimes', () => {
    const harness = createContextHarness();
    harness.context.reconcileTabRenderRuntimes = undefined;

    expect(() =>
      dispatch(
        tabHandlers,
        {
          type: 'tabState',
          revision: 1,
          tabState: {
            openTabs: [{ id: 'tab-a', title: 'A', conversationId: 'conv-a' }],
            activeTabId: 'tab-a',
          },
        },
        harness.context,
      ),
    ).toThrow('Tab state handling requires a Tab render runtime reconciler.');
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
  readonly activeConversationId?: string | null;
  readonly activeTabId?: string | null;
  readonly openTabs?: OpenTab[];
  readonly pendingForegroundActivation?: PendingForegroundConversationActivation | null;
  readonly conversations?: ConversationSummary[];
}

interface TabRuntimeReconciliation {
  readonly bindings: readonly { readonly tabId: string; readonly conversationId: string }[];
  readonly activeTabId: string | null;
}

interface ContextHarness {
  readonly context: MessageHandlerContext;
  activeConversationId(): string | null;
  activeTabId(): string | null;
  messages(): Message[];
  streaming(): StreamingState;
  openTabs(): OpenTab[];
  conversationMessages(): Map<string, Message[]>;
  conversationStreaming(): Map<string, StreamingState>;
  conversations(): ConversationSummary[];
  globalError(): string | null;
  conversationDiagnostics(): AgentSessionDiagnosticMessage[];
  completedForegroundActivations(): string[];
  reconciliations(): readonly TabRuntimeReconciliation[];
  forceUpdateCount(): number;
  flushedConversations(): readonly string[];
}

function createContextHarness(options: ContextHarnessOptions = {}): ContextHarness {
  let activeConversationId: string | null =
    options.activeConversationId === undefined ? 'conv-old' : options.activeConversationId;
  let activeTabId = options.activeTabId ?? null;
  let messages = [message('visible-old', 'assistant', 'visible old')];
  let streaming: StreamingState = {
    isThinking: true,
    streamingMessageId: 'visible-stream',
    queuedMessageCount: 2,
  };
  let openTabs = options.openTabs ?? [];
  let conversations = options.conversations ?? [];
  let globalError: string | null = null;
  let workItems: AgentWorkItemStore = new Map();
  let pluginsAvailable: PluginsAvailable = {};
  let forceUpdateCount = 0;
  const conversationDiagnostics: AgentSessionDiagnosticMessage[] = [];
  const completedForegroundActivations: string[] = [];
  const reconciliations: TabRuntimeReconciliation[] = [];
  const flushedConversations: string[] = [];
  const activeConversationIdRef = ref(activeConversationId);
  const streamingMessageIdRef = ref(streaming.streamingMessageId);
  const conversationMessagesRef = ref(new Map<string, Message[]>());
  const conversationStreamingRef = ref(new Map<string, StreamingState>());
  const pendingForegroundConversationActivationRef = ref(
    options.pendingForegroundActivation ?? null,
  );

  const context = {
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
    setQueuedMessageCount: createSetter(
      () => streaming.queuedMessageCount ?? 0,
      (next) => {
        streaming = { ...streaming, queuedMessageCount: next };
      },
    ),
    setQueuedMessages: createSetter(
      () => streaming.queuedMessages ?? [],
      (next) => {
        streaming = { ...streaming, queuedMessages: next };
      },
    ),
    streamingMessageId: streaming.streamingMessageId,
    queuedMessageCount: streaming.queuedMessageCount,
    queuedMessages: streaming.queuedMessages,
    streamingMessageIdRef,
    activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationRenderCoordinator: new ConversationRenderCoordinator(),
    openTabs,
    activeTabId,
    isTablessConversationViewRef: ref(false),
    pendingForegroundConversationActivationRef,
    tabStateRevisionRef: ref(0),
    timelineRenderScheduler: {
      enqueue: vi.fn(),
      flushConversation: (conversationId: string) => flushedConversations.push(conversationId),
      discardTurn: vi.fn(),
      discardConversation: vi.fn(),
      flushAll: vi.fn(),
      dispose: vi.fn(),
      metrics: () => ({
        scheduledDeliveries: 0,
        immediateDeliveries: 0,
        renderCommits: 0,
        maxPendingDeliveries: 0,
        pendingDeliveries: 0,
        disposed: false,
      }),
    },
    reconcileTabRenderRuntimes: (bindings, nextActiveTabId) => {
      reconciliations.push({ bindings, activeTabId: nextActiveTabId });
    },
    completeForegroundConversationActivation: (conversationId: string) => {
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
    requestConfigSnapshot: vi.fn(),
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
    setGlobalError: createSetter(
      () => globalError,
      (next) => {
        globalError = next;
      },
    ),
    reportConversationDiagnostic: (diagnostic) => conversationDiagnostics.push(diagnostic),
    conversationTokenCountRef: ref(new Map()),
    conversationCompressingRef: ref(new Map()),
    forceUpdate: () => {
      forceUpdateCount += 1;
    },
    isCurrentConversation: (conversationId?: string) =>
      conversationId === activeConversationIdRef.current,
    updateNonCurrentConversation: () => undefined,
    setConversations: createSetter(
      () => conversations,
      (next) => {
        conversations = next;
      },
    ),
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
  } satisfies MessageHandlerContext;

  return {
    context,
    activeConversationId: () => activeConversationId,
    activeTabId: () => activeTabId,
    messages: () => messages,
    streaming: () => streaming,
    openTabs: () => openTabs,
    conversationMessages: () => conversationMessagesRef.current,
    conversationStreaming: () => conversationStreamingRef.current,
    conversations: () => conversations,
    globalError: () => globalError,
    conversationDiagnostics: () => [...conversationDiagnostics],
    completedForegroundActivations: () => completedForegroundActivations,
    reconciliations: () => reconciliations,
    forceUpdateCount: () => forceUpdateCount,
    flushedConversations: () => flushedConversations,
  };
}

function conversation(
  id: string,
  messages: Message[],
): ConversationSummary & { messages: Message[] } {
  return {
    id,
    title: id,
    messageCount: messages.length,
    updatedAt: 1,
    messages,
  };
}

function creativeConversation(lifecycleState: 'active' | 'archived'): ConversationSummary {
  return {
    id: 'background-1',
    title: 'Canvas AI',
    messageCount: 0,
    updatedAt: 10,
    creativeAi: {
      lifecycleState,
      sourcePackage: 'neko-canvas',
      associationKey: 'neko-canvas:document:doc-1',
    },
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
