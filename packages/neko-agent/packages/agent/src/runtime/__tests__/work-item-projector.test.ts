import { describe, expect, it } from 'vitest';
import type { AgentBackgroundTask, SubAgentWorkItem } from '@neko-agent/types';
import {
  isTaskWorkItem,
  projectBackgroundTaskToWorkItem,
  projectBackgroundTasksToWorkItems,
  projectMediaTaskToBackgroundTask,
  projectMediaTaskToWorkItem,
  projectSubAgentEventToWorkItem,
} from '@neko-agent/types';

describe('work-item-projector', () => {
  it('projects media tasks to background task views', () => {
    expect(
      projectMediaTaskToBackgroundTask({
        id: 'task-1',
        type: 'video',
        status: 'processing',
        progress: 42,
        providerId: 'provider-1',
        modelId: 'model-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: '2026-01-01T00:00:01.000Z',
        outputs: [{ url: 'webview://video.mp4', duration: 3 }],
        request: { prompt: 'A short cinematic scene' },
      }),
    ).toEqual({
      id: 'task-1',
      type: 'video',
      name: 'A short cinematic scene',
      prompt: 'A short cinematic scene',
      providerId: 'provider-1',
      providerName: 'model-1',
      status: 'processing',
      progress: 42,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      result: {
        urls: ['webview://video.mp4'],
        thumbnailUrl: undefined,
        width: undefined,
        height: undefined,
        duration: 3,
      },
      error: undefined,
    });
  });

  it('projects task protocol payloads to unified work items', () => {
    const task = {
      id: 'task-1',
      type: 'image' as const,
      name: 'Generate cat',
      prompt: 'cat',
      providerId: 'provider-1',
      providerName: 'model-1',
      status: 'processing' as const,
      progress: 40,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    };

    expect(
      projectBackgroundTaskToWorkItem({
        conversationId: 'conv-1',
        task,
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
      }),
    ).toMatchObject({
      id: 'task-1',
      conversationId: 'conv-1',
      kind: 'tool-background-task',
      parentMessageId: 'msg-1',
      parentToolCallId: 'tool-1',
      task,
    });

    expect(
      projectBackgroundTasksToWorkItems({
        conversationId: 'conv-1',
        tasks: [task],
      }),
    ).toHaveLength(1);
  });

  it('classifies task work items without treating subagents as tasks', () => {
    const task = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-1',
      task: createBackgroundTask('task-1', 'Generate cat'),
    });
    const subAgent = createSubAgentWorkItem('sub-1', 'tool-1');

    expect(isTaskWorkItem(task)).toBe(true);
    expect(isTaskWorkItem({ ...task, kind: 'media-task' })).toBe(true);
    expect(isTaskWorkItem(subAgent)).toBe(false);
  });

  it('prefers finalized media task result over raw provider outputs', () => {
    expect(
      projectMediaTaskToBackgroundTask({
        id: 'task-1',
        type: 'image',
        status: 'completed',
        progress: 100,
        providerId: 'provider-1',
        modelId: 'model-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        outputs: [{ url: 'https://remote.test/image.png', width: 1024, height: 1024 }],
        result: {
          urls: ['webview://local-image.png'],
          localPaths: ['/tmp/local-image.png'],
          thumbnailUrl: 'webview://local-image.png',
          creativeEntity: {
            characterIds: ['char_linxia'],
            generatedAssetIds: ['asset-1'],
            visualDrafts: [],
            requirements: [],
            bindingCandidates: [
              {
                entityId: 'char_linxia',
                entityKind: 'character',
                generatedAssetId: 'asset-1',
                roles: ['portrait', 'reference'],
              },
            ],
            actions: [
              {
                kind: 'confirm-binding',
                entityId: 'char_linxia',
                entityKind: 'character',
                generatedAssetId: 'asset-1',
                role: 'portrait',
              },
            ],
          },
          assets: [
            {
              id: 'asset-1',
              type: 'generated-image',
              path: '/tmp/local-image.png',
              webviewUri: 'webview://local-image.png',
            } as any,
          ],
        },
        request: { prompt: 'A cat' },
      }),
    ).toMatchObject({
      result: {
        urls: ['webview://local-image.png'],
        localPaths: ['/tmp/local-image.png'],
        thumbnailUrl: 'webview://local-image.png',
        creativeEntity: {
          characterIds: ['char_linxia'],
          generatedAssetIds: ['asset-1'],
          bindingCandidates: [
            {
              entityId: 'char_linxia',
              generatedAssetId: 'asset-1',
            },
          ],
          actions: [
            {
              kind: 'confirm-binding',
              role: 'portrait',
            },
          ],
        },
        assets: [
          {
            id: 'asset-1',
            webviewUri: 'webview://local-image.png',
          },
        ],
      },
    });
  });

  it('projects media task payloads directly to media work items', () => {
    const item = projectMediaTaskToWorkItem({
      conversationId: 'conv-1',
      task: {
        id: 'task-1',
        type: 'video',
        status: 'completed',
        progress: 100,
        providerId: 'provider-1',
        modelId: 'model-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        outputs: [{ url: 'webview://video.mp4', duration: 3 }],
        request: { prompt: 'A short cinematic scene' },
      },
    });

    expect(item).toMatchObject({
      id: 'task-1',
      conversationId: 'conv-1',
      kind: 'media-task',
      status: 'completed',
      result: { urls: ['webview://video.mp4'], duration: 3 },
      task: {
        type: 'video',
        providerName: 'model-1',
      },
    });
  });

  it('projects subagent events to unified work items', () => {
    expect(
      projectSubAgentEventToWorkItem({
        type: 'started',
        subAgentId: 'sub-1',
        parentAgentId: 'parent-1',
        conversationId: 'conv-1',
        data: {
          description: 'Review implementation',
          subagentType: 'reviewer',
          runMode: 'background',
          modelTier: 'fast',
          parentMessageId: 'msg-1',
          parentToolCallId: 'tool-1',
        },
        timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
      }),
    ).toMatchObject({
      id: 'sub-1',
      conversationId: 'conv-1',
      kind: 'subagent',
      parentMessageId: 'msg-1',
      parentToolCallId: 'tool-1',
      title: 'Review implementation',
      status: 'processing',
      progress: 5,
      subAgent: {
        parentAgentId: 'parent-1',
        type: 'reviewer',
        runMode: 'background',
        modelTier: 'fast',
      },
    });
  });
});

function createSubAgentWorkItem(id: string, parentToolCallId: string | null): SubAgentWorkItem {
  return {
    id,
    conversationId: 'conv-a',
    kind: 'subagent',
    parentMessageId: 'msg-a',
    parentToolCallId,
    title: id,
    status: 'processing',
    progress: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subAgent: {
      parentAgentId: 'parent-a',
    },
  };
}

function createBackgroundTask(id: string, prompt: string): AgentBackgroundTask {
  return {
    id,
    type: 'image',
    name: prompt,
    prompt,
    providerId: 'provider-1',
    providerName: 'model-1',
    status: 'completed',
    progress: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
