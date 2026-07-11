import { describe, expect, it } from 'vitest';
import type { TaskWorkItem } from '@neko-agent/types';
import { createTerminalTimelineProjector } from './timeline-projector';

describe('createTerminalTimelineProjector', () => {
  it('keeps text, tool, and later text in emitted order', () => {
    const projector = createTerminalTimelineProjector({ now: () => 1000 });

    const rows = [
      ...projector.projectEvent({ type: 'text_delta', content: 'Reading ' }),
      ...projector.projectEvent({
        type: 'tool_call',
        toolCall: { id: 'call-1', name: 'ReadFile', arguments: { path: 'brief.md' } },
      }),
      ...projector.projectEvent({
        type: 'tool_result',
        toolResult: { toolCallId: 'call-1', success: true, data: { pages: 3 } },
      }),
      ...projector.projectEvent({ type: 'text_delta', content: 'Done.' }),
      ...projector.projectEvent({ type: 'done' }),
    ];

    expect(rows.map((row) => [row.kind, row.status, row.content ?? row.toolCallId])).toEqual([
      ['assistant_text', 'streaming', 'Reading '],
      ['assistant_text', 'complete', 'Reading '],
      ['tool', 'running', 'call-1'],
      ['tool', 'success', 'call-1'],
      ['assistant_text', 'streaming', 'Done.'],
      ['assistant_text', 'complete', 'Done.'],
    ]);
    expect(rows.find((row) => row.kind === 'tool' && row.status === 'success')).toMatchObject({
      toolArguments: { path: 'brief.md' },
      toolResult: { pages: 3 },
    });
  });

  it('anchors tool failures to their originating tool call id', () => {
    const projector = createTerminalTimelineProjector({ now: () => 1000 });

    projector.projectEvent({
      type: 'tool_call',
      toolCall: { id: 'call-fail', name: 'WriteFile', arguments: { path: 'out.txt' } },
    });
    const rows = projector.projectEvent({
      type: 'tool_result',
      toolResult: {
        toolCallId: 'call-fail',
        success: false,
        data: null,
        error: 'Permission denied',
      },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'tool',
        status: 'error',
        toolCallId: 'call-fail',
        parent: { kind: 'tool', id: 'call-fail' },
        toolArguments: { path: 'out.txt' },
        toolResult: null,
        toolError: 'Permission denied',
        resultSummary: 'Permission denied',
      }),
    ]);
  });

  it('projects tool media outputs as terminal references', () => {
    const projector = createTerminalTimelineProjector({ now: () => 1000 });

    projector.projectEvent({
      type: 'tool_call',
      toolCall: { id: 'call-image', name: 'GenerateImage', arguments: { prompt: 'cat' } },
    });
    const rows = projector.projectEvent({
      type: 'tool_result',
      toolResult: {
        toolCallId: 'call-image',
        success: true,
        data: {},
        attachments: [
          {
            type: 'image',
            path: 'blob:https://neko.local/temp',
            mimeType: 'image/png',
            assetRef: {
              assetId: 'asset-image-1',
              uri: 'neko/generated/image-1.png',
              mimeType: 'image/png',
            },
          },
        ],
      },
    });

    expect(rows[0]).toMatchObject({
      kind: 'tool',
      status: 'success',
      resultSummary: expect.stringContaining('Image reference'),
    });
    expect(rows[0]?.resultSummary).toContain('asset: asset-image-1');
    expect(rows[0]?.resultSummary).toContain('file: neko/generated/image-1.png');
    expect(rows[0]?.resultSummary).not.toContain('blob:');
  });

  it('keeps structured tool facts when canonical timeline messages replace event rows', () => {
    const projector = createTerminalTimelineProjector({ now: () => 1000 });

    const rows = projector.projectMessage({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [
        {
          conversationId: 'conv-1',
          turnId: 'turn-1',
          messageId: 'msg-1',
          itemId: 'tool-call-1',
          sequence: 1,
          kind: 'tool_call',
          status: 'failed',
          parentAnchor: 'turn',
          payload: {
            toolCall: {
              id: 'call-1',
              name: 'CreateSkill',
              arguments: {
                target: 'project',
                skill: { name: 'portable-review' },
              },
              result: {
                success: false,
                data: { code: 'skill-already-exists' },
                error: 'Skill directory already exists',
              },
            },
          },
          createdAt: 1000,
          updatedAt: 1001,
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'tool',
        status: 'error',
        toolCallId: 'call-1',
        toolArguments: {
          target: 'project',
          skill: { name: 'portable-review' },
        },
        toolResult: { code: 'skill-already-exists' },
        toolError: 'Skill directory already exists',
      }),
    ]);
  });

  it('preserves structured tool facts when delayed backfill replaces a canonical row', () => {
    const projector = createTerminalTimelineProjector({ now: () => 1000 });

    projector.projectMessage({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [
        {
          conversationId: 'conv-1',
          turnId: 'turn-1',
          messageId: 'msg-1',
          itemId: 'tool-call-1',
          sequence: 1,
          kind: 'tool_call',
          status: 'complete',
          parentAnchor: 'turn',
          payload: {
            toolCall: {
              id: 'call-1',
              name: 'CreateSkill',
              arguments: { target: 'project' },
              result: {
                success: true,
                data: { code: 'created', status: 'pending' },
              },
            },
          },
          createdAt: 1000,
          updatedAt: 1001,
        },
      ],
    });

    const rows = projector.projectEvent({
      type: 'tool_result_backfill',
      toolResultBackfill: {
        toolCallId: 'call-1',
        timestamp: 1002,
        dataPatch: { status: 'completed', fingerprint: 'sha256:abc' },
      },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'tool',
        status: 'success',
        toolCallId: 'call-1',
        toolArguments: { target: 'project' },
        toolResult: {
          code: 'created',
          status: 'completed',
          fingerprint: 'sha256:abc',
        },
      }),
    ]);
  });

  it('projects task and media progress with task ids and parent identities', () => {
    const projector = createTerminalTimelineProjector({ now: () => 1000 });
    const task = createTaskWorkItem({
      id: 'task-1',
      kind: 'tool-background-task',
      parentToolCallId: 'call-2',
      title: 'Storyboard export',
      progress: 45,
      status: 'processing',
    });
    const media = createTaskWorkItem({
      id: 'media-1',
      kind: 'media-task',
      parentToolCallId: 'call-3',
      title: 'Shot render',
      progress: 80,
      status: 'processing',
    });

    const rows = [
      ...projector.projectMessage({
        type: 'taskUpdated',
        conversationId: 'conv-1',
        workItem: task,
      }),
      ...projector.projectMessage({
        type: 'mediaTaskProgress',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'call-3',
        workItem: media,
      }),
    ];

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'task',
        status: 'processing',
        taskId: 'task-1',
        taskTitle: 'Storyboard export',
        progress: 45,
        parent: { kind: 'tool', id: 'call-2' },
      }),
      expect.objectContaining({
        kind: 'media',
        status: 'processing',
        taskId: 'media-1',
        taskTitle: 'Shot render',
        progress: 80,
        parent: { kind: 'tool', id: 'call-3' },
      }),
    ]);
  });

  it('emits diagnostics for unknown required tool anchors', () => {
    const projector = createTerminalTimelineProjector({ now: () => 1000 });

    const rows = projector.projectEvent({
      type: 'tool_result',
      toolResult: {
        toolCallId: 'missing-call',
        success: true,
        data: {},
      },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'diagnostic',
        status: 'error',
        diagnosticCode: 'unknown-tool-result-anchor',
        parent: { kind: 'tool', id: 'missing-call' },
      }),
    ]);
  });

  it('emits diagnostics for invalid timeline item parent anchors', () => {
    const projector = createTerminalTimelineProjector({ now: () => 1000 });

    const rows = projector.projectMessage({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [
        {
          conversationId: 'conv-1',
          turnId: 'turn-1',
          messageId: 'msg-1',
          itemId: 'task-task-2',
          sequence: 1,
          kind: 'task',
          status: 'pending',
          parentAnchor: 'item',
          parentItemId: 'missing-item',
          payload: {
            workItem: createTaskWorkItem({
              id: 'task-2',
              kind: 'tool-background-task',
              parentToolCallId: null,
              title: 'Background export',
              progress: 10,
              status: 'queued',
            }),
          },
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'diagnostic',
        status: 'error',
        diagnosticCode: 'unknown-parent-item-anchor',
        parent: { kind: 'item', id: 'missing-item' },
      }),
    ]);
  });
});

function createTaskWorkItem(
  overrides: Pick<
    TaskWorkItem,
    'id' | 'kind' | 'parentToolCallId' | 'title' | 'progress' | 'status'
  >,
): TaskWorkItem {
  return {
    id: overrides.id,
    conversationId: 'conv-1',
    kind: overrides.kind,
    parentMessageId: 'msg-1',
    parentToolCallId: overrides.parentToolCallId,
    title: overrides.title,
    status: overrides.status,
    progress: overrides.progress,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:01.000Z',
    task: {
      id: overrides.id,
      type: overrides.kind === 'media-task' ? 'image' : 'video',
      name: overrides.title,
      prompt: overrides.title,
      providerId: 'mock',
      providerName: 'mock-model',
      status: overrides.status,
      progress: overrides.progress,
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:01.000Z',
    },
  };
}
