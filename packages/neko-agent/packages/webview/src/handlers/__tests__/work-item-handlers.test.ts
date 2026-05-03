import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it } from 'vitest';
import type {
  AgentBackgroundTask,
  AgentMediaTaskView,
  ExtensionToWebviewMessage,
  SubAgentWorkItemEvent,
} from '@neko-agent/types';
import {
  projectBackgroundTaskToWorkItem,
  projectMediaTaskToWorkItem,
  projectSubAgentEventToWorkItem,
} from '@/presenters/work-item-projection-presenter';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { Message } from '@/components/types';
import { configHandlers } from '../config-handlers';
import { mediaHandlers } from '../media-handlers';
import { subAgentHandlers } from '../subagent-handlers';
import { taskHandlers } from '../task-handlers';
import type { HandlerRegistration, MessageHandlerContext, StreamingState } from '../types';

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
      currentStreaming: { isThinking: true, streamingMessageId: 'stream-a' },
      nonCurrentStreaming: new Map([
        ['conv-b', { isThinking: true, streamingMessageId: 'stream-b' }],
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
    });
    expect(harness.workItems().get('conv-b')?.get('media-b')).toMatchObject({
      kind: 'media-task',
      conversationId: 'conv-b',
    });
    expect(harness.workItems().get('conv-a')).toBeUndefined();
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

function createMediaTask(id: string): AgentMediaTaskView {
  return {
    id,
    type: 'image',
    status: 'processing',
    progress: 25,
    providerId: 'provider-1',
    modelId: 'model-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    request: { prompt: 'Generate image' },
  };
}

function createMediaWorkItem(conversationId: string, id: string) {
  return projectMediaTaskToWorkItem({
    conversationId,
    task: createMediaTask(id),
  });
}

interface ContextHarnessOptions {
  activeConversationId: string;
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
}

function createContextHarness(options: ContextHarnessOptions): ContextHarness {
  let messages = options.currentMessages ?? [];
  let streaming = options.currentStreaming ?? { isThinking: false, streamingMessageId: null };
  let workItems: AgentWorkItemStore = new Map();
  let pluginsAvailable: PluginsAvailable = {};
  const activeConversationIdRef = ref<string | null>(options.activeConversationId);
  const streamingMessageIdRef = ref<string | null>(streaming.streamingMessageId);
  const conversationMessagesRef = ref(new Map<string, Message[]>(options.nonCurrentMessages ?? []));
  const conversationStreamingRef = ref(
    new Map<string, StreamingState>(options.nonCurrentStreaming ?? []),
  );

  const setMessages = createSetter(
    () => messages,
    (next) => {
      messages = next;
    },
  );
  const setIsThinking = createSetter(
    () => streaming.isThinking,
    (next) => {
      streaming = { ...streaming, isThinking: next };
    },
  );
  const setStreamingMessageId = createSetter(
    () => streaming.streamingMessageId,
    (next) => {
      streaming = { ...streaming, streamingMessageId: next };
      streamingMessageIdRef.current = next;
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

  const context = {
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    streamingMessageId: streaming.streamingMessageId,
    streamingMessageIdRef,
    activeConversationId: options.activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs: [],
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
    setPendingSkillConfirm: noopDispatch(),
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
      };
      const result = updater(existingMessages, existingStreaming);
      conversationMessagesRef.current.set(conversationId, result.messages);
      conversationStreamingRef.current.set(conversationId, result.streaming);
    },
    setConversations: noopDispatch(),
    setActiveConversationId: noopDispatch(),
    setWorkItemsByConversation,
    setProjectFiles: noopDispatch(),
    setMentionItems: noopDispatch(),
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
