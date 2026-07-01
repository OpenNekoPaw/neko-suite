import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it } from 'vitest';
import type {
  EmbodyCharacterSessionProjection,
  ExtensionToWebviewMessage,
  OpenTab,
} from '@neko-agent/types';
import type { Message } from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import { embodyCharacterSessionHandlers } from '../embody-character-session-handlers';
import type { HandlerRegistration, MessageHandlerContext, StreamingState } from '../types';

describe('Embody Character session handlers', () => {
  it('activates Embody Character tabs as isolated feedback sessions', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });
    const session = createEmbodyCharacterSessionProjection();
    const tab: OpenTab = {
      id: 'tab-embody',
      title: 'Embody: 小橘',
      conversationId: session.sessionId,
      kind: 'embody-character',
      embodyCharacterSession: session,
    };

    dispatch(
      embodyCharacterSessionHandlers,
      { type: 'embodyCharacterSessionStarted', tab, session },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('embody-session-1');
    expect(harness.context.activeConversationIdRef.current).toBe('embody-session-1');
    expect(harness.messages()).toEqual([]);
    expect(harness.streaming()).toEqual({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
    });
    expect(harness.context.conversationMessagesRef.current.get('conv-a')).toEqual([
      { id: 'old', role: 'assistant', content: 'old', timestamp: 1 },
    ]);
    expect(harness.context.conversationStreamingRef.current.get('conv-a')).toEqual({
      isThinking: true,
      streamingMessageId: 'old-stream',
      queuedMessageCount: 0,
      queuedMessages: [],
    });
    expect(harness.openTabs()).toEqual([tab]);
    expect(harness.activeTabId()).toBe('tab-embody');
  });

  it('marks exited Embody Character tabs without removing transcript cache', () => {
    const session = createEmbodyCharacterSessionProjection();
    const harness = createContextHarness({
      activeConversationId: session.sessionId,
      openTabs: [
        {
          id: 'tab-embody',
          title: 'Embody: 小橘',
          conversationId: session.sessionId,
          kind: 'embody-character',
          embodyCharacterSession: session,
        },
      ],
    });

    dispatch(
      embodyCharacterSessionHandlers,
      { type: 'embodyCharacterSessionExited', sessionId: session.sessionId },
      harness.context,
    );

    expect(harness.openTabs()[0]?.embodyCharacterSession?.status).toBe('exited');
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

function createEmbodyCharacterSessionProjection(): EmbodyCharacterSessionProjection {
  return {
    sessionId: 'embody-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
    profile: {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      displayName: '小橘',
      aliases: ['Xiaoju'],
      facts: [
        {
          key: 'identity.name',
          value: '小橘',
          source: 'registry',
          authority: 'confirmed',
        },
      ],
      sparsity: 'thin',
    },
    source: 'neko-story',
    projectRoot: '/workspace/project-a',
    scopeSummary: ['project: current project'],
    summary: 'protagonist',
    startedAt: '2026-06-02T00:00:00.000Z',
    status: 'active',
  };
}

interface ContextHarnessOptions {
  activeConversationId: string;
  openTabs?: OpenTab[];
}

interface ContextHarness {
  context: MessageHandlerContext;
  activeConversationId(): string | null;
  activeTabId(): string | null;
  messages(): Message[];
  openTabs(): OpenTab[];
  streaming(): StreamingState;
}

function createContextHarness(options: ContextHarnessOptions): ContextHarness {
  let activeConversationId: string | null = options.activeConversationId;
  let activeTabId: string | null = options.openTabs?.[0]?.id ?? null;
  let messages: Message[] = [{ id: 'old', role: 'assistant', content: 'old', timestamp: 1 }];
  let openTabs: OpenTab[] = options.openTabs ?? [];
  let streaming: StreamingState = {
    isThinking: true,
    streamingMessageId: 'old-stream',
    queuedMessageCount: 0,
  };
  const activeConversationIdRef = ref<string | null>(options.activeConversationId);
  const streamingMessageIdRef = ref<string | null>(streaming.streamingMessageId);
  const isTablessConversationViewRef = ref(false);
  const conversationMessagesRef = ref(new Map<string, Message[]>());
  const conversationStreamingRef = ref(new Map<string, StreamingState>());
  let workItems: AgentWorkItemStore = new Map();
  let pluginsAvailable: PluginsAvailable = {};

  const context = {
    setMessages: createSetter(
      () => messages,
      (next) => {
        messages = next;
        context.messages = next;
      },
    ),
    messages,
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
    queuedMessageCount: streaming.queuedMessageCount,
    streamingMessageId: streaming.streamingMessageId,
    streamingMessageIdRef,
    activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs,
    activeTabId,
    isTablessConversationViewRef,
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
    updateNonCurrentConversation: () => undefined,
    setConversations: noopDispatch(),
    setActiveConversationId: createSetter(
      () => activeConversationId,
      (next) => {
        activeConversationId = next;
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
    openTabs: () => openTabs,
    streaming: () => streaming,
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
