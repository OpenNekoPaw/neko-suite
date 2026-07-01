import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it } from 'vitest';
import type {
  AgentBackgroundTask,
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineMediaItem,
  AgentTurnTimelineMessage,
  AgentMediaTaskView,
  AgentQueuedMessageItem,
  ExtensionToWebviewMessage,
  ContentBlock,
  Message,
  SubAgentWorkItemEvent,
  ToolCall,
} from '@neko-agent/types';
import {
  projectBackgroundTaskToWorkItem,
  projectMediaTaskToWorkItem,
  projectSubAgentEventToWorkItem,
} from '@/presenters/work-item-projection-presenter';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { MentionItem } from '@/components/ChatView/InputArea/types';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import { configHandlers } from '../config-handlers';
import { conversationHandlers } from '../conversation-handlers';
import { mediaHandlers } from '../media-handlers';
import { subAgentHandlers } from '../subagent-handlers';
import { streamingHandlers } from '../streaming-handlers';
import { taskHandlers } from '../task-handlers';
import { timelineHandlers } from '../timeline-handlers';
import { toolHandlers } from '../tool-handlers';
import type { HandlerRegistration, MessageHandlerContext, StreamingState } from '../types';
import { projectMarkdownResourceRendering } from '@/presenters/markdown-resource-rendering-presenter';

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
        workItems: [createTaskWorkItem('conv-b', createBackgroundTask('task-b', 'Generate B'))],
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

    expect(harness.workItems().get('conv-a')?.get('task-a')).toMatchObject({
      conversationId: 'conv-a',
      status: 'completed',
      progress: 100,
    });
    expect(harness.workItems().get('conv-b')?.get('task-b')).toMatchObject({
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

    expect(harness.workItems().get('conv-a')?.get('task-a')).toMatchObject({
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

    const items = harness.workItems().get('conv-a');
    expect(items?.has('stale-task')).toBe(false);
    expect(items?.get('live-task')).toMatchObject({
      kind: 'tool-background-task',
      status: 'processing',
      progress: 50,
    });
    expect(items?.get('media-task')).toMatchObject({ kind: 'media-task' });
    expect(items?.get('subagent-task')).toMatchObject({ kind: 'subagent' });
    expect(items?.get('linked-task')).toMatchObject({
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
    });
    expect(harness.workItems().get('conv-b')?.get('media-b')).toMatchObject({
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
    expect(harness.workItems().get('conv-a')?.get('media-a')).toMatchObject({
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
    expect(harness.workItems().get('conv-a')?.get('media-a')).toBeUndefined();
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
      timelineMessage([
        {
          ...textTimelineItem('text-storyboard', 3, ''),
          payload: { content: '', format: 'markdown', replaceContent: true },
        },
      ]),
      harness.context,
    );
    dispatch(
      timelineHandlers,
      timelineMessage([textTimelineItem('text-storyboard', 4, repairedMarkdown)]),
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
    expect(harness.workItems().get('conv-a')?.get('task-a')).toBeUndefined();
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
      timelineMessage([
        {
          ...turnMediaTimelineItem('media-task-media-a', 3, 'media-a'),
          status: 'succeeded',
          payload: {
            workItem: createMediaWorkItem('conv-a', 'media-a', {
              parentMessageId: 'msg-a',
              status: 'completed',
              progress: 100,
            }),
          },
        },
      ]),
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
    });
    expect(harness.workItems().get('conv-a')?.get('media-a')).toMatchObject({
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

  it('rejects active non-timeline conversation errors when canonical timeline error is missing', () => {
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

    expect(harness.globalError()).toContain(
      'active timeline errors must arrive as agentTurnTimeline',
    );
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
    expect(harness.workItems().get('conv-b')?.get('sub-b')).toMatchObject({
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
    expect(harness.workItems().get('conv-a')?.get('sub-a')).toMatchObject({
      kind: 'subagent',
      conversationId: 'conv-a',
      parentToolCallId: 'tool-a',
    });
  });

  it('drops subagent events when the route conversation does not match the event', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    const subAgentEvent = {
      type: 'started',
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

function createBackgroundTask(id: string, prompt: string): AgentBackgroundTask {
  return {
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
  id: string,
  overrides: Partial<Pick<AgentMediaTaskView, 'status' | 'progress'>> = {},
): AgentMediaTaskView {
  return {
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
    task: createMediaTask(id, { status: options.status, progress: options.progress }),
    parentMessageId: options.parentMessageId,
    parentToolCallId: options.parentToolCallId,
  });
}

function timelineMessage(events: AgentTurnTimelineMessage['events']): AgentTurnTimelineMessage {
  return {
    type: 'agentTurnTimeline',
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    events,
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
    kind: 'assistant_text',
    status: 'streaming',
    payload: { content, format: 'markdown' },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function readImageTimelineItem(
  itemId: string,
  sequence: number,
  toolCallId: string,
): AgentTurnTimelineMessage['events'][number] {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    itemId,
    sequence,
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
): AgentTurnTimelineMessage['events'][number] {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    itemId,
    sequence,
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
): AgentTurnTimelineMessage['events'][number] {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-msg-a',
    messageId: 'msg-a',
    itemId,
    sequence,
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
    conversationId: string;
    item: AgentQueuedMessageItem;
  } | null;
  globalError(): string | null;
}

function createContextHarness(options: ContextHarnessOptions): ContextHarness {
  let messages = options.currentMessages ?? [];
  let queuedEditRequest: { conversationId: string; item: AgentQueuedMessageItem } | null = null;
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
