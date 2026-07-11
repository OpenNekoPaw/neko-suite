import { describe, expect, it } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineErrorItem,
  AgentTurnTimelineItem,
  AgentTurnTimelineMediaItem,
  AgentTurnTimelineMessage,
  AgentTurnTimelineTaskItem,
  AgentTurnTimelineToolCallItem,
  TaskWorkItem,
} from '@neko-agent/types';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import {
  applyAgentTurnTimelineMessage,
  completeActiveTurnTimeline,
  projectMessagesWithActiveTurnTimeline,
} from '../active-turn-timeline-presenter';
import { projectMarkdownResourceRendering } from '../markdown-resource-rendering-presenter';

describe('active turn timeline presenter', () => {
  it('applies append literally without cumulative-prefix inference', () => {
    const initial = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([textItem('text-1', 1, 'a')]),
    }).state;
    const appended = applyAgentTurnTimelineMessage({
      state: initial,
      message: timelineMessage(
        [
          {
            ...textItem('text-1', 1, 'abc'),
            itemRevision: 2,
          },
        ],
        { deliveryRevision: 2 },
      ),
    });

    expect(appended.diagnostics).toEqual([]);
    expect(appended.state?.items[0]?.payload).toMatchObject({ content: 'aabc' });
  });

  it('does not apply duplicate or gapped delivery revisions', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([textItem('text-1', 1, 'a')]),
    }).state;
    const duplicate = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage([{ ...textItem('text-1', 1, 'b'), itemRevision: 2 }], {
        deliveryRevision: 1,
      }),
    });
    const gap = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage([{ ...textItem('text-1', 1, 'c'), itemRevision: 2 }], {
        deliveryRevision: 3,
      }),
    });

    expect(duplicate.state).toBe(active);
    expect(duplicate.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'duplicate-delivery-revision' })]),
    );
    expect(gap.state).toBe(active);
    expect(gap.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'delivery-revision-gap' })]),
    );
  });

  it('recovers from an authoritative snapshot and continues at the next revision', () => {
    const snapshot = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([{ ...textItem('text-1', 1, 'authoritative'), itemRevision: 5 }], {
        deliveryRevision: 7,
        operation: 'snapshot',
        batchKind: 'snapshot',
      }),
    });
    const appended = applyAgentTurnTimelineMessage({
      state: snapshot.state,
      message: timelineMessage(
        [
          {
            ...textItem('text-1', 1, '!'),
            itemRevision: 6,
          },
        ],
        { deliveryRevision: 8 },
      ),
    });

    expect(snapshot.diagnostics).toEqual([]);
    expect(appended.diagnostics).toEqual([]);
    expect(appended.state?.items[0]?.payload).toMatchObject({ content: 'authoritative!' });
  });
  it('renders text, tool, and later text in sequence order', () => {
    const result = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, 'Before.'),
        toolItem('tool-item-1', 2, 'tool-1'),
        textItem('text-2', 3, ' After.'),
      ]),
    });
    const messages = projectMessagesWithActiveTurnTimeline([], result.state);

    expect(result.diagnostics).toEqual([]);
    expect(messages[0]?.contentBlocks).toMatchObject([
      { id: 'text-1', type: 'text', content: 'Before.' },
      {
        id: 'tool-item-1',
        type: 'tool_call',
        toolCall: { id: 'tool-1', name: 'ReadDocument' },
      },
      { id: 'text-2', type: 'text', content: ' After.' },
    ]);
  });

  it('does not reorder active timeline items when final content blocks arrive', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, 'Before.'),
        toolItem('tool-item-1', 2, 'tool-1'),
        textItem('text-2', 3, ' After.'),
      ]),
    }).state;
    const completed = completeActiveTurnTimeline(active, {
      finalContentBlocks: [
        { id: 'text-1', type: 'text', timestamp: 1, content: 'Before.', isStreaming: false },
        { id: 'text-2', type: 'text', timestamp: 3, content: ' After.', isStreaming: false },
        {
          id: 'tool-item-1',
          type: 'tool_call',
          timestamp: 2,
          toolCall: { id: 'tool-1', name: 'ReadDocument', arguments: {} },
        },
      ],
    });
    const messages = projectMessagesWithActiveTurnTimeline([], completed);

    expect(messages[0]?.isStreaming).toBe(false);
    expect(messages[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'text-1',
      'tool-item-1',
      'text-2',
    ]);
  });

  it('uses final projected tool result blocks while preserving timeline order', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, '| scene | source |\n| --- | --- |\n| A | P1 |'),
        toolItem('tool-item-1', 2, 'tool-1'),
      ]),
    }).state;
    const completed = completeActiveTurnTimeline(active, {
      finalContentBlocks: [
        {
          id: 'text-1',
          type: 'text',
          timestamp: 1,
          content: '| scene | source |\n| --- | --- |\n| A | P1 |',
          isStreaming: false,
        },
        {
          id: 'tool-item-1',
          type: 'tool_call',
          timestamp: 2,
          toolCall: {
            id: 'tool-1',
            name: 'ReadImage',
            arguments: {},
            result: {
              success: true,
              data: {
                images: [
                  {
                    alias: 'P1',
                    renderUri: 'vscode-webview://page-1',
                  },
                ],
              },
            },
          },
        },
      ],
    });

    const messages = projectMessagesWithActiveTurnTimeline([], completed);

    expect(messages[0]?.contentBlocks?.map((block) => block.id)).toEqual(['text-1', 'tool-item-1']);
    expect(messages[0]?.contentBlocks?.[1]?.toolCall?.result?.data).toEqual({
      images: [
        {
          alias: 'P1',
          renderUri: 'vscode-webview://page-1',
        },
      ],
    });
  });

  it('keeps a tool item in its original position when the result update arrives later', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, 'Before.'),
        toolItem('tool-item-1', 2, 'tool-1'),
        textItem('text-2', 3, ' After.'),
      ]),
    }).state;
    const updated = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage(
        [
          {
            ...toolItem('tool-item-1', 2, 'tool-1'),
            itemRevision: 2,
            status: 'succeeded',
            payload: {
              toolCall: {
                id: 'tool-1',
                name: 'ReadDocument',
                arguments: {},
                result: { success: true, data: { title: 'Book' } },
              },
            },
          },
        ],
        { deliveryRevision: 2 },
      ),
    });
    const messages = projectMessagesWithActiveTurnTimeline([], updated.state);

    expect(messages[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'text-1',
      'tool-item-1',
      'text-2',
    ]);
    expect(messages[0]?.contentBlocks?.[1]?.toolCall?.result).toMatchObject({
      success: true,
      data: { title: 'Book' },
    });
  });

  it('keeps concurrent tool results in call order when results arrive out of order', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, 'Before.'),
        toolItem('tool-item-a', 2, 'tool-a'),
        toolItem('tool-item-b', 3, 'tool-b'),
        textItem('text-2', 4, ' After.'),
      ]),
    }).state;
    const withToolBResult = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage(
        [
          {
            ...toolItem('tool-item-b', 3, 'tool-b'),
            itemRevision: 2,
            status: 'succeeded',
            createdAt: 3,
            updatedAt: 10,
            payload: {
              toolCall: {
                id: 'tool-b',
                name: 'ReadDocument',
                arguments: {},
                result: { success: true, data: { title: 'B' } },
              },
            },
          },
        ],
        { deliveryRevision: 2 },
      ),
    }).state;
    const withToolAResult = applyAgentTurnTimelineMessage({
      state: withToolBResult,
      message: timelineMessage(
        [
          {
            ...toolItem('tool-item-a', 2, 'tool-a'),
            itemRevision: 2,
            status: 'failed',
            createdAt: 2,
            updatedAt: 11,
            payload: {
              toolCall: {
                id: 'tool-a',
                name: 'ReadDocument',
                arguments: {},
                result: { success: false, data: null, error: 'A failed' },
              },
            },
          },
        ],
        { deliveryRevision: 3 },
      ),
    });
    const messages = projectMessagesWithActiveTurnTimeline([], withToolAResult.state);

    expect(messages[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'text-1',
      'tool-item-a',
      'tool-item-b',
      'text-2',
    ]);
    expect(messages[0]?.contentBlocks?.[1]?.toolCall?.result).toMatchObject({
      success: false,
      error: 'A failed',
    });
    expect(messages[0]?.contentBlocks?.[2]?.toolCall?.result).toMatchObject({
      success: true,
      data: { title: 'B' },
    });
    expect(
      withToolAResult.state?.items.find((item) => item.itemId === 'tool-item-a'),
    ).toMatchObject({
      sequence: 2,
      createdAt: 2,
      updatedAt: 11,
    });
    expect(
      withToolAResult.state?.items.find((item) => item.itemId === 'tool-item-b'),
    ).toMatchObject({
      sequence: 3,
      createdAt: 3,
      updatedAt: 10,
    });
  });

  it('anchors task and media work items to their parent tool item', () => {
    const result = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        toolItem('tool-item-1', 1, 'tool-1'),
        taskItem('task-item-1', 2, 'tool-1', 'task-1'),
        mediaItem('media-item-1', 3, 'tool-1', 'media-1'),
      ]),
    });
    const messages = projectMessagesWithActiveTurnTimeline([], result.state);
    const toolCall = messages[0]?.contentBlocks?.[0]?.toolCall;

    expect(messages[0]?.workItemIds).toEqual(['task-1', 'media-1']);
    expect(toolCall?.result).toBeUndefined();
  });

  it('keeps delayed task progress at the original tool-owned placement', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, 'Before.'),
        toolItem('tool-item-1', 2, 'tool-1'),
        taskItem('tool-background-task-task-1', 3, 'tool-1', 'task-1'),
        textItem('text-2', 4, ' After.'),
      ]),
    }).state;

    expect(active).not.toBeNull();
    const updated = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage(
        [
          {
            ...taskItem('tool-background-task-task-1', 3, 'tool-1', 'task-1'),
            itemRevision: 2,
            status: 'succeeded',
            payload: {
              workItem: workItem('task-1', 'tool-background-task', 'tool-1', {
                status: 'completed',
                progress: 100,
              }),
            },
            updatedAt: 10,
          },
        ],
        { deliveryRevision: 2 },
      ),
    });
    const messages = projectMessagesWithActiveTurnTimeline([], updated.state);

    expect(messages[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'text-1',
      'tool-item-1',
      'text-2',
    ]);
    expect(messages[0]?.workItemIds).toEqual(['task-1']);
    expect(
      updated.state?.items.find((item) => item.itemId === 'tool-background-task-task-1'),
    ).toMatchObject({
      sequence: 3,
      parentToolCallId: 'tool-1',
      payload: {
        workItem: {
          id: 'task-1',
          status: 'completed',
          progress: 100,
          parentToolCallId: 'tool-1',
        },
      },
    });
  });

  it('renders a failed tool result immediately at the failing tool item', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, 'Before.'),
        toolItem('tool-item-1', 2, 'tool-1'),
        textItem('text-2', 3, ' After.'),
      ]),
    }).state;

    expect(active).not.toBeNull();
    const updated = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage(
        [
          {
            ...toolItem('tool-item-1', 2, 'tool-1'),
            itemRevision: 2,
            status: 'failed',
            payload: {
              toolCall: {
                id: 'tool-1',
                name: 'ReadDocument',
                arguments: {},
                result: {
                  success: false,
                  data: null,
                  error: 'Read failed',
                },
              },
            },
          },
        ],
        { deliveryRevision: 2 },
      ),
    });
    const messages = projectMessagesWithActiveTurnTimeline([], updated.state);

    expect(messages[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'text-1',
      'tool-item-1',
      'text-2',
    ]);
    expect(messages[0]?.contentBlocks?.[1]?.toolCall?.result).toMatchObject({
      success: false,
      error: 'Read failed',
    });
  });

  it('keeps complex interleaved turn order through failure, retry, media, and completion', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-before', 1, 'Before.'),
        toolItem('tool-read', 2, 'tool-read'),
        textItem('text-after-read', 3, ' After read.'),
        {
          ...toolItem('tool-failed', 4, 'tool-failed'),
          status: 'failed',
          payload: {
            toolCall: {
              id: 'tool-failed',
              name: 'ReadDocument',
              arguments: {},
              result: { success: false, data: null, error: 'Read failed' },
            },
          },
        },
        {
          ...toolItem('tool-retry', 5, 'tool-retry'),
          status: 'succeeded',
          payload: {
            toolCall: {
              id: 'tool-retry',
              name: 'ReadDocument',
              arguments: {},
              result: { success: true, data: { title: 'Recovered' } },
            },
          },
        },
        mediaItem('media-retry-result', 6, 'tool-retry', 'media-retry'),
        textItem('text-final', 7, ' Final answer.'),
      ]),
    }).state;
    const completed = completeActiveTurnTimeline(active, {
      finalContentBlocks: [
        { id: 'text-before', type: 'text', timestamp: 1, content: 'Before.', isStreaming: false },
        {
          id: 'text-after-read',
          type: 'text',
          timestamp: 3,
          content: ' After read.',
          isStreaming: false,
        },
        {
          id: 'text-final',
          type: 'text',
          timestamp: 7,
          content: ' Final answer.',
          isStreaming: false,
        },
        {
          id: 'tool-read',
          type: 'tool_call',
          timestamp: 2,
          toolCall: { id: 'tool-read', name: 'ReadDocument', arguments: {} },
        },
      ],
    });
    const messages = projectMessagesWithActiveTurnTimeline([], completed);

    expect(messages[0]?.isStreaming).toBe(false);
    expect(messages[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'text-before',
      'tool-read',
      'text-after-read',
      'tool-failed',
      'tool-retry',
      'text-final',
    ]);
    expect(messages[0]?.workItemIds).toEqual(['media-retry']);
    expect(messages[0]?.contentBlocks?.[3]?.toolCall?.result).toMatchObject({
      success: false,
      error: 'Read failed',
    });
    expect(messages[0]?.contentBlocks?.[4]?.toolCall).toMatchObject({
      id: 'tool-retry',
      result: {
        success: true,
        data: { title: 'Recovered', taskId: 'media-retry', taskIds: ['media-retry'] },
      },
    });
    expect(completed?.items.find((item) => item.itemId === 'media-retry-result')).toMatchObject({
      parentAnchor: 'tool_call',
      parentToolCallId: 'tool-retry',
    });
  });

  it('renders timeline errors at their sequence position', () => {
    const result = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, 'Before.'),
        errorItem('error-1', 2, 'Read failed'),
        textItem('text-2', 3, ' After.'),
      ]),
    });
    const messages = projectMessagesWithActiveTurnTimeline([], result.state);

    expect(messages[0]?.contentBlocks).toMatchObject([
      { id: 'text-1', content: 'Before.' },
      { id: 'error-1', content: 'Error: Read failed' },
      { id: 'text-2', content: ' After.' },
    ]);
  });

  it('keeps streamed assistant text visible when storyboard validation fails', () => {
    const streamedTable = '| 镜号 | 画面内容 |\n| --- | --- |\n| 1 | bad |';
    const result = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, streamedTable),
        {
          ...errorItem('error-1', 2, 'Storyboard table invalid'),
          payload: {
            message: 'Storyboard table invalid',
            code: 'storyboard-table-forbidden-header',
          },
        },
      ]),
    });
    const completed = completeActiveTurnTimeline(result.state, {
      finalContentBlocks: [
        {
          id: 'text-1',
          type: 'text',
          timestamp: 1,
          content: streamedTable,
          isStreaming: false,
        },
      ],
    });
    const messages = projectMessagesWithActiveTurnTimeline([], completed);

    expect(messages[0]?.content).toBe(`${streamedTable}Error: Storyboard table invalid`);
    expect(messages[0]?.contentBlocks).toEqual([
      expect.objectContaining({
        id: 'text-1',
        type: 'text',
        content: streamedTable,
      }),
      expect.objectContaining({
        id: 'error-1',
        type: 'text',
        content: 'Error: Storyboard table invalid',
      }),
    ]);
  });

  it('replaces an assistant text item during internal validation retry', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([textItem('text-1', 1, 'invalid table')]),
    }).state;
    const replaced = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage(
        [
          {
            ...textItem('text-1', 1, ''),
            itemRevision: 2,
            payload: { content: '', format: 'markdown', sourceGeneration: 2 },
          },
        ],
        { deliveryRevision: 2, operation: 'replace' },
      ),
    }).state;
    const repaired = applyAgentTurnTimelineMessage({
      state: replaced,
      message: timelineMessage(
        [
          {
            ...textItem('text-1', 1, 'fixed table'),
            itemRevision: 3,
            payload: { content: 'fixed table', format: 'markdown', sourceGeneration: 2 },
          },
        ],
        { deliveryRevision: 3 },
      ),
    }).state;
    const completed = completeActiveTurnTimeline(repaired, {
      finalContentBlocks: [
        {
          id: 'text-1',
          type: 'text',
          timestamp: 1,
          content: 'fixed table',
          isStreaming: false,
        },
      ],
    });
    const messages = projectMessagesWithActiveTurnTimeline([], completed);

    expect(messages[0]?.content).toBe('fixed table');
    expect(messages[0]?.contentBlocks).toEqual([
      expect.objectContaining({
        id: 'text-1',
        type: 'text',
        content: 'fixed table',
      }),
    ]);
  });

  it('keeps earlier tool resource context available after validation retry replacement', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        toolItem('tool-read-image', 1, 'read-image'),
        textItem('text-1', 2, '| scene | source |\n| --- | --- |\n| A | P9 |'),
      ]),
    }).state;
    const replaced = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage(
        [
          {
            ...textItem('text-1', 2, ''),
            itemRevision: 2,
            payload: { content: '', format: 'markdown', sourceGeneration: 2 },
          },
        ],
        { deliveryRevision: 2, operation: 'replace' },
      ),
    }).state;
    const repairedMarkdown = '| scene | source |\n| --- | --- |\n| A | P1 |';
    const repaired = applyAgentTurnTimelineMessage({
      state: replaced,
      message: timelineMessage(
        [
          {
            ...textItem('text-1', 2, repairedMarkdown),
            itemRevision: 3,
            payload: { content: repairedMarkdown, format: 'markdown', sourceGeneration: 2 },
          },
        ],
        { deliveryRevision: 3 },
      ),
    }).state;
    const completed = completeActiveTurnTimeline(repaired, {
      finalContentBlocks: [
        {
          id: 'tool-read-image',
          type: 'tool_call',
          timestamp: 1,
          toolCall: {
            id: 'read-image',
            name: 'ReadImage',
            arguments: {},
            result: {
              success: true,
              data: {
                imageInfo: [
                  {
                    label: 'Page 1',
                    alias: 'P1',
                    renderUri: 'vscode-webview://page-1',
                    resourceRef: createResourceRef({
                      id: 'page-1',
                      scope: 'project',
                      provider: 'read-image',
                      kind: 'media',
                      source: { kind: 'file', projectRelativePath: 'images/page-1.jpg' },
                      locator: { kind: 'file', path: 'images/page-1.jpg' },
                      fingerprint: createResourceFingerprint({
                        strategy: 'provider',
                        value: 'page-1',
                      }),
                    }),
                  },
                ],
              },
            },
          },
        },
        {
          id: 'text-1',
          type: 'text',
          timestamp: 2,
          content: repairedMarkdown,
          isStreaming: false,
        },
      ],
    });
    const messages = projectMessagesWithActiveTurnTimeline([], completed);
    const textBlock = messages[0]?.contentBlocks?.find((block) => block.type === 'text');

    const projection = projectMarkdownResourceRendering({
      markdown: textBlock?.content ?? '',
      siblingBlocks: messages[0]?.contentBlocks,
    });

    expect(messages[0]?.contentBlocks?.map((block) => block.id)).toEqual([
      'tool-read-image',
      'text-1',
    ]);
    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
        renderUris: ['vscode-webview://page-1'],
      }),
    ]);
  });

  it('returns diagnostics and preserves state for invalid timeline messages', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([textItem('text-1', 1, 'Before.')]),
    }).state;
    const result = applyAgentTurnTimelineMessage({
      state: active,
      message: {
        type: 'agentTurnTimeline',
        schemaVersion: 2,
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-1',
        turnId: 'turn-1',
        messageId: 'msg-1',
        batchKind: 'delta',
        deliveryRevision: 2,
        operations: [
          {
            operation: 'upsert',
            item: parentlessTaskItem('task-1', 2, 'task-1'),
          },
        ],
      },
    });

    expect(result.state).toBe(active);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-parent-anchor',
          itemId: 'task-1',
        }),
      ]),
    );
  });

  it('rejects cross-message duplicate item ids that change item kind', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([textItem('shared-item', 1, 'Before.')]),
    }).state;
    const result = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage([{ ...toolItem('shared-item', 1, 'tool-1'), itemRevision: 2 }], {
        deliveryRevision: 2,
      }),
    });

    expect(result.state).toBe(active);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate-item-id',
          itemId: 'shared-item',
        }),
      ]),
    );
  });

  it('rejects unknown parent anchors before merging timeline state', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([toolItem('tool-item-1', 1, 'tool-1')]),
    }).state;
    const result = applyAgentTurnTimelineMessage({
      state: active,
      message: timelineMessage([taskItem('task-item-1', 2, 'missing-tool', 'task-1')], {
        deliveryRevision: 2,
      }),
    });

    expect(result.state).toBe(active);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-parent-anchor',
          itemId: 'task-item-1',
        }),
      ]),
    );
  });

  it('marks open streamed text and thinking items complete when the active timeline completes', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem('text-1', 1, 'Before.'),
        {
          conversationId: 'conv-1',
          turnId: 'turn-1',
          messageId: 'msg-1',
          itemId: 'thinking-2',
          sequence: 2,
          itemRevision: 1,
          kind: 'thinking',
          status: 'streaming',
          payload: { content: 'Reasoning', sourceGeneration: 1 },
          createdAt: 2,
          updatedAt: 2,
        },
      ]),
    }).state;
    const completed = completeActiveTurnTimeline(active);
    const messages = projectMessagesWithActiveTurnTimeline([], completed);

    expect(completed?.items.map((item) => item.status)).toEqual(['complete', 'complete']);
    expect(messages[0]?.contentBlocks).toMatchObject([
      { id: 'text-1', isStreaming: false },
      { id: 'thinking-2', isThinkingComplete: true },
    ]);
  });

  it('keeps incomplete structured payloads as text until timeline completion extracts composites', () => {
    const active = applyAgentTurnTimelineMessage({
      state: null,
      message: timelineMessage([
        textItem(
          'text-1',
          1,
          `Draft:

\`\`\`neko-composite
{
  "template": "gallery",
  "sections": [
    { "heading": "Shot", "mediaRefs": [{ "toolCallId": "tool-1" }] }
  ]
}
\`\`\``,
        ),
      ]),
    }).state;
    const streamingMessages = projectMessagesWithActiveTurnTimeline([], active);
    const completedMessages = projectMessagesWithActiveTurnTimeline(
      [],
      completeActiveTurnTimeline(active),
    );

    expect(streamingMessages[0]?.contentBlocks).toMatchObject([
      {
        id: 'text-1',
        type: 'text',
        isStreaming: true,
        content: expect.stringContaining('```neko-composite'),
      },
    ]);
    expect(completedMessages[0]?.contentBlocks).toMatchObject([
      { id: 'text-1', type: 'text', isStreaming: false, content: 'Draft:' },
      {
        id: 'text-1-composite-1',
        type: 'composite',
        composite: {
          template: 'gallery',
          sections: [
            {
              heading: 'Shot',
              mediaRefs: [{ toolCallId: 'tool-1' }],
            },
          ],
        },
      },
    ]);
  });
});

function timelineMessage(
  items: readonly AgentTurnTimelineItem[],
  options: {
    readonly deliveryRevision?: number;
    readonly operation?: 'append' | 'replace' | 'snapshot' | 'upsert';
    readonly batchKind?: 'delta' | 'snapshot';
  } = {},
): AgentTurnTimelineMessage {
  return {
    type: 'agentTurnTimeline',
    schemaVersion: 2,
    connectionEpoch: 'epoch-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    batchKind: options.batchKind ?? 'delta',
    deliveryRevision: options.deliveryRevision ?? 1,
    operations: items.map((item) => ({
      operation:
        options.operation ??
        (item.kind === 'assistant_text' || item.kind === 'thinking' ? 'append' : 'upsert'),
      item,
    })) as AgentTurnTimelineMessage['operations'],
  };
}

function textItem(
  itemId: string,
  sequence: number,
  content: string,
): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
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

function toolItem(
  itemId: string,
  sequence: number,
  toolCallId: string,
): AgentTurnTimelineToolCallItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'tool_call',
    status: 'pending',
    payload: {
      toolCall: {
        id: toolCallId,
        name: 'ReadDocument',
        arguments: {},
      },
    },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function taskItem(
  itemId: string,
  sequence: number,
  parentToolCallId: string | undefined,
  workItemId: string,
): AgentTurnTimelineTaskItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'task',
    status: 'pending',
    ...(parentToolCallId
      ? { parentAnchor: 'tool_call' as const, parentToolCallId }
      : { parentAnchor: 'turn' as const }),
    payload: {
      workItem: workItem(workItemId, 'tool-background-task', parentToolCallId),
    },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function mediaItem(
  itemId: string,
  sequence: number,
  parentToolCallId: string,
  workItemId: string,
): AgentTurnTimelineMediaItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'media',
    status: 'pending',
    parentAnchor: 'tool_call',
    parentToolCallId,
    payload: {
      workItem: workItem(workItemId, 'media-task', parentToolCallId),
    },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function parentlessTaskItem(
  itemId: string,
  sequence: number,
  workItemId: string,
): Omit<AgentTurnTimelineTaskItem, 'parentAnchor' | 'parentItemId' | 'parentToolCallId'> {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId,
    sequence,
    itemRevision: 1,
    kind: 'task',
    status: 'pending',
    payload: {
      workItem: workItem(workItemId, 'tool-background-task', undefined),
    },
    createdAt: sequence,
    updatedAt: sequence,
  };
}

function errorItem(itemId: string, sequence: number, message: string): AgentTurnTimelineErrorItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
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

function workItem(
  id: string,
  kind: 'media-task' | 'tool-background-task',
  parentToolCallId: string | undefined,
  overrides: Partial<TaskWorkItem> = {},
) {
  return {
    id,
    conversationId: 'conv-1',
    kind,
    parentMessageId: 'msg-1',
    parentToolCallId: parentToolCallId ?? null,
    title: id,
    status: 'processing' as const,
    progress: 10,
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:01.000Z',
    task: {
      id,
      type: 'image' as const,
      name: id,
      prompt: id,
      providerId: 'local',
      providerName: 'Neko',
      status: 'processing' as const,
      progress: 10,
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:01.000Z',
      ...overrides.task,
    },
    ...overrides,
  };
}
