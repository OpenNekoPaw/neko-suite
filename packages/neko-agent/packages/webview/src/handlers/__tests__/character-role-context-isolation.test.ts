import { createElement, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { cleanup, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  AgentQueuedMessageItem,
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineMessage,
  ConversationSummary,
  ExtensionToWebviewMessage,
  OpenTab,
} from '@neko-agent/types';
import type { Message } from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import { MarkdownRenderer } from '@/components/ChatView/MessageContent/MarkdownRenderer';
import {
  createAgentMarkdownSessionKey,
  createAgentMarkdownSessionRegistry,
} from '@/markdown/agent-markdown-session-registry';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import {
  commitLegacyConversationCache,
  ingestLegacyConversationRenderSnapshot,
} from '@/render-lifecycle/legacy-conversation-render-adapter';
import { conversationHandlers } from '../conversation-handlers';
import { tabHandlers } from '../tab-handlers';
import { timelineHandlers } from '../timeline-handlers';
import type {
  HandlerRegistration,
  MessageHandlerContext,
  PendingForegroundConversationActivation,
  StreamingState,
} from '../types';

describe('character role context isolation', () => {
  it('projects creative lifecycle success into conversation list state', () => {
    const harness = createContextHarness({
      activeConversationId: 'background-1',
      activeTabId: null,
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      openTabs: [],
      conversations: [
        {
          id: 'background-1',
          title: 'Canvas AI',
          messageCount: 0,
          updatedAt: 10,
          creativeAi: {
            lifecycleState: 'active',
            sourcePackage: 'neko-canvas',
            associationKey: 'neko-canvas:document:doc-1',
          },
        },
      ],
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

  it('projects creative lifecycle diagnostics into a visible global error', () => {
    const harness = createContextHarness({
      activeConversationId: 'background-1',
      activeTabId: null,
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      openTabs: [],
    });

    dispatch(
      conversationHandlers,
      {
        type: 'conversationLifecycleResult',
        conversationId: 'background-1',
        action: 'delete',
        success: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'creative-ai-lifecycle-active-runs',
            message: 'Conversation has active creative AI runs.',
          },
        ],
      },
      harness.context,
    );

    expect(harness.globalError()).toBe('Conversation has active creative AI runs.');
  });

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
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-a',
      turnId: 'turn-a',
      messageId: 'assistant-stream',
      deliveryRevision: 0,
      validationState: {
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-a',
        turnId: 'turn-a',
        messageId: 'assistant-stream',
        deliveryRevision: 0,
        completed: false,
        items: new Map(),
      },
      items: [
        {
          conversationId: 'conv-a',
          turnId: 'turn-a',
          messageId: 'assistant-stream',
          itemId: 'text-1',
          sequence: 1,
          itemRevision: 1,
          kind: 'assistant_text',
          status: 'streaming',
          payload: { content: 'partial', format: 'markdown', sourceGeneration: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      completed: false,
      synchronization: 'synchronized',
    };
    const cachedMessage = message('assistant-stream', 'assistant', 'partial');
    const registry = createAgentMarkdownSessionRegistry();
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
    harness.context.markdownSessionRegistry = registry;

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

    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline).toBe(activeTimeline);
    expect(
      registry.getSnapshot(
        createAgentMarkdownSessionKey({
          conversationId: 'conv-a',
          messageId: 'assistant-stream',
          itemId: 'text-1',
        }),
      ),
    ).toMatchObject({ source: 'partial', isFinal: false });
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

  it('finalizes orphaned legacy Markdown streaming blocks when restoring an ordinary tab', () => {
    const orphanedMessage = legacyStreamingMessage('orphaned-ordinary');
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      activeTabId: 'tab-b',
      currentMessages: [message('message-b', 'assistant', 'B 回复')],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      cachedMessages: new Map([['conv-a', [orphanedMessage]]]),
      cachedStreaming: new Map([
        [
          'conv-a',
          {
            isThinking: true,
            streamingMessageId: orphanedMessage.id,
            queuedMessageCount: 0,
          },
        ],
      ]),
      openTabs: [
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ],
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: {
          openTabs: harness.openTabs(),
          activeTabId: 'tab-a',
        },
      },
      harness.context,
    );

    expectRestoredMarkdownDoesNotRequireTimelineSession(harness.messages()[0]);
    expect(harness.messages()[0]).toMatchObject({
      id: orphanedMessage.id,
      isStreaming: false,
      contentBlocks: [
        { id: `block-thinking-${orphanedMessage.id}`, isThinkingComplete: true },
        { id: `block-text-${orphanedMessage.id}`, isStreaming: false },
      ],
    });
    expect(harness.streaming()).toMatchObject({
      streamingMessageId: null,
      isThinking: false,
    });
  });

  it('finalizes orphaned legacy Markdown streaming blocks when restoring a character-role tab', () => {
    const orphanedMessage = legacyStreamingMessage('orphaned-role');
    const roleTab: OpenTab = {
      id: 'tab-role',
      title: 'Embody: 小橘',
      conversationId: 'role-session',
      kind: 'embody-character',
    };
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      activeTabId: 'tab-b',
      currentMessages: [message('message-b', 'assistant', 'B 回复')],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      cachedMessages: new Map([['role-session', [orphanedMessage]]]),
      cachedStreaming: new Map([
        [
          'role-session',
          {
            isThinking: true,
            streamingMessageId: orphanedMessage.id,
            queuedMessageCount: 0,
          },
        ],
      ]),
      openTabs: [{ id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' }, roleTab],
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: {
          openTabs: harness.openTabs(),
          activeTabId: roleTab.id,
        },
      },
      harness.context,
    );

    expectRestoredMarkdownDoesNotRequireTimelineSession(harness.messages()[0]);
    expect(harness.messages()[0]).toMatchObject({
      id: orphanedMessage.id,
      isStreaming: false,
      contentBlocks: [
        { id: `block-thinking-${orphanedMessage.id}`, isThinkingComplete: true },
        { id: `block-text-${orphanedMessage.id}`, isStreaming: false },
      ],
    });
    expect(harness.streaming()).toMatchObject({
      streamingMessageId: null,
      isThinking: false,
    });
  });

  it('releases unavailable Timeline ownership when restoring a tab', () => {
    const unavailableMessage = legacyStreamingMessage('unavailable-message');
    const unavailableTimeline: ActiveTurnTimelineState = {
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-a',
      turnId: 'turn-a',
      messageId: unavailableMessage.id,
      deliveryRevision: 1,
      validationState: {
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-a',
        turnId: 'turn-a',
        messageId: unavailableMessage.id,
        deliveryRevision: 1,
        completed: false,
        items: new Map(),
      },
      items: [],
      completed: false,
      synchronization: 'unavailable',
    };
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      activeTabId: 'tab-b',
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      cachedMessages: new Map([['conv-a', [unavailableMessage]]]),
      cachedStreaming: new Map([
        [
          'conv-a',
          {
            isThinking: true,
            streamingMessageId: unavailableMessage.id,
            activeTurnTimeline: unavailableTimeline,
          },
        ],
      ]),
      openTabs: [
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ],
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: { openTabs: harness.openTabs(), activeTabId: 'tab-a' },
      },
      harness.context,
    );

    expectRestoredMarkdownDoesNotRequireTimelineSession(harness.messages()[0]);
    expect(harness.messages()[0]).toMatchObject({
      id: unavailableMessage.id,
      isStreaming: false,
      contentBlocks: [
        { id: `block-thinking-${unavailableMessage.id}`, isThinkingComplete: true },
        { id: `block-text-${unavailableMessage.id}`, isStreaming: false },
      ],
    });
    expect(harness.streaming()).toMatchObject({
      streamingMessageId: null,
      isThinking: false,
    });
    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline).toBeNull();
  });

  it('does not recover unavailable Timeline ownership from a newer activeConversation snapshot', () => {
    const cachedMessage = legacyStreamingMessage('unavailable-message');
    const persistedMessage = {
      ...cachedMessage,
      content: 'newer authoritative partial',
      contentBlocks: cachedMessage.contentBlocks?.map((block) =>
        block.type === 'text' ? { ...block, content: 'newer authoritative partial' } : block,
      ),
    };
    const unavailableTimeline: ActiveTurnTimelineState = {
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-a',
      turnId: 'turn-a',
      messageId: cachedMessage.id,
      deliveryRevision: 1,
      validationState: {
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-a',
        turnId: 'turn-a',
        messageId: cachedMessage.id,
        deliveryRevision: 1,
        completed: false,
        items: new Map(),
      },
      items: [],
      completed: false,
      synchronization: 'unavailable',
    };
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      activeTabId: 'tab-a',
      currentMessages: [cachedMessage],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: cachedMessage.id,
        activeTurnTimeline: unavailableTimeline,
      },
      cachedMessages: new Map([['conv-a', [cachedMessage]]]),
      cachedStreaming: new Map([
        [
          'conv-a',
          {
            isThinking: true,
            streamingMessageId: cachedMessage.id,
            activeTurnTimeline: unavailableTimeline,
          },
        ],
      ]),
      openTabs: [{ id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' }],
    });

    dispatch(
      conversationHandlers,
      {
        type: 'activeConversation',
        conversation: {
          id: 'conv-a',
          title: 'Chat A',
          messages: [persistedMessage],
        },
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([persistedMessage]);
    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline).not.toBe(
      unavailableTimeline,
    );
  });

  it('preserves canonical Timeline-owned streaming state during tab restoration', () => {
    const canonicalMessage = legacyStreamingMessage('canonical-message');
    const activeTimeline: ActiveTurnTimelineState = {
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-a',
      turnId: 'turn-a',
      messageId: canonicalMessage.id,
      deliveryRevision: 1,
      validationState: {
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-a',
        turnId: 'turn-a',
        messageId: canonicalMessage.id,
        deliveryRevision: 1,
        completed: false,
        items: new Map(),
      },
      items: [],
      completed: false,
      synchronization: 'synchronized',
    };
    const canonicalStreaming: StreamingState = {
      isThinking: true,
      streamingMessageId: canonicalMessage.id,
      activeTurnTimeline: activeTimeline,
    };
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      activeTabId: 'tab-b',
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      cachedMessages: new Map([['conv-a', [canonicalMessage]]]),
      cachedStreaming: new Map([['conv-a', canonicalStreaming]]),
      openTabs: [
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ],
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: { openTabs: harness.openTabs(), activeTabId: 'tab-a' },
      },
      harness.context,
    );

    expect(harness.messages()[0]).toEqual(canonicalMessage);
    expect(harness.streaming()).toMatchObject({
      streamingMessageId: canonicalMessage.id,
      isThinking: true,
    });
    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline).toBe(activeTimeline);
  });

  it('keeps background Timeline commits isolated and restores the latest snapshot on return', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const visibleMessage = message('message-b', 'assistant', 'B remains foreground');
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      activeTabId: 'tab-b',
      currentMessages: [visibleMessage],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      cachedMessages: new Map([
        ['conv-a', []],
        ['conv-b', [visibleMessage]],
      ]),
      cachedStreaming: new Map([
        ['conv-a', { isThinking: false, streamingMessageId: null }],
        ['conv-b', { isThinking: false, streamingMessageId: null }],
      ]),
      openTabs: [
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ],
    });
    harness.context.markdownSessionRegistry = registry;
    harness.context.timelineRenderScheduler = createImmediateTimelineRenderScheduler();

    dispatch(timelineHandlers, timelineMessage('conv-a', 'latest **A** output'), harness.context);

    expect(harness.activeConversationId()).toBe('conv-b');
    expect(harness.messages()).toEqual([visibleMessage]);
    expect(harness.conversationMessages().get('conv-a')?.[0]).toMatchObject({
      id: 'message-conv-a',
      content: 'latest **A** output',
    });
    expect(harness.context.conversationRenderCoordinator?.read('conv-a')).toMatchObject({
      conversationId: 'conv-a',
      visibility: 'background',
      messages: [
        expect.objectContaining({
          id: 'message-conv-a',
          content: 'latest **A** output',
        }),
      ],
    });

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: { openTabs: harness.openTabs(), activeTabId: 'tab-a' },
      },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.context.conversationRenderCoordinator?.foregroundConversationId()).toBe(
      'conv-a',
    );
    expect(harness.messages()[0]).toMatchObject({
      id: 'message-conv-a',
      content: 'latest **A** output',
    });
    expect(harness.conversationMessages().get('conv-b')).toEqual([visibleMessage]);
    expect(
      registry.getSnapshot(
        createAgentMarkdownSessionKey({
          conversationId: 'conv-a',
          messageId: 'message-conv-a',
          itemId: 'text-conv-a',
        }),
      ),
    ).toMatchObject({ source: 'latest **A** output', isFinal: false });
  });

  it('rebuilds missing Markdown sessions before activating a cached Timeline-owned tab', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const canonicalMessage = message('assistant-stream', 'assistant', 'partial **markdown**');
    const activeTimeline: ActiveTurnTimelineState = {
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-a',
      turnId: 'turn-a',
      messageId: canonicalMessage.id,
      deliveryRevision: 1,
      validationState: {
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-a',
        turnId: 'turn-a',
        messageId: canonicalMessage.id,
        deliveryRevision: 1,
        completed: false,
        items: new Map(),
      },
      items: [
        {
          conversationId: 'conv-a',
          turnId: 'turn-a',
          messageId: canonicalMessage.id,
          itemId: 'text-1',
          sequence: 1,
          itemRevision: 3,
          kind: 'assistant_text',
          status: 'streaming',
          payload: {
            content: 'partial **markdown**',
            format: 'markdown',
            sourceGeneration: 1,
          },
          createdAt: 1,
          updatedAt: 3,
        },
      ],
      completed: false,
      synchronization: 'synchronized',
    };
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      activeTabId: 'tab-b',
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null },
      cachedMessages: new Map([['conv-a', [canonicalMessage]]]),
      cachedStreaming: new Map([
        [
          'conv-a',
          {
            isThinking: false,
            streamingMessageId: canonicalMessage.id,
            activeTurnTimeline: activeTimeline,
          },
        ],
      ]),
      openTabs: [
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ],
    });
    harness.context.markdownSessionRegistry = registry;

    dispatch(
      tabHandlers,
      {
        type: 'tabState',
        tabState: { openTabs: harness.openTabs(), activeTabId: 'tab-a' },
      },
      harness.context,
    );

    expect(
      registry.getSnapshot(
        createAgentMarkdownSessionKey({
          conversationId: 'conv-a',
          messageId: canonicalMessage.id,
          itemId: 'text-1',
        }),
      ),
    ).toMatchObject({ source: 'partial **markdown**', isFinal: false });
  });

  it('clears visible streaming and queue state when switching to an uncached ordinary tab', () => {
    const activeTimeline: ActiveTurnTimelineState = {
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-a',
      turnId: 'turn-a',
      messageId: 'stream-a',
      deliveryRevision: 0,
      validationState: {
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-a',
        turnId: 'turn-a',
        messageId: 'stream-a',
        deliveryRevision: 0,
        completed: false,
        items: new Map(),
      },
      items: [],
      completed: false,
      synchronization: 'synchronized',
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

  it('replaces restored ordinary tab prompt cache with authoritative activeConversation messages', () => {
    const promptCache = message(
      'user-prompt',
      'user',
      'Continue from the completed async task result.',
    );
    const ordinaryMessage = message('ordinary-message', 'assistant', '普通 Agent 回复');
    const harness = createContextHarness({
      activeConversationId: null,
      activeTabId: null,
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null, queuedMessageCount: 0 },
      openTabs: [],
      cachedMessages: new Map([['conv-a', [promptCache]]]),
      cachedStreaming: new Map([
        [
          'conv-a',
          {
            isThinking: true,
            streamingMessageId: null,
            queuedMessageCount: 0,
            queuedMessages: [],
          },
        ],
      ]),
      isTablessConversationView: true,
      includeQueueSetters: true,
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

    expect(harness.messages()).toEqual([promptCache]);

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
    expect(harness.conversationMessages().get('conv-a')).toEqual([ordinaryMessage]);
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
  conversations?: ConversationSummary[];
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
  conversations(): ConversationSummary[];
  globalError(): string | null;
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
  let conversations: ConversationSummary[] = options.conversations ?? [];
  let globalError: string | null = null;
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
    conversationRenderCoordinator: new ConversationRenderCoordinator(),
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
    setGlobalError: createSetter(
      () => globalError,
      (next) => {
        globalError = next;
      },
    ),
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
      const coordinator = context.conversationRenderCoordinator;
      if (!coordinator) {
        throw new Error(
          'Background conversation updates require the canonical render coordinator.',
        );
      }
      const snapshot = ingestLegacyConversationRenderSnapshot({
        coordinator,
        conversationId,
        messages: result.messages,
        streaming: result.streaming,
        kind: 'timeline-commit',
      });
      commitLegacyConversationCache({
        snapshot,
        conversationMessagesRef,
        conversationStreamingRef,
      });
    },
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
    conversations: () => conversations,
    globalError: () => globalError,
    pendingForegroundActivation: () => pendingForegroundConversationActivationRef.current,
    completedForegroundActivations: () => completedForegroundActivations,
  };
}

function timelineMessage(conversationId: string, content: string): AgentTurnTimelineMessage {
  const messageId = `message-${conversationId}`;
  const item: AgentTurnTimelineAssistantTextItem = {
    conversationId,
    turnId: `turn-${conversationId}`,
    messageId,
    itemId: `text-${conversationId}`,
    sequence: 1,
    itemRevision: 1,
    kind: 'assistant_text',
    status: 'streaming',
    payload: { content, format: 'markdown', sourceGeneration: 1 },
    createdAt: 1,
    updatedAt: 1,
  };
  return {
    type: 'agentTurnTimeline',
    schemaVersion: 2,
    connectionEpoch: 'epoch-1',
    conversationId,
    turnId: item.turnId,
    messageId,
    batchKind: 'delta',
    deliveryRevision: 1,
    operations: [{ operation: 'append', item }],
  };
}

function createImmediateTimelineRenderScheduler(): NonNullable<
  MessageHandlerContext['timelineRenderScheduler']
> {
  return {
    enqueue(message, commit): void {
      commit([message]);
    },
    flushConversation(): void {},
    discardTurn(): void {},
    discardConversation(): void {},
    flushAll(): void {},
    dispose(): void {},
    metrics: () => ({
      scheduledDeliveries: 0,
      immediateDeliveries: 1,
      renderCommits: 1,
      maxPendingDeliveries: 0,
      pendingDeliveries: 0,
      disposed: false,
    }),
  };
}

function message(id: string, role: Message['role'], content: string): Message {
  return { id, role, content, timestamp: 1 };
}

function legacyStreamingMessage(id: string): Message {
  return {
    id,
    role: 'assistant',
    content: '仍在流式输出',
    timestamp: 1,
    isStreaming: true,
    contentBlocks: [
      {
        id: `block-thinking-${id}`,
        type: 'thinking',
        timestamp: 1,
        thinking: '思考中',
        isThinkingComplete: false,
      },
      {
        id: `block-text-${id}`,
        type: 'text',
        timestamp: 2,
        content: '| A | B |\n| - | - |\n| 1 | 2 |',
        isStreaming: true,
      },
    ],
  };
}

function expectRestoredMarkdownDoesNotRequireTimelineSession(message: Message | undefined): void {
  const textBlock = message?.contentBlocks?.find((block) => block.type === 'text');
  if (!message || !textBlock?.content) {
    throw new Error('Expected restored text content block.');
  }
  const content = textBlock.content;

  expect(() =>
    render(
      createElement(MarkdownRenderer, {
        sessionKey: `${message.id}:${textBlock.id}`,
        content,
        isStreaming: textBlock.isStreaming,
      }),
    ),
  ).not.toThrow();
  cleanup();
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
