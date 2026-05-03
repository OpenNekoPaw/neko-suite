import { describe, expect, it } from 'vitest';
import type { AgentBackgroundTask, AgentWorkItemStore } from '@neko-agent/types';
import {
  backgroundTaskToWorkItem,
  projectMediaTaskToWorkItem,
  projectSubAgentEventToWorkItem,
} from '../work-item-projection-presenter';
import {
  getBackgroundTasksForConversation,
  getTaskWorkItemById,
  getWorkItemsForConversation,
  mergeBackgroundTaskSnapshotForConversation,
  removeConversationWorkItems,
  removeWorkItemForConversation,
  replaceWorkItemsForConversation,
  upsertWorkItemsForConversation,
  workItemToBackgroundTask,
} from '../work-item-state-presenter';

describe('work-item-state-presenter', () => {
  it('merges task work items while preserving parent links', () => {
    const initial = backgroundTaskToWorkItem(
      createBackgroundTask('task-1', 'Generate cat'),
      'conv-1',
      'tool-background-task',
      { parentMessageId: 'msg-1', parentToolCallId: 'tool-1' },
    );
    const updated = backgroundTaskToWorkItem(
      {
        ...initial.task,
        status: 'completed',
        progress: 100,
        updatedAt: 't1',
        result: { urls: ['webview://cat.png'] },
      },
      'conv-1',
      'tool-background-task',
    );

    const store = upsertWorkItemsForConversation(new Map(), 'conv-1', [initial]);
    const merged = upsertWorkItemsForConversation(store, 'conv-1', [updated]);

    expect(merged.get('conv-1')?.get('task-1')).toMatchObject({
      status: 'completed',
      progress: 100,
      parentMessageId: 'msg-1',
      parentToolCallId: 'tool-1',
      createdAt: 't0',
      result: { urls: ['webview://cat.png'] },
    });
  });

  it('preserves subagent links and finalizes running steps across progress updates', () => {
    const started = projectSubAgentEventToWorkItem({
      type: 'started',
      subAgentId: 'sub-1',
      parentAgentId: 'parent-1',
      conversationId: 'conv-1',
      data: {
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
        description: 'Review implementation',
      },
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    });
    const progress = projectSubAgentEventToWorkItem({
      type: 'progress',
      subAgentId: 'sub-1',
      parentAgentId: 'parent-1',
      conversationId: 'conv-1',
      data: {
        status: 'running',
        progress: '50% reading files',
      },
      timestamp: Date.parse('2026-01-01T00:00:10.000Z'),
    });
    const completed = projectSubAgentEventToWorkItem({
      type: 'completed',
      subAgentId: 'sub-1',
      parentAgentId: 'parent-1',
      conversationId: 'conv-1',
      data: {
        status: 'completed',
        result: {
          id: 'sub-1',
          status: 'completed',
          response: 'Done',
        },
      },
      timestamp: Date.parse('2026-01-01T00:00:20.000Z'),
    });

    const store = upsertWorkItemsForConversation(new Map(), 'conv-1', [started]);
    const withProgress = upsertWorkItemsForConversation(store, 'conv-1', [progress]);
    const merged = upsertWorkItemsForConversation(withProgress, 'conv-1', [completed]);

    expect(merged.get('conv-1')?.get('sub-1')).toMatchObject({
      status: 'completed',
      progress: 100,
      parentMessageId: 'msg-1',
      parentToolCallId: 'tool-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:20.000Z',
      currentStepId: 'subagent-completed',
      steps: [
        expect.objectContaining({ id: 'subagent-started', status: 'completed' }),
        expect.objectContaining({
          id: `progress-${Date.parse('2026-01-01T00:00:10.000Z')}`,
          name: 'reading files',
          status: 'completed',
          message: '50% reading files',
        }),
        expect.objectContaining({ id: 'subagent-completed', status: 'completed' }),
      ],
    });
  });

  it('merges task snapshots without removing media, subagent, or linked work items', () => {
    let store: AgentWorkItemStore = new Map();
    const staleTask = backgroundTaskToWorkItem(
      createBackgroundTask('stale-task', 'Stale'),
      'conv-1',
      'tool-background-task',
    );
    const liveTask = backgroundTaskToWorkItem(
      createBackgroundTask('live-task', 'Live'),
      'conv-1',
      'tool-background-task',
    );
    const linkedTask = backgroundTaskToWorkItem(
      createBackgroundTask('linked-task', 'Linked'),
      'conv-1',
      'tool-background-task',
      { parentMessageId: 'msg-1', parentToolCallId: 'tool-1' },
    );
    const mediaTask = projectMediaTaskToWorkItem({
      conversationId: 'conv-1',
      task: {
        id: 'media-task',
        type: 'image',
        status: 'processing',
        progress: 25,
        providerId: 'provider-1',
        modelId: 'model-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        request: { prompt: 'Generate image' },
      },
    });
    const subAgent = projectSubAgentEventToWorkItem({
      type: 'started',
      subAgentId: 'subagent-task',
      parentAgentId: 'parent-a',
      conversationId: 'conv-1',
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    });

    store = upsertWorkItemsForConversation(store, 'conv-1', [
      staleTask,
      liveTask,
      linkedTask,
      mediaTask,
      subAgent,
    ]);
    store = mergeBackgroundTaskSnapshotForConversation(store, 'conv-1', [
      backgroundTaskToWorkItem(
        {
          ...createBackgroundTask('live-task', 'Live'),
          status: 'processing',
          progress: 50,
        },
        'conv-1',
        'tool-background-task',
      ),
    ]);

    const items = store.get('conv-1');
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
      parentMessageId: 'msg-1',
      parentToolCallId: 'tool-1',
    });
  });

  it('queries, replaces, and removes work items by conversation', () => {
    const task = backgroundTaskToWorkItem(
      createBackgroundTask('task-1', 'Generate cat'),
      'conv-1',
      'tool-background-task',
    );
    const other = backgroundTaskToWorkItem(
      createBackgroundTask('task-2', 'Generate dog'),
      'conv-2',
      'tool-background-task',
    );

    let store = replaceWorkItemsForConversation(new Map(), 'conv-1', [task]);
    store = upsertWorkItemsForConversation(store, 'conv-2', [other]);

    expect(getWorkItemsForConversation(store, 'conv-1')).toEqual([task]);
    expect(getBackgroundTasksForConversation(store, 'conv-1')).toEqual([task.task]);
    expect(getTaskWorkItemById(getWorkItemsForConversation(store, 'conv-1'), 'task-1')).toBe(task);
    expect(workItemToBackgroundTask(task)).toBe(task.task);

    store = removeWorkItemForConversation(store, 'conv-1', 'task-1');
    expect(getWorkItemsForConversation(store, 'conv-1')).toEqual([]);
    expect(getWorkItemsForConversation(store, 'conv-2')).toEqual([other]);

    store = removeConversationWorkItems(store, 'conv-2');
    expect(getWorkItemsForConversation(store, 'conv-2')).toEqual([]);
  });
});

function createBackgroundTask(id: string, prompt: string): AgentBackgroundTask {
  return {
    id,
    type: 'image',
    name: prompt,
    prompt,
    providerId: 'p',
    providerName: 'm',
    status: 'queued',
    progress: 0,
    createdAt: 't0',
    updatedAt: 't0',
  };
}
