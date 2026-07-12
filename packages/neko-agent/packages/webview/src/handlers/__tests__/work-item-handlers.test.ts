import {
  createAgentMarkdownSessionKey,
  createAgentMarkdownSessionRegistry,
  getAgentMarkdownSessionRegistry,
} from '@/markdown/agent-markdown-session-registry';
import { cleanup, render } from '@testing-library/react';
import { createElement, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentBackgroundTask,
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineMediaItem,
  AgentTurnTimelineItem,
  AgentTurnTimelineMessage,
  AgentMediaTaskView,
  AgentQueuedMessageItem,
  ExtensionToWebviewMessage,
  ContentBlock,
  Message,
  SubAgentWorkItemEvent,
  ToolCall,
} from '@neko-agent/types';
import type { ChildRunScope, TaskRunScope } from '@neko/shared';
import {
  projectBackgroundTaskToWorkItem,
  projectMediaTaskToWorkItem,
  projectSubAgentEventToWorkItem,
} from '@/presenters/work-item-projection-presenter';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { MentionItem } from '@/components/ChatView/InputArea/types';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import { AgentHostMessages } from '@/messages';
import { configHandlers } from '../config-handlers';
import { conversationHandlers } from '../conversation-handlers';
import { mediaHandlers } from '../media-handlers';
import { subAgentHandlers } from '../subagent-handlers';
import { streamingHandlers } from '../streaming-handlers';
import { taskHandlers } from '../task-handlers';
import { timelineHandlers } from '../timeline-handlers';
import { createTimelineRenderCommitScheduler } from '../timeline-render-commit-scheduler';
import { MarkdownRenderer } from '@/components/ChatView/MessageContent/MarkdownRenderer';
import { toolHandlers } from '../tool-handlers';
import type { HandlerRegistration, MessageHandlerContext, StreamingState } from '../types';
import { projectMarkdownResourceRendering } from '@/presenters/markdown-resource-rendering-presenter';
import { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import {
  commitConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from '@/render-lifecycle/conversation-render-state-adapter';

describe('work item message handlers', () => {
  it('stores plugin availability for TaskCard send-to menus', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      configHandlers,
      {
        type: 'pluginsAvailable',
        plugins: { canvas: true, cut: false, sketch: true },
      },
      harness.context,
    );

    expect(harness.pluginsAvailable()).toEqual({ canvas: true, cut: false, sketch: true });
  });

  it('ignores stale project file mention results for older @ filters', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      mentionSearchFilter: 'png',
    });

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        conversationId: 'conv-a',
        filter: 'p',
        files: [{ path: 'assets/old-preview.png', name: 'old-preview.png', type: 'file' }],
      },
      harness.context,
    );
    expect(harness.mentionItems()).toEqual([]);

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        conversationId: 'conv-a',
        filter: 'png',
        files: [{ path: 'assets/current.png', name: 'current.png', type: 'file' }],
      },
      harness.context,
    );

    expect(harness.mentionItems()).toEqual([
      expect.objectContaining({
        id: 'file:assets/current.png',
        filePath: 'assets/current.png',
      }),
    ]);
  });

  it('accepts entry roleplay search results without an active conversation scope', () => {
    const harness = createContextHarness({
      activeConversationId: null,
      mentionSearchFilter: '',
    });

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        filter: '',
        purpose: 'roleplay',
        mentionExtras: [
          {
            type: 'entity',
            id: 'char-xiaoju',
            label: '小橘',
            summary: 'Character: 小橘',
            entityType: 'character',
          },
        ],
      },
      harness.context,
    );

    expect(harness.mentionItems()).toEqual([
      expect.objectContaining({
        id: 'entity:char-xiaoju',
        label: '小橘',
        entityType: 'character',
      }),
    ]);
  });

  it('accepts entry mention search results without opening a conversation scope', () => {
    const harness = createContextHarness({
      activeConversationId: null,
      mentionSearchFilter: 'hero',
    });

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        filter: 'hero',
        purpose: 'entry',
        files: [{ path: 'assets/hero.png', name: 'hero.png', type: 'file', mediaType: 'image' }],
      },
      harness.context,
    );

    expect(harness.mentionItems()).toEqual([
      expect.objectContaining({
        id: 'file:assets/hero.png',
        label: 'hero.png',
        filePath: 'assets/hero.png',
      }),
    ]);
    expect(harness.context.activeConversationIdRef.current).toBeNull();
  });

  it('rejects ordinary project file results without an active conversation scope', () => {
    const harness = createContextHarness({
      activeConversationId: null,
      mentionSearchFilter: '',
    });

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        filter: '',
        files: [{ path: 'assets/current.png', name: 'current.png', type: 'file' }],
      },
      harness.context,
    );

    expect(harness.mentionItems()).toEqual([]);
  });

  it('merges task updates by conversation instead of replacing the global store', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      taskHandlers,
      {
        type: 'tasksUpdated',
        conversationId: 'conv-a',
        workItems: [createTaskWorkItem('conv-a', createBackgroundTask('task-a', 'Generate A'))],
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'tasksUpdated',
        conversationId: 'conv-b',
        workItems: [
          createTaskWorkItem('conv-b', createBackgroundTask('task-b', 'Generate B', 'conv-b')),
        ],
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'taskUpdated',
        conversationId: 'conv-a',
        workItem: createTaskWorkItem('conv-a', {
          ...createBackgroundTask('task-a', 'Generate A'),
          status: 'completed',
          progress: 100,
        }),
      },
      harness.context,
    );

    expect(findWorkItem(harness.workItems(), 'conv-a', 'task-a')).toMatchObject({
      conversationId: 'conv-a',
      status: 'completed',
      progress: 100,
    });
    expect(findWorkItem(harness.workItems(), 'conv-b', 'task-b')).toMatchObject({
      conversationId: 'conv-b',
      status: 'queued',
    });
  });

  it('preserves task parent links when progress updates omit linkage fields', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      taskHandlers,
      {
        type: 'taskCreated',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        toolCallId: 'tool-a',
        workItem: createTaskWorkItem('conv-a', createBackgroundTask('task-a', 'Generate A'), {
          parentMessageId: 'msg-a',
          parentToolCallId: 'tool-a',
        }),
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'taskUpdated',
        conversationId: 'conv-a',
        workItem: createTaskWorkItem('conv-a', {
          ...createBackgroundTask('task-a', 'Generate A'),
          status: 'processing',
          progress: 50,
        }),
      },
      harness.context,
    );

    expect(findWorkItem(harness.workItems(), 'conv-a', 'task-a')).toMatchObject({
      status: 'processing',
      progress: 50,
      parentMessageId: 'msg-a',
      parentToolCallId: 'tool-a',
    });
  });

  it('reconciles task snapshots without removing media, subagent, or linked work items', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      taskHandlers,
      {
        type: 'tasksUpdated',
        conversationId: 'conv-a',
        workItems: [
          createTaskWorkItem('conv-a', createBackgroundTask('stale-task', 'Stale snapshot task')),
          createTaskWorkItem('conv-a', createBackgroundTask('live-task', 'Live snapshot task')),
        ],
      },
      harness.context,
    );
    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        workItem: createMediaWorkItem('conv-a', 'media-task'),
      },
      harness.context,
    );
    const subAgentEvent = {
      type: 'started',
      scope: subAgentScope('conv-a', 'parent-a', 'subagent-task'),
      subAgentId: 'subagent-task',
      parentAgentId: 'parent-a',
      conversationId: 'conv-a',
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    } satisfies SubAgentWorkItemEvent;

    dispatch(
      subAgentHandlers,
      {
        type: 'subagentEvent',
        conversationId: 'conv-a',
        event: subAgentEvent,
        workItem: projectSubAgentEventToWorkItem(subAgentEvent),
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'taskCreated',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        toolCallId: 'tool-a',
        workItem: createTaskWorkItem(
          'conv-a',
          createBackgroundTask('linked-task', 'Linked tool task'),
          { parentMessageId: 'msg-a', parentToolCallId: 'tool-a' },
        ),
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'tasksUpdated',
        conversationId: 'conv-a',
        workItems: [
          createTaskWorkItem('conv-a', {
            ...createBackgroundTask('live-task', 'Live snapshot task'),
            status: 'processing',
            progress: 50,
          }),
        ],
      },
      harness.context,
    );

    expect(findWorkItem(harness.workItems(), 'conv-a', 'stale-task')).toBeUndefined();
    expect(findWorkItem(harness.workItems(), 'conv-a', 'live-task')).toMatchObject({
      kind: 'tool-background-task',
      status: 'processing',
      progress: 50,
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'media-task')).toMatchObject({
      kind: 'media-task',
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'subagent-task')).toMatchObject({
      kind: 'subagent',
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'linked-task')).toMatchObject({
      kind: 'tool-background-task',
      parentMessageId: 'msg-a',
      parentToolCallId: 'tool-a',
    });
  });

  it('routes media task creation to the owning non-current conversation', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      nonCurrentMessages: new Map([['conv-b', []]]),
      currentStreaming: { isThinking: true, streamingMessageId: 'stream-a', queuedMessageCount: 0 },
      nonCurrentStreaming: new Map([
        ['conv-b', { isThinking: true, streamingMessageId: 'stream-b', queuedMessageCount: 0 }],
      ]),
    });

    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-b',
        workItem: createMediaWorkItem('conv-b', 'media-b'),
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([]);
    expect(harness.conversationMessages().get('conv-b')).toMatchObject([
      {
        id: 'media-task-media-b',
        workItemIds: ['media-b'],
      },
    ]);
    expect(harness.streaming().isThinking).toBe(true);
    expect(harness.conversationStreaming().get('conv-b')).toEqual({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
    expect(findWorkItem(harness.workItems(), 'conv-b', 'media-b')).toMatchObject({
      kind: 'media-task',
      conversationId: 'conv-b',
    });
    expect(harness.workItems().get('conv-a')).toBeUndefined();
  });

  it('keeps direct media turns running until the terminal streamComplete arrives', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null, queuedMessageCount: 0 },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'thinking',
        conversationId: 'conv-a',
      },
      harness.context,
    );
    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        parentScope: 'turn',
        workItem: createMediaWorkItem('conv-a', 'media-a'),
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: true,
      streamingMessageId: null,
    });
    expect(harness.messages()).toEqual([expect.objectContaining({ workItemIds: ['media-a'] })]);

    dispatch(
      streamingHandlers,
      {
        type: 'streamComplete',
        conversationId: 'conv-a',
        messageId: 'media-turn:media-a',
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
    });
  });

  it('clears direct media turn running state from terminal progress events', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null, queuedMessageCount: 0 },
    });

    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        parentScope: 'turn',
        workItem: createMediaWorkItem('conv-a', 'media-a'),
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: true,
      streamingMessageId: null,
    });

    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskProgress',
        conversationId: 'conv-a',
        parentScope: 'turn',
        workItem: createMediaWorkItem('conv-a', 'media-a', { status: 'completed' }),
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
    });
  });

  it('commits one Timeline delivery batch through one conversation projection', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a', currentMessages: [] });
    const setMessages = vi.spyOn(harness.context, 'setMessages');

    dispatch(
      timelineHandlers,
      timelineMessage([
        textTimelineItem('text-before', 1, 'Before.'),
        {
          conversationId: 'conv-a',
          turnId: 'turn-msg-a',
          messageId: 'msg-a',
          itemId: 'tool-tool-a',
          sequence: 2,
          itemRevision: 1,
          kind: 'tool_call',
          status: 'pending',
          payload: { toolCall: { id: 'tool-a', name: 'ReadDocument', arguments: {} } },
          createdAt: 2,
          updatedAt: 2,
        },
        textTimelineItem('text-after', 3, ' After.'),
      ]),
      harness.context,
    );

    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(harness.context.markdownSessionRegistry?.metrics()).toMatchObject({
      activeSessions: 2,
      createdSessions: 2,
      renderRevisions: 2,
    });
    expect(harness.messages()[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'text-before',
      'tool-tool-a',
      'text-after',
    ]);
  });

  it('commits Markdown source before exposing projected conversation state and publishes afterward', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a', currentMessages: [] });
    const registry = harness.context.markdownSessionRegistry;
    if (!registry) throw new Error('Timeline handler test requires a Markdown session registry.');
    const key = createAgentMarkdownSessionKey({
      conversationId: 'conv-a',
      messageId: 'msg-a',
      itemId: 'text-1',
    });

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-1', 1, 'a')]),
      harness.context,
    );

    const phases: Array<{
      readonly phase: 'conversation-commit' | 'markdown-publish';
      readonly markdownSource: string | undefined;
      readonly conversationSource: string | undefined;
    }> = [];
    const originalSetMessages = harness.context.setMessages;
    harness.context.setMessages = (update) => {
      const nextMessages = typeof update === 'function' ? update(harness.messages()) : update;
      phases.push({
        phase: 'conversation-commit',
        markdownSource: registry.getSnapshot(key)?.source,
        conversationSource: nextMessages[0]?.content,
      });
      originalSetMessages(nextMessages);
    };
    const unsubscribe = registry.subscribe(key, () => {
      phases.push({
        phase: 'markdown-publish',
        markdownSource: registry.getSnapshot(key)?.source,
        conversationSource: harness.messages()[0]?.content,
      });
    });

    dispatch(
      timelineHandlers,
      timelineMessage([{ ...textTimelineItem('text-1', 1, 'b'), itemRevision: 2000 }], 2),
      harness.context,
    );
    unsubscribe();

    expect(phases).toEqual([
      { phase: 'conversation-commit', markdownSource: 'ab', conversationSource: 'ab' },
      { phase: 'markdown-publish', markdownSource: 'ab', conversationSource: 'ab' },
    ]);
  });

  it('flushes a pending Timeline text delivery before a compatibility streamText message renders', () => {
    const frameCallbacks: Array<() => void> = [];
    const scheduler = createTimelineRenderCommitScheduler({
      request(callback) {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
      cancel() {},
    });
    const registry = getAgentMarkdownSessionRegistry();
    registry.disposeAll();
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      timelineRenderScheduler: scheduler,
      markdownSessionRegistry: registry,
    });

    try {
      dispatch(
        timelineHandlers,
        timelineMessage([textTimelineItem('text-1', 1, 'Timeline text')]),
        harness.context,
      );
      expect(scheduler.metrics().pendingDeliveries).toBe(1);

      dispatch(
        streamingHandlers,
        {
          type: 'streamText',
          conversationId: 'conv-a',
          messageId: 'msg-a',
          content: 'Timeline text',
        },
        harness.context,
      );

      expect(scheduler.metrics().pendingDeliveries).toBe(0);
      const block = harness.messages()[0]?.contentBlocks?.[0];
      if (!block || block.type !== 'text') {
        throw new Error('Expected Timeline-owned streaming text block.');
      }
      const timelineItemId = block.id;
      if (timelineItemId !== 'text-1') {
        throw new Error(`Expected Timeline item text-1, received ${String(timelineItemId)}.`);
      }
      const timelineContent = block.content;
      if (timelineContent !== 'Timeline text') {
        throw new Error(`Expected canonical Timeline text, received ${String(timelineContent)}.`);
      }
      expect(() =>
        render(
          createElement(MarkdownRenderer, {
            content: timelineContent,
            isStreaming: block.isStreaming,
            sessionKey: createAgentMarkdownSessionKey({
              conversationId: 'conv-a',
              messageId: 'msg-a',
              itemId: timelineItemId,
            }),
          }),
        ),
      ).not.toThrow();
    } finally {
      cleanup();
      registry.disposeAll();
      scheduler.dispose();
    }
  });

  it('ignores a late compatibility streamText after Timeline completion', () => {
    const registry = getAgentMarkdownSessionRegistry();
    registry.disposeAll();
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      markdownSessionRegistry: registry,
    });

    try {
      dispatch(
        timelineHandlers,
        timelineMessage([textTimelineItem('text-1', 1, 'Timeline text')]),
        harness.context,
      );
      dispatch(
        timelineHandlers,
        {
          ...timelineMessage([], 2),
          operations: [
            {
              operation: 'complete',
              itemId: 'text-1',
              itemRevision: 2,
              kind: 'assistant_text',
              sourceGeneration: 1,
              status: 'complete',
              updatedAt: 2,
            },
          ],
          completion: { status: 'completed', completedAt: 2 },
        },
        harness.context,
      );

      dispatch(
        streamingHandlers,
        {
          type: 'streamText',
          conversationId: 'conv-a',
          messageId: 'msg-a',
          content: 'Timeline text',
        },
        harness.context,
      );

      const blocks = harness.messages()[0]?.contentBlocks ?? [];
      expect(blocks.map((block) => block.id)).toEqual(['text-1']);
      const block = blocks[0];
      if (!block || block.type !== 'text' || typeof block.content !== 'string') {
        throw new Error('Expected completed Timeline-owned text block.');
      }
      const content = block.content;
      expect(() =>
        render(
          createElement(MarkdownRenderer, {
            content,
            isStreaming: block.isStreaming,
            sessionKey: createAgentMarkdownSessionKey({
              conversationId: 'conv-a',
              messageId: 'msg-a',
              itemId: block.id,
            }),
          }),
        ),
      ).not.toThrow();
    } finally {
      cleanup();
      registry.disposeAll();
    }
  });

  it('keeps completed Timeline ownership isolated when another conversation tab is active', () => {
    const registry = getAgentMarkdownSessionRegistry();
    registry.disposeAll();
    const activeMessages: Message[] = [
      { id: 'msg-b', role: 'assistant', content: 'Conversation B', timestamp: 1 },
    ];
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      currentMessages: activeMessages,
      nonCurrentMessages: new Map([['conv-a', []]]),
      markdownSessionRegistry: registry,
    });

    try {
      dispatch(
        timelineHandlers,
        timelineMessage([textTimelineItem('text-1', 1, 'Conversation A')]),
        harness.context,
      );
      dispatch(
        timelineHandlers,
        {
          ...timelineMessage([], 2),
          operations: [
            {
              operation: 'complete',
              itemId: 'text-1',
              itemRevision: 2,
              kind: 'assistant_text',
              sourceGeneration: 1,
              status: 'complete',
              updatedAt: 2,
            },
          ],
          completion: { status: 'completed', completedAt: 2 },
        },
        harness.context,
      );
      dispatch(
        streamingHandlers,
        {
          type: 'streamText',
          conversationId: 'conv-a',
          messageId: 'msg-a',
          content: 'Conversation A',
        },
        harness.context,
      );

      expect(harness.messages()).toEqual(activeMessages);
      const conversationABlocks =
        harness.conversationMessages().get('conv-a')?.[0]?.contentBlocks ?? [];
      expect(conversationABlocks.map((block) => block.id)).toEqual(['text-1']);
      expect(
        registry.getSnapshot(
          createAgentMarkdownSessionKey({
            conversationId: 'conv-a',
            messageId: 'msg-a',
            itemId: 'text-1',
          }),
        )?.source,
      ).toBe('Conversation A');
    } finally {
      registry.disposeAll();
    }
  });

  it('does not publish a background conversation revision gap into the foreground tab', () => {
    const foregroundMessages: Message[] = [
      { id: 'msg-b', role: 'assistant', content: 'Conversation B', timestamp: 1 },
    ];
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      currentMessages: foregroundMessages,
      nonCurrentMessages: new Map([['conv-a', []]]),
    });
    const requestSnapshot = vi
      .spyOn(AgentHostMessages, 'requestAgentTurnTimelineSnapshot')
      .mockImplementation(() => undefined);

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-1', 1, 'a')]),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      timelineMessage([{ ...textTimelineItem('text-1', 1, 'lost'), itemRevision: 2 }], 3),
      harness.context,
    );

    expect(requestSnapshot).toHaveBeenCalledTimes(1);
    expect(requestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-a',
        reason: 'revision-gap',
        lastAppliedDeliveryRevision: 1,
      }),
    );
    expect(harness.messages()).toEqual(foregroundMessages);
    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline).toMatchObject({
      conversationId: 'conv-a',
      synchronization: 'suspended',
    });
    expect(harness.globalError()).toBeNull();

    requestSnapshot.mockRestore();
  });

  it('requests one snapshot on a revision gap and resumes only after the snapshot', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a', currentMessages: [] });
    const requestSnapshot = vi
      .spyOn(AgentHostMessages, 'requestAgentTurnTimelineSnapshot')
      .mockImplementation(() => undefined);

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-1', 1, 'a')]),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      timelineMessage([{ ...textTimelineItem('text-1', 1, 'lost'), itemRevision: 2 }], 3),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      timelineMessage([{ ...textTimelineItem('text-1', 1, 'blocked'), itemRevision: 3 }], 4),
      harness.context,
    );

    expect(requestSnapshot).toHaveBeenCalledTimes(1);
    expect(requestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'revision-gap', lastAppliedDeliveryRevision: 1 }),
    );
    expect(harness.messages()[0]?.content).toBe('a');
    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline?.synchronization).toBe(
      'suspended',
    );
    expect(harness.globalError()).toBeNull();

    dispatch(
      timelineHandlers,
      {
        ...timelineMessage([], 4),
        batchKind: 'snapshot',
        operations: [
          {
            operation: 'snapshot',
            item: {
              ...textTimelineItem('text-1', 1, 'authoritative'),
              itemRevision: 3,
            },
          },
        ],
      },
      harness.context,
    );
    dispatch(
      timelineHandlers,
      timelineMessage([{ ...textTimelineItem('text-1', 1, '!'), itemRevision: 4 }], 5),
      harness.context,
    );

    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline?.synchronization).toBe(
      'synchronized',
    );
    expect(harness.messages()[0]?.content).toBe('authoritative!');
    requestSnapshot.mockRestore();
  });

  it('projects snapshot-unavailable diagnostics without discarding the last good source', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a', currentMessages: [] });
    const requestSnapshot = vi
      .spyOn(AgentHostMessages, 'requestAgentTurnTimelineSnapshot')
      .mockImplementation(() => undefined);

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-1', 1, 'retained')]),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      timelineMessage([{ ...textTimelineItem('text-1', 1, 'lost'), itemRevision: 2 }], 3),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      {
        type: 'agentTurnTimelineDiagnostic',
        schemaVersion: 2,
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-a',
        turnId: 'turn-msg-a',
        messageId: 'msg-a',
        code: 'turn-snapshot-unavailable',
        message: 'expired',
        deliveryRevision: 1,
      },
      harness.context,
    );

    expect(harness.messages()[0]?.content).toBe('retained');
    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline?.synchronization).toBe(
      'unavailable',
    );
    expect(harness.globalError()).toContain('turn-snapshot-unavailable');
    requestSnapshot.mockRestore();
  });

  it('does not publish a background snapshot-unavailable diagnostic into the foreground tab', () => {
    const foregroundMessages: Message[] = [
      { id: 'msg-b', role: 'assistant', content: 'Conversation B', timestamp: 1 },
    ];
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      currentMessages: foregroundMessages,
      nonCurrentMessages: new Map([['conv-a', []]]),
    });

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-1', 1, 'retained')]),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      {
        type: 'agentTurnTimelineDiagnostic',
        schemaVersion: 2,
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-a',
        turnId: 'turn-msg-a',
        messageId: 'msg-a',
        code: 'turn-snapshot-unavailable',
        message: 'expired',
        deliveryRevision: 1,
      },
      harness.context,
    );

    expect(harness.messages()).toEqual(foregroundMessages);
    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline).toMatchObject({
      conversationId: 'conv-a',
      synchronization: 'unavailable',
    });
    expect(harness.globalError()).toBeNull();
  });

  it('does not let a delayed snapshot-unavailable diagnostic reject a newer active turn', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a', currentMessages: [] });
    dispatch(
      timelineHandlers,
      {
        type: 'agentTurnTimeline',
        schemaVersion: 2,
        connectionEpoch: 'epoch-current',
        conversationId: 'conv-a',
        turnId: 'turn-current',
        messageId: 'msg-current',
        batchKind: 'delta',
        deliveryRevision: 1,
        operations: [
          {
            operation: 'append',
            item: {
              ...textTimelineItem('text-current', 1, 'current'),
              turnId: 'turn-current',
              messageId: 'msg-current',
            },
          },
        ],
      },
      harness.context,
    );

    dispatch(
      timelineHandlers,
      {
        type: 'agentTurnTimelineDiagnostic',
        schemaVersion: 2,
        connectionEpoch: 'epoch-expired',
        conversationId: 'conv-a',
        turnId: 'turn-expired',
        messageId: 'msg-expired',
        code: 'turn-snapshot-unavailable',
        message: 'The requested active turn snapshot is unavailable.',
        deliveryRevision: 1,
      },
      harness.context,
    );

    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline).toMatchObject({
      connectionEpoch: 'epoch-current',
      turnId: 'turn-current',
      messageId: 'msg-current',
      synchronization: 'synchronized',
    });
    expect(harness.globalError()).toBeNull();
  });

  it('anchors active timeline media tasks from canonical timeline events', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([
        {
          conversationId: 'conv-a',
          turnId: 'turn-msg-a',
          messageId: 'msg-a',
          itemId: 'tool-tool-a',
          sequence: 1,
          itemRevision: 1,
          kind: 'tool_call',
          status: 'pending',
          payload: {
            toolCall: { id: 'tool-a', name: 'GenerateImage', arguments: {} },
          },
          createdAt: 1,
          updatedAt: 1,
        },
        mediaTimelineItem('media-task-media-a', 2, 'tool-a', 'media-a'),
      ]),
      harness.context,
    );

    expect(harness.messages().map((message) => message.id)).toEqual(['msg-a']);
    expect(harness.messages()[0]?.workItemIds).toEqual(['media-a']);
    expect(harness.messages()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'media-task-media-a' })]),
    );
    expect(findWorkItem(harness.workItems(), 'conv-a', 'media-a')).toMatchObject({
      kind: 'media-task',
      parentToolCallId: 'tool-a',
    });
    expect(harness.globalError()).toBeNull();
  });

  it('rejects active non-timeline media creation when canonical timeline media is missing', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([
        {
          conversationId: 'conv-a',
          turnId: 'turn-msg-a',
          messageId: 'msg-a',
          itemId: 'tool-tool-a',
          sequence: 1,
          itemRevision: 1,
          kind: 'tool_call',
          status: 'pending',
          payload: {
            toolCall: { id: 'tool-a', name: 'GenerateImage', arguments: {} },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      harness.context,
    );
    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        workItem: createMediaWorkItem('conv-a', 'media-a', {
          parentMessageId: 'msg-a',
          parentToolCallId: 'tool-a',
        }),
      },
      harness.context,
    );

    expect(harness.globalError()).toContain(
      'active timeline media updates must arrive as agentTurnTimeline',
    );
    expect(harness.messages()[0]?.workItemIds).toBeUndefined();
    expect(harness.messages()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'media-task-media-a' })]),
    );
    expect(findWorkItem(harness.workItems(), 'conv-a', 'media-a')).toBeUndefined();
  });

  it('ignores duplicate active media messages after canonical timeline media arrived', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([
        {
          conversationId: 'conv-a',
          turnId: 'turn-msg-a',
          messageId: 'msg-a',
          itemId: 'tool-tool-a',
          sequence: 1,
          itemRevision: 1,
          kind: 'tool_call',
          status: 'pending',
          payload: {
            toolCall: { id: 'tool-a', name: 'GenerateImage', arguments: {} },
          },
          createdAt: 1,
          updatedAt: 1,
        },
        mediaTimelineItem('media-task-media-a', 2, 'tool-a', 'media-a'),
      ]),
      harness.context,
    );
    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskProgress',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        workItem: createMediaWorkItem('conv-a', 'media-a', {
          parentMessageId: 'msg-a',
          parentToolCallId: 'tool-a',
        }),
      },
      harness.context,
    );

    expect(harness.globalError()).toBeNull();
    expect(harness.messages()[0]?.workItemIds).toEqual(['media-a']);
  });

  it('does not let streamComplete content blocks reorder an active timeline turn', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([
        textTimelineItem('text-before', 1, 'Before.'),
        {
          conversationId: 'conv-a',
          turnId: 'turn-msg-a',
          messageId: 'msg-a',
          itemId: 'tool-tool-a',
          sequence: 2,
          itemRevision: 1,
          kind: 'tool_call',
          status: 'succeeded',
          payload: {
            toolCall: {
              id: 'tool-a',
              name: 'ReadDocument',
              arguments: {},
              result: { success: true, data: { title: 'Book' } },
            },
          },
          createdAt: 2,
          updatedAt: 2,
        },
        textTimelineItem('text-after', 3, ' After.'),
      ]),
      harness.context,
    );
    dispatch(
      streamingHandlers,
      {
        type: 'streamComplete',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        contentBlocks: [
          { id: 'text-before', type: 'text', timestamp: 1, content: 'Before.', isStreaming: false },
          { id: 'text-after', type: 'text', timestamp: 3, content: ' After.', isStreaming: false },
          {
            id: 'tool-tool-a',
            type: 'tool_call',
            timestamp: 2,
            toolCall: {
              id: 'tool-a',
              name: 'ReadDocument',
              arguments: {},
              result: { success: true, data: { title: 'Book' } },
            },
          },
        ],
      },
      harness.context,
    );

    expect(harness.messages()[0]?.isStreaming).toBe(false);
    expect(harness.messages()[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'text-before',
      'tool-tool-a',
      'text-after',
    ]);
  });

  it('keeps ReadImage resource context when validation replacement repairs the final table', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });
    const repairedMarkdown = [
      '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 开场 | S01 | P1 | 整页 | keep | 3s | 主角出现 | 缓慢推近 | 低风声 | 主角 |  | 黑白工业巨构前的孤独主角 | needs-review | use-as-reference | story | 建立空间与人物 | false |  |',
    ].join('\n');

    dispatch(
      timelineHandlers,
      timelineMessage([
        readImageTimelineItem('tool-read-image', 1, 'read-image'),
        textTimelineItem('text-storyboard', 2, '| 镜号 | 画面内容 |\n| --- | --- |\n| 1 | bad |'),
      ]),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      timelineMessage(
        [
          {
            ...textTimelineItem('text-storyboard', 3, ''),
            itemRevision: 2,
            payload: { content: '', format: 'markdown', sourceGeneration: 2 },
          },
        ],
        2,
        'replace',
      ),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      timelineMessage(
        [
          {
            ...textTimelineItem('text-storyboard', 4, repairedMarkdown),
            itemRevision: 3,
            payload: { content: repairedMarkdown, format: 'markdown', sourceGeneration: 2 },
          },
        ],
        3,
      ),
      harness.context,
    );
    dispatch(
      streamingHandlers,
      {
        type: 'streamComplete',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        contentBlocks: [
          readImageContentBlock('tool-read-image', 1, 'read-image'),
          {
            id: 'text-storyboard',
            type: 'text',
            timestamp: 2,
            content: repairedMarkdown,
            isStreaming: false,
          },
        ],
      },
      harness.context,
    );

    const message = harness.messages()[0];
    const textBlock = message?.contentBlocks?.find((block) => block.type === 'text');
    const projection = projectMarkdownResourceRendering({
      markdown: textBlock?.content ?? '',
      siblingBlocks: message?.contentBlocks,
    });

    expect(message?.contentBlocks?.map((block) => block.id)).toEqual([
      'tool-read-image',
      'text-storyboard',
    ]);
    expect(message?.content).toBe(repairedMarkdown);
    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: 'P1',
          status: 'bound',
          renderUris: ['vscode-webview://page-1'],
        }),
      ]),
    );
  });

  it('rejects active timeline tool results with unknown parents', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-before', 1, 'Before.')]),
      harness.context,
    );
    dispatch(
      toolHandlers,
      {
        type: 'toolResult',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        toolCallId: 'missing-tool',
        success: false,
        error: 'boom',
      },
      harness.context,
    );

    expect(harness.globalError()).toContain(
      'active timeline toolResult must arrive as agentTurnTimeline (unknown toolCallId missing-tool)',
    );
    expect(harness.messages()[0]?.contentBlocks?.map((block) => block.id)).toEqual(['text-before']);
  });

  it('ignores duplicate active tool results after canonical timeline result arrived', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([
        {
          conversationId: 'conv-a',
          turnId: 'turn-msg-a',
          messageId: 'msg-a',
          itemId: 'tool-tool-a',
          sequence: 1,
          itemRevision: 1,
          kind: 'tool_call',
          status: 'succeeded',
          payload: {
            toolCall: {
              id: 'tool-a',
              name: 'ReadDocument',
              arguments: {},
              result: { success: true, data: { title: 'Book' } },
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      harness.context,
    );
    dispatch(
      toolHandlers,
      {
        type: 'toolResult',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        toolCallId: 'tool-a',
        success: true,
        data: { title: 'Book' },
      },
      harness.context,
    );

    expect(harness.globalError()).toBeNull();
    expect(harness.messages()[0]?.contentBlocks?.[0]?.toolCall?.result).toMatchObject({
      success: true,
      data: { title: 'Book' },
    });
  });

  it('rejects active timeline media tasks without an explicit parent scope', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-before', 1, 'Before.')]),
      harness.context,
    );
    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        workItem: createMediaWorkItem('conv-a', 'media-a', {
          parentMessageId: 'msg-a',
        }),
      },
      harness.context,
    );

    expect(harness.globalError()).toContain(
      'active timeline media updates must arrive as agentTurnTimeline',
    );
    expect(harness.messages()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'media-task-media-a' })]),
    );
  });

  it('rejects active timeline task updates with unknown parents', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-before', 1, 'Before.')]),
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'taskUpdated',
        conversationId: 'conv-a',
        workItem: createTaskWorkItem(
          'conv-a',
          {
            ...createBackgroundTask('task-a', 'Generate A'),
            status: 'processing',
            progress: 50,
          },
          { parentMessageId: 'msg-a', parentToolCallId: 'missing-tool' },
        ),
      },
      harness.context,
    );

    expect(harness.globalError()).toContain(
      'active timeline task updates must arrive as agentTurnTimeline',
    );
    expect(harness.messages()[0]?.contentBlocks?.map((block) => block.id)).toEqual(['text-before']);
    expect(findWorkItem(harness.workItems(), 'conv-a', 'task-a')).toBeUndefined();
  });

  it('renders explicit turn-level active timeline media tasks from canonical timeline events', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([
        textTimelineItem('text-before', 1, 'Before.'),
        turnMediaTimelineItem('media-task-media-a', 2, 'media-a'),
      ]),
      harness.context,
    );

    expect(harness.globalError()).toBeNull();
    expect(harness.messages()[0]?.workItemIds).toEqual(['media-a']);
    expect(harness.messages()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'media-task-media-a' })]),
    );
    expect(harness.conversationStreaming().get('conv-a')?.activeTurnTimeline?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'media',
          parentAnchor: 'turn',
          payload: {
            workItem: expect.objectContaining({ id: 'media-a' }),
          },
        }),
      ]),
    );
  });

  it('keeps a completed timeline conversation idle when delayed media progress arrives', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([
        textTimelineItem('text-before', 1, 'Before.'),
        {
          ...turnMediaTimelineItem('media-task-media-a', 2, 'media-a'),
          status: 'pending',
          payload: {
            workItem: createMediaWorkItem('conv-a', 'media-a', {
              parentMessageId: 'msg-a',
              status: 'processing',
              progress: 20,
            }),
          },
        },
      ]),
      harness.context,
    );

    dispatch(
      streamingHandlers,
      {
        type: 'streamComplete',
        conversationId: 'conv-a',
        messageId: 'msg-a',
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
    });

    dispatch(
      timelineHandlers,
      timelineMessage(
        [
          {
            ...turnMediaTimelineItem('media-task-media-a', 2, 'media-a'),
            itemRevision: 2,
            status: 'succeeded',
            payload: {
              workItem: createMediaWorkItem('conv-a', 'media-a', {
                parentMessageId: 'msg-a',
                status: 'completed',
                progress: 100,
              }),
            },
          },
        ],
        2,
      ),
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'media-a')).toMatchObject({
      status: 'completed',
      progress: 100,
    });
  });

  it('renders active timeline conversation errors immediately from canonical timeline events', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([
        textTimelineItem('text-before', 1, 'Before.'),
        errorTimelineItem('error-provider', 2, 'Provider failed'),
      ]),
      harness.context,
    );

    expect(harness.messages()[0]?.contentBlocks).toMatchObject([
      { id: 'text-before', content: 'Before.' },
      { type: 'text', content: 'Error: Provider failed' },
    ]);
  });

  it('shows the original active conversation error instead of an internal timeline rejection', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
    });

    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-before', 1, 'Before.')]),
      harness.context,
    );
    dispatch(
      conversationHandlers,
      {
        type: 'error',
        conversationId: 'conv-a',
        message: 'Provider failed',
      },
      harness.context,
    );

    expect(harness.globalError()).toBe('Provider failed');
    expect(harness.messages()[0]?.contentBlocks).toMatchObject([
      { id: 'text-before', content: 'Before.' },
    ]);
  });

  it('stores queued message count from streaming events', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueued',
        conversationId: 'conv-a',
        content: 'Message queued (2 pending)',
        pendingCount: 2,
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 2,
    });
    expect(harness.messages()).toEqual([]);

    dispatch(
      streamingHandlers,
      {
        type: 'streamThinking',
        conversationId: 'conv-a',
        messageId: 'stream-a',
        content: 'Working',
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(2);

    dispatch(
      streamingHandlers,
      {
        type: 'streamComplete',
        conversationId: 'conv-a',
        messageId: 'stream-a',
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(0);
  });

  it('replaces hidden optimistic queued messages with authoritative queue snapshots', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'user-1',
          role: 'user',
          content: '生成分镜表',
          timestamp: 1,
        },
        {
          id: 'queued-1',
          role: 'user',
          content: '要求后续变更',
          timestamp: 2,
          isQueued: true,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '初稿完成',
          timestamp: 3,
        },
        {
          id: 'queued-2',
          role: 'user',
          content: '再补充镜头',
          timestamp: 4,
          isQueued: true,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 2,
        queuedMessages: [],
        messageQueueVersion: 0,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueueSnapshot',
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 2,
          version: 1,
          items: [
            {
              id: 'runtime-1',
              conversationId: 'conv-a',
              content: '要求后续变更',
              createdAt: 10,
              source: 'composer',
            },
            {
              id: 'runtime-2',
              conversationId: 'conv-a',
              content: '再补充镜头',
              createdAt: 11,
              source: 'composer',
            },
          ],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(2);
    expect(harness.streaming().queuedMessages?.map((item) => item.id)).toEqual([
      'runtime-1',
      'runtime-2',
    ]);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ id: 'assistant-1' }),
    ]);
  });

  it('removes a stale visible user message when the runtime confirms it is queued', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'user-1',
          role: 'user',
          content: '生成图片',
          timestamp: 100,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '正在生成...',
          timestamp: 200,
        },
        {
          id: 'local-hi',
          role: 'user',
          content: 'hi',
          timestamp: 1_000,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 0,
        queuedMessages: [],
        messageQueueVersion: 0,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueueSnapshot',
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 1,
          version: 1,
          items: [
            {
              id: 'runtime-hi',
              conversationId: 'conv-a',
              content: 'hi',
              createdAt: 1_005,
              source: 'composer',
            },
          ],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(1);
    expect(harness.streaming().queuedMessages?.map((item) => item.id)).toEqual(['runtime-hi']);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ id: 'assistant-1' }),
    ]);
  });

  it('ignores stale queue snapshots by conversation-local version', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 1,
        queuedMessages: [
          {
            id: 'runtime-current',
            conversationId: 'conv-a',
            content: '当前排队消息',
            createdAt: 10,
            source: 'composer',
          },
        ],
        messageQueueVersion: 3,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueueSnapshot',
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(1);
    expect(harness.streaming().queuedMessages?.map((item) => item.id)).toEqual(['runtime-current']);
  });

  it('applies queued edit requests and asks the composer layer to restore content', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'queued-optimistic',
          role: 'user',
          content: '重新编辑我',
          timestamp: 2,
          isQueued: true,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 1,
        queuedMessages: [
          {
            id: 'runtime-1',
            conversationId: 'conv-a',
            content: '重新编辑我',
            createdAt: 10,
            source: 'composer',
          },
        ],
        messageQueueVersion: 1,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'queuedMessageEditRequested',
        tabId: 'tab-a',
        conversationId: 'conv-a',
        item: {
          id: 'runtime-1',
          conversationId: 'conv-a',
          content: '重新编辑我',
          createdAt: 10,
          source: 'composer',
        },
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(0);
    expect(harness.streaming().queuedMessages).toEqual([]);
    expect(harness.messages()).toEqual([]);
    expect(harness.queuedEditRequest()).toEqual({
      tabId: 'tab-a',
      conversationId: 'conv-a',
      item: expect.objectContaining({ id: 'runtime-1', content: '重新编辑我' }),
    });
  });

  it('projects a released queued item into the transcript when execution starts', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'user-1',
          role: 'user',
          content: '原始请求',
          timestamp: 1,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 1,
        queuedMessages: [
          {
            id: 'runtime-1',
            conversationId: 'conv-a',
            content: '继续补充分镜',
            createdAt: 10,
            source: 'composer',
          },
        ],
        messageQueueVersion: 1,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueued',
        conversationId: 'conv-a',
        pendingCount: 0,
        releasedItem: {
          id: 'runtime-1',
          conversationId: 'conv-a',
          content: '继续补充分镜',
          createdAt: 10,
          source: 'composer',
        },
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(0);
    expect(harness.streaming().queuedMessages).toEqual([]);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'user-1', role: 'user', content: '原始请求' }),
      {
        id: 'released:runtime-1',
        role: 'user',
        content: '继续补充分镜',
        timestamp: 10,
      },
    ]);
  });

  it('keeps released task-result observations on the control plane instead of adding user messages', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'user-1',
          role: 'user',
          content: '生成图片',
          timestamp: 1,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '图片已生成',
          timestamp: 2,
        },
      ],
      currentStreaming: {
        isThinking: false,
        streamingMessageId: null,
        queuedMessageCount: 1,
        queuedMessages: [
          {
            id: 'task-observation-1',
            conversationId: 'conv-a',
            content: 'Continue from the completed async task result.',
            createdAt: 10,
            source: 'task-result-continuation',
          },
        ],
        messageQueueVersion: 1,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueued',
        conversationId: 'conv-a',
        pendingCount: 0,
        releasedItem: {
          id: 'task-observation-1',
          conversationId: 'conv-a',
          content: 'Continue from the completed async task result.',
          createdAt: 10,
          source: 'task-result-continuation',
        },
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      },
      harness.context,
    );

    expect(harness.streaming().isThinking).toBe(true);
    expect(harness.streaming().queuedMessageCount).toBe(0);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'user-1', role: 'user', content: '生成图片' }),
      expect.objectContaining({ id: 'assistant-1', role: 'assistant', content: '图片已生成' }),
    ]);
  });

  it('does not release local queue items on queue acknowledgement events', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'queued-1',
          role: 'user',
          content: '第一条后续消息',
          timestamp: 1,
          isQueued: true,
        },
        {
          id: 'queued-2',
          role: 'user',
          content: '第二条后续消息',
          timestamp: 2,
          isQueued: true,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 0,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueued',
        conversationId: 'conv-a',
        content: 'Message queued (1 pending)',
        pendingCount: 1,
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(1);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'queued-1', isQueued: true }),
      expect.objectContaining({ id: 'queued-2', isQueued: true }),
    ]);
  });

  it('drops media task events when the route conversation does not match the work item', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        workItem: createMediaWorkItem('conv-b', 'media-b'),
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([]);
    expect(harness.workItems().size).toBe(0);
  });

  it('attaches subagent events to the parent tool call in the target conversation only', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      nonCurrentMessages: new Map([
        [
          'conv-b',
          [
            {
              id: 'msg-b',
              role: 'assistant',
              content: '',
              timestamp: 1,
              contentBlocks: [
                {
                  id: 'block-b',
                  type: 'tool_call',
                  timestamp: 1,
                  toolCall: {
                    id: 'tool-b',
                    name: 'task',
                    arguments: {},
                  },
                },
              ],
            },
          ],
        ],
      ]),
    });

    const subAgentEvent = {
      type: 'started',
      scope: subAgentScope('conv-b', 'parent-b', 'sub-b'),
      subAgentId: 'sub-b',
      parentAgentId: 'parent-b',
      conversationId: 'conv-b',
      data: {
        description: 'Review target conversation',
        parentToolCallId: 'tool-b',
        runMode: 'background',
        modelTier: 'fast',
      },
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    } satisfies SubAgentWorkItemEvent;

    dispatch(
      subAgentHandlers,
      {
        type: 'subagentEvent',
        conversationId: 'conv-b',
        event: subAgentEvent,
        workItem: projectSubAgentEventToWorkItem(subAgentEvent),
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([]);
    expect(harness.conversationMessages().get('conv-b')?.[0]).toMatchObject({
      id: 'msg-b',
      workItemIds: ['sub-b'],
    });
    expect(findWorkItem(harness.workItems(), 'conv-b', 'sub-b')).toMatchObject({
      kind: 'subagent',
      conversationId: 'conv-b',
      parentToolCallId: 'tool-b',
      subAgent: {
        parentAgentId: 'parent-b',
        runMode: 'background',
        modelTier: 'fast',
      },
    });
    expect(harness.workItems().get('conv-a')).toBeUndefined();
  });

  it('attaches subagent events to the parent tool call in the current conversation', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'msg-a',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            {
              id: 'block-a',
              type: 'tool_call',
              timestamp: 1,
              toolCall: {
                id: 'tool-a',
                name: 'task',
                arguments: {},
              },
            },
          ],
        },
      ],
    });

    const subAgentEvent = {
      type: 'started',
      scope: subAgentScope('conv-a', 'parent-a', 'sub-a'),
      subAgentId: 'sub-a',
      parentAgentId: 'parent-a',
      conversationId: 'conv-a',
      data: {
        description: 'Review current conversation',
        parentToolCallId: 'tool-a',
        runMode: 'background',
        modelTier: 'fast',
      },
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    } satisfies SubAgentWorkItemEvent;

    dispatch(
      subAgentHandlers,
      {
        type: 'subagentEvent',
        conversationId: 'conv-a',
        event: subAgentEvent,
        workItem: projectSubAgentEventToWorkItem(subAgentEvent),
      },
      harness.context,
    );

    expect(harness.messages()).toHaveLength(1);
    expect(harness.messages()[0]).toMatchObject({
      id: 'msg-a',
      workItemIds: ['sub-a'],
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'sub-a')).toMatchObject({
      kind: 'subagent',
      conversationId: 'conv-a',
      parentToolCallId: 'tool-a',
    });
  });

  it('drops subagent events when the route conversation does not match the event', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    const subAgentEvent = {
      type: 'started',
      scope: subAgentScope('conv-b', 'parent-b', 'sub-b'),
      subAgentId: 'sub-b',
      parentAgentId: 'parent-b',
      conversationId: 'conv-b',
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    } satisfies SubAgentWorkItemEvent;

    dispatch(
      subAgentHandlers,
      {
        type: 'subagentEvent',
        conversationId: 'conv-a',
        event: subAgentEvent,
        workItem: projectSubAgentEventToWorkItem(subAgentEvent),
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([]);
    expect(harness.workItems().size).toBe(0);
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

function findWorkItem(store: AgentWorkItemStore, conversationId: string, localId: string) {
  return Array.from(store.get(conversationId)?.values() ?? []).find((item) => item.id === localId);
}

function taskScope(conversationId: string, childRunId: string): TaskRunScope {
  return {
    conversationId,
    runId: `run:${conversationId}`,
    parentRunId: `run:${conversationId}`,
    childRunId,
    childKind: 'task',
  };
}

function subAgentScope(
  conversationId: string,
  parentRunId: string,
  childRunId: string,
): ChildRunScope {
  return {
    conversationId,
    runId: `run:${conversationId}`,
    parentRunId,
    childRunId,
    childKind: 'subagent',
  };
}

function createBackgroundTask(
  id: string,
  prompt: string,
  conversationId = 'conv-a',
): AgentBackgroundTask {
  return {
    scope: taskScope(conversationId, id),
    id,
    type: 'image',
    name: prompt,
    prompt,
    providerId: 'provider-1',
    providerName: 'model-1',
    status: 'queued',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createTaskWorkItem(
  conversationId: string,
  task: AgentBackgroundTask,
  links: { parentMessageId?: string; parentToolCallId?: string } = {},
) {
  return projectBackgroundTaskToWorkItem({
    conversationId,
    task,
    parentMessageId: links.parentMessageId,
    parentToolCallId: links.parentToolCallId,
  });
}

function createMediaTask(
  conversationId: string,
  id: string,
  overrides: Partial<Pick<AgentMediaTaskView, 'status' | 'progress'>> = {},
): AgentMediaTaskView {
  return {
    scope: taskScope(conversationId, id),
    id,
    type: 'image',
    status: overrides.status ?? 'processing',
    progress: overrides.progress ?? 25,
    providerId: 'provider-1',
    modelId: 'model-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    request: { prompt: 'Generate image' },
  };
}

function createMediaWorkItem(
  conversationId: string,
  id: string,
  options: {
    parentMessageId?: string;
    parentToolCallId?: string;
    status?: AgentMediaTaskView['status'];
    progress?: number;
  } = {},
) {
  return projectMediaTaskToWorkItem({
    conversationId,
    task: createMediaTask(conversationId, id, {
      status: options.status,
      progress: options.progress,
    }),
    parentMessageId: options.parentMessageId,
    parentToolCallId: options.parentToolCallId,
  });
}

function timelineMessage(
  items: readonly AgentTurnTimelineItem[],
  deliveryRevision = 1,
  textOperation: 'append' | 'replace' = 'append',
): AgentTurnTimelineMessage {
  return {
    type: 'agentTurnTimeline',
    schemaVersion: 2,
    connectionEpoch: 'epoch-1',
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    batchKind: 'delta',
    deliveryRevision,
    operations: items.map((item) => ({
      operation:
        item.kind === 'assistant_text' || item.kind === 'thinking' ? textOperation : 'upsert',
      item,
    })) as AgentTurnTimelineMessage['operations'],
  };
}

function textTimelineItem(
  itemId: string,
  sequence: number,
  content: string,
): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'assistant_text',
    status: 'streaming',
    payload: { content, format: 'markdown', sourceGeneration: 1 },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function readImageTimelineItem(
  itemId: string,
  sequence: number,
  toolCallId: string,
): AgentTurnTimelineItem {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'tool_call',
    status: 'succeeded',
    payload: {
      toolCall: createReadImageToolCall(toolCallId),
    },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function readImageContentBlock(id: string, timestamp: number, toolCallId: string): ContentBlock {
  return {
    id,
    type: 'tool_call',
    timestamp,
    toolCall: createReadImageToolCall(toolCallId),
  };
}

function createReadImageToolCall(toolCallId: string): ToolCall {
  return {
    id: toolCallId,
    name: 'ReadImage',
    arguments: {},
    result: {
      success: true,
      data: {
        imageInfo: [
          {
            alias: 'P1',
            label: 'Page 1',
            entryPath: 'OPS/page-1.jpg',
            mimeType: 'image/jpeg',
            width: 1511,
            height: 2160,
            renderUri: 'vscode-webview://page-1',
            resourceRef: {
              kind: 'document-entry',
              source: {
                filePath: '${BOOKS}/story.epub',
                format: 'epub',
              },
              entryPath: 'OPS/page-1.jpg',
              versionPolicy: 'versioned-export',
            },
          },
        ],
        images: [
          {
            alias: 'P1',
            label: 'Page 1',
            entryPath: 'OPS/page-1.jpg',
            mimeType: 'image/jpeg',
            width: 1511,
            height: 2160,
            renderUri: 'vscode-webview://page-1',
            resourceRef: {
              kind: 'document-entry',
              source: {
                filePath: '${BOOKS}/story.epub',
                format: 'epub',
              },
              entryPath: 'OPS/page-1.jpg',
              versionPolicy: 'versioned-export',
            },
          },
        ],
      },
      attachments: [
        {
          type: 'image',
          path: 'vscode-webview://page-1',
          mimeType: 'image/jpeg',
        },
      ],
    },
  };
}

function mediaTimelineItem(
  itemId: string,
  sequence: number,
  parentToolCallId: string,
  workItemId: string,
): AgentTurnTimelineItem {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'media',
    status: 'pending',
    parentAnchor: 'tool_call',
    parentToolCallId,
    payload: {
      workItem: createMediaWorkItem('conv-a', workItemId, {
        parentMessageId: 'msg-a',
        parentToolCallId,
      }),
    },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function turnMediaTimelineItem(
  itemId: string,
  sequence: number,
  workItemId: string,
): AgentTurnTimelineMediaItem {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'media',
    status: 'pending',
    parentAnchor: 'turn',
    payload: {
      workItem: createMediaWorkItem('conv-a', workItemId, {
        parentMessageId: 'msg-a',
      }),
    },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function errorTimelineItem(
  itemId: string,
  sequence: number,
  message: string,
): AgentTurnTimelineItem {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'error',
    status: 'failed',
    payload: { message },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

interface ContextHarnessOptions {
  activeConversationId: string | null;
  mentionSearchFilter?: string;
  currentMessages?: Message[];
  nonCurrentMessages?: Map<string, Message[]>;
  currentStreaming?: StreamingState;
  nonCurrentStreaming?: Map<string, StreamingState>;
  timelineRenderScheduler?: NonNullable<MessageHandlerContext['timelineRenderScheduler']>;
  markdownSessionRegistry?: NonNullable<MessageHandlerContext['markdownSessionRegistry']>;
}

interface ContextHarness {
  context: MessageHandlerContext;
  messages(): Message[];
  streaming(): StreamingState;
  conversationMessages(): Map<string, Message[]>;
  conversationStreaming(): Map<string, StreamingState>;
  workItems(): AgentWorkItemStore;
  pluginsAvailable(): PluginsAvailable;
  projectFiles(): ProjectFileInfo[];
  mentionItems(): MentionItem[];
  queuedEditRequest(): {
    tabId: string;
    conversationId: string;
    item: AgentQueuedMessageItem;
  } | null;
  globalError(): string | null;
}

function createContextHarness(options: ContextHarnessOptions): ContextHarness {
  let messages = options.currentMessages ?? [];
  let queuedEditRequest: {
    tabId: string;
    conversationId: string;
    item: AgentQueuedMessageItem;
  } | null = null;
  let globalError: string | null = null;
  let streaming: StreamingState & { queuedMessageCount: number } = {
    isThinking: false,
    streamingMessageId: null,
    queuedMessageCount: 0,
    queuedMessages: [],
    ...options.currentStreaming,
  };
  let workItems: AgentWorkItemStore = new Map();
  let pluginsAvailable: PluginsAvailable = {};
  let projectFiles: ProjectFileInfo[] = [];
  let mentionItems: MentionItem[] = [];
  const activeConversationIdRef = ref<string | null>(options.activeConversationId);
  const streamingMessageIdRef = ref<string | null>(streaming.streamingMessageId);
  const isTablessConversationViewRef = ref(false);
  const conversationMessagesRef = ref(new Map<string, Message[]>(options.nonCurrentMessages ?? []));
  const conversationStreamingRef = ref(
    new Map<string, StreamingState>(options.nonCurrentStreaming ?? []),
  );
  if (options.activeConversationId) {
    conversationMessagesRef.current.set(options.activeConversationId, messages);
    conversationStreamingRef.current.set(options.activeConversationId, streaming);
  }

  const setMessages = createSetter(
    () => messages,
    (next) => {
      messages = next;
      context.messages = next;
    },
  );
  const setIsThinking = createSetter(
    () => streaming.isThinking,
    (next) => {
      streaming = { ...streaming, isThinking: next };
      context.isThinking = next;
    },
  );
  const setStreamingMessageId = createSetter(
    () => streaming.streamingMessageId,
    (next) => {
      streaming = { ...streaming, streamingMessageId: next };
      streamingMessageIdRef.current = next;
    },
  );
  const setQueuedMessageCount = createSetter(
    () => streaming.queuedMessageCount,
    (next) => {
      streaming = { ...streaming, queuedMessageCount: next };
      context.queuedMessageCount = next;
    },
  );
  const setQueuedMessages = createSetter(
    () => streaming.queuedMessages ?? [],
    (next) => {
      streaming = { ...streaming, queuedMessages: next };
      context.queuedMessages = next;
    },
  );
  const setWorkItemsByConversation = createSetter(
    () => workItems,
    (next) => {
      workItems = next;
    },
  );
  const setPluginsAvailable = createSetter(
    () => pluginsAvailable,
    (next) => {
      pluginsAvailable = next;
    },
  );
  const setProjectFiles = createSetter(
    () => projectFiles,
    (next) => {
      projectFiles = next;
    },
  );
  const setMentionItems = createSetter(
    () => mentionItems,
    (next) => {
      mentionItems = next;
    },
  );

  const context = {
    messages,
    setMessages,
    isThinking: streaming.isThinking,
    setIsThinking,
    setStreamingMessageId,
    setQueuedMessageCount,
    setQueuedMessages,
    streamingMessageId: streaming.streamingMessageId,
    queuedMessageCount: streaming.queuedMessageCount,
    queuedMessages: streaming.queuedMessages,
    streamingMessageIdRef,
    activeConversationId: options.activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs: [],
    activeTabId: null,
    isTablessConversationViewRef,
    setOpenTabs: noopDispatch(),
    setActiveTabId: noopDispatch(),
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
    requestQueuedMessageEdit: (request) => {
      queuedEditRequest = request;
    },
    reportConversationDiagnostic: vi.fn(),
    conversationTokenCountRef: ref(new Map()),
    conversationCompressingRef: ref(new Map()),
    forceUpdate: () => undefined,
    isCurrentConversation: (conversationId?: string) =>
      conversationId === activeConversationIdRef.current,
    timelineRenderScheduler:
      options.timelineRenderScheduler ?? createImmediateTimelineRenderScheduler(),
    markdownSessionRegistry:
      options.markdownSessionRegistry ?? createAgentMarkdownSessionRegistry(),
    conversationRenderCoordinator: new ConversationRenderCoordinator(),
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
      const snapshot = ingestConversationRenderSnapshot({
        coordinator,
        conversationId,
        messages: result.messages,
        streaming: result.streaming,
        kind: 'timeline-commit',
      });
      commitConversationSnapshotProjection({
        snapshot,
        conversationMessagesRef,
        conversationStreamingRef,
      });
    },
    setConversations: noopDispatch(),
    setActiveConversationId: noopDispatch(),
    setWorkItemsByConversation,
    setProjectFiles,
    mentionSearchFilter: options.mentionSearchFilter ?? '',
    setMentionItems,
    setPluginCommands: noopDispatch(),
    setPluginsAvailable,
    setShowOnboarding: noopDispatch(),
  } satisfies MessageHandlerContext;

  return {
    context,
    messages: () => messages,
    streaming: () => streaming,
    conversationMessages: () => conversationMessagesRef.current,
    conversationStreaming: () => conversationStreamingRef.current,
    workItems: () => workItems,
    pluginsAvailable: () => pluginsAvailable,
    projectFiles: () => projectFiles,
    mentionItems: () => mentionItems,
    queuedEditRequest: () => queuedEditRequest,
    globalError: () => globalError,
  };
}

function createImmediateTimelineRenderScheduler(): NonNullable<
  MessageHandlerContext['timelineRenderScheduler']
> {
  let renderCommits = 0;
  let disposed = false;
  return {
    enqueue(message, commit): void {
      if (disposed) throw new Error('Test Timeline scheduler is disposed.');
      commit([message]);
      renderCommits += 1;
    },
    flushConversation(): void {},
    discardTurn(): void {},
    discardConversation(): void {},
    flushAll(): void {},
    dispose(): void {
      disposed = true;
    },
    metrics() {
      return {
        scheduledDeliveries: 0,
        immediateDeliveries: renderCommits,
        renderCommits,
        maxPendingDeliveries: 0,
        pendingDeliveries: 0,
        disposed,
      };
    },
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
