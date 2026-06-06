import { describe, expect, it } from 'vitest';
import type { Message, ToolCall } from '@neko-agent/types';
import {
  projectMessageCancelledIntoMessages,
  projectQueuedMessageIntoMessages,
  projectStreamingCompleteIntoMessages,
  projectStreamingTextIntoMessages,
  projectStreamingThinkingIntoMessages,
  projectToolCallIntoMessages,
  projectToolConfirmationIntoMessages,
  projectToolResultIntoMessages,
  toPlanStatus,
  updatePlanStatusInMessages,
  updatePlanStepInMessages,
} from '../message-presenter';
import { projectToolResultBackfillIntoMessages } from '../tool-result-backfill-presenter';

describe('message presenter', () => {
  it('creates an assistant message when projecting a tool call without a target', () => {
    const result = projectToolCallIntoMessages({
      messages: [],
      streamingMessageId: null,
      toolCallId: 'tool-1',
      toolName: 'GenerateImage',
      arguments: { prompt: 'cat' },
      now: () => 1000,
    });

    expect(result).toMatchObject({
      updated: true,
      targetMessageId: '1000',
      streamingMessageId: '1000',
      messages: [
        {
          id: '1000',
          role: 'assistant',
          isStreaming: true,
          contentBlocks: [
            {
              id: 'block-tool-tool-1',
              type: 'tool_call',
              timestamp: 1000,
              toolCall: {
                id: 'tool-1',
                name: 'GenerateImage',
                arguments: { prompt: 'cat' },
              },
            },
          ],
          toolCalls: [
            {
              id: 'tool-1',
              name: 'GenerateImage',
              arguments: { prompt: 'cat' },
            },
          ],
        },
      ],
    });
  });

  it('projects tool results into the matching message and returns subagent work items', () => {
    const messages = createToolMessages();

    const result = projectToolResultIntoMessages({
      conversationId: 'conv-1',
      messages,
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: {
        subAgentId: 'sub-1',
        status: 'completed',
        description: 'Review implementation',
        response: 'Looks good',
      },
      now: () => 2000,
    });

    expect(result.updated).toBe(true);
    expect(result.targetMessageId).toBe('msg-1');
    expect(result.workItemIds).toEqual(['sub-1']);
    expect(result.messages).toMatchObject([
      {
        id: 'msg-1',
        workItemIds: ['sub-1'],
        contentBlocks: [
          {
            toolCall: {
              id: 'tool-1',
              pendingConfirmation: false,
              result: {
                success: true,
                data: {
                  subAgentId: 'sub-1',
                  status: 'completed',
                },
              },
            },
          },
        ],
      },
    ]);
    expect(result.workItems).toMatchObject([
      {
        id: 'sub-1',
        conversationId: 'conv-1',
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
        status: 'completed',
        progress: 100,
        subAgent: { response: 'Looks good' },
      },
    ]);
  });

  it('preserves composite artifact transfers in tool result and backfill projection', () => {
    const artifact = makeArtifactSnapshot('artifact-1', 'Draft plan');
    const blockPage = makeArtifactBlockPage('artifact-1', 'page-2');
    const summary = makeArtifactExecutionSummary('artifact-1', 'canvas.importStoryboard');
    const result = projectToolResultIntoMessages({
      messages: createToolMessages(),
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: { status: 'queued' },
      artifacts: [artifact, blockPage],
    });

    const restoredMessages = JSON.parse(JSON.stringify(result.messages)) as Message[];

    const updatedArtifact = makeArtifactSnapshot('artifact-1', 'Updated plan');
    const backfilled = projectToolResultBackfillIntoMessages({
      messages: restoredMessages,
      streamingMessageId: null,
      message: {
        type: 'toolResultBackfill',
        conversationId: 'conv-1',
        toolCallId: 'tool-1',
        dataPatch: { status: 'completed' },
        artifacts: [updatedArtifact, summary],
      },
    });

    expect(result.messages[0]?.contentBlocks?.[0]?.toolCall?.result?.artifacts).toEqual([
      artifact,
      blockPage,
    ]);
    expect(backfilled.messages[0]?.contentBlocks?.[0]?.toolCall?.result).toMatchObject({
      data: { status: 'completed' },
      artifacts: [updatedArtifact, blockPage, summary],
    });
  });

  it('merges task work item ids and appends plan blocks from tool results', () => {
    const result = projectToolResultIntoMessages({
      messages: createToolMessages({ workItemIds: ['task-existing'] }),
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: {
        backgroundMode: true,
        taskIds: ['task-1', 'task-2', 'task-1'],
      },
      plan: {
        id: 'plan-1',
        title: 'Plan',
        status: 'pending',
        steps: [{ id: 'step-1', description: 'Do it', status: 'pending' }],
      },
      now: () => 3000,
    });

    expect(result.workItemIds).toEqual(['task-1', 'task-2']);
    expect(result.messages).toMatchObject([
      {
        id: 'msg-1',
        workItemIds: ['task-existing', 'task-1', 'task-2'],
        contentBlocks: [
          {
            type: 'tool_call',
            toolCall: {
              id: 'tool-1',
              result: {
                success: true,
                data: {
                  backgroundMode: true,
                  taskIds: ['task-1', 'task-2', 'task-1'],
                },
              },
            },
          },
          {
            id: 'block-plan-plan-1',
            type: 'plan',
            timestamp: 3000,
            plan: { id: 'plan-1' },
          },
        ],
      },
    ]);
  });

  it('projects completed background task results into task work items', () => {
    const result = projectToolResultIntoMessages({
      conversationId: 'conv-1',
      messages: createToolMessages(
        {},
        {
          name: 'GenerateVideo',
          arguments: { prompt: 'Fallback prompt' },
        },
      ),
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: {
        backgroundMode: true,
        taskId: 'task-1',
        type: 'video',
        status: 'completed',
        message: 'A cinematic cat',
        routedTo: { provider: 'openai', model: 'sora' },
        urls: ['webview://video.mp4'],
        localPaths: ['/tmp/video.mp4'],
      },
      now: () => 4000,
    });

    expect(result.workItemIds).toEqual(['task-1']);
    expect(result.messages).toMatchObject([
      {
        id: 'msg-1',
        workItemIds: ['task-1'],
      },
    ]);
    expect(result.workItems).toMatchObject([
      {
        id: 'task-1',
        conversationId: 'conv-1',
        kind: 'tool-background-task',
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
        status: 'completed',
        progress: 100,
        task: {
          type: 'video',
          prompt: 'A cinematic cat',
          providerId: 'openai',
          providerName: 'sora',
          result: {
            urls: ['webview://video.mp4'],
            localPaths: ['/tmp/video.mp4'],
          },
        },
      },
    ]);
  });

  it('projects tool confirmations into the matching tool call', () => {
    const result = projectToolConfirmationIntoMessages({
      messages: createToolMessages(),
      toolCallId: 'tool-1',
      action: 'write',
      description: 'Write file',
      details: { path: 'README.md' },
    });

    expect(result).toMatchObject({
      updated: true,
      targetMessageId: 'msg-1',
      messages: [
        {
          contentBlocks: [
            {
              toolCall: {
                id: 'tool-1',
                pendingConfirmation: true,
                confirmation: {
                  action: 'write',
                  description: 'Write file',
                  details: { path: 'README.md' },
                },
              },
            },
          ],
        },
      ],
    });
  });

  it('updates plan status and step status in messages', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-plan-plan-1',
            type: 'plan',
            timestamp: 1,
            plan: {
              id: 'plan-1',
              title: 'Plan',
              status: 'pending',
              steps: [{ id: 'step-1', description: 'Do it', status: 'pending' }],
            },
          },
        ],
      },
    ];

    const withStep = updatePlanStepInMessages(messages, 'plan-1', 'step-1', {
      status: 'completed',
      description: 'Done',
    });
    const withStatus = updatePlanStatusInMessages(withStep.messages, 'plan-1', 'approved');

    expect(withStep.updated).toBe(true);
    expect(withStatus.updated).toBe(true);
    expect(withStatus.messages).toMatchObject([
      {
        contentBlocks: [
          {
            plan: {
              status: 'approved',
              steps: [{ id: 'step-1', description: 'Done', status: 'completed' }],
            },
          },
        ],
      },
    ]);
    expect(toPlanStatus('approved')).toBe('approved');
    expect(toPlanStatus('invalid')).toBeNull();
  });

  it('projects streaming text into new and existing assistant messages', () => {
    const created = projectStreamingTextIntoMessages({
      messages: [],
      streamingMessageId: null,
      content: 'Hello',
      now: () => 1000,
    });

    const appended = projectStreamingTextIntoMessages({
      messages: created.messages,
      streamingMessageId: '1000',
      content: ' world',
      now: () => 1001,
      randomId: () => 'abcde',
    });

    expect(created).toMatchObject({
      updated: true,
      targetMessageId: '1000',
      streamingMessageId: '1000',
      isThinking: false,
    });
    expect(appended).toMatchObject({
      updated: true,
      targetMessageId: '1000',
      isThinking: false,
      messages: [
        {
          id: '1000',
          content: 'Hello world',
          isStreaming: true,
          contentBlocks: [
            {
              id: 'block-1000',
              type: 'text',
              content: 'Hello world',
              isStreaming: true,
            },
          ],
        },
      ],
    });
  });

  it('projects streaming thinking into new and existing assistant messages', () => {
    const created = projectStreamingThinkingIntoMessages({
      messages: [],
      streamingMessageId: null,
      messageId: 'msg-1',
      content: 'Thinking',
      now: () => 1000,
    });

    const appended = projectStreamingThinkingIntoMessages({
      messages: created.messages,
      streamingMessageId: 'msg-1',
      content: ' more',
      now: () => 1001,
      randomId: () => 'abcde',
    });

    expect(appended).toMatchObject({
      updated: true,
      targetMessageId: 'msg-1',
      isThinking: true,
      messages: [
        {
          id: 'msg-1',
          thinking: 'Thinking more',
          isThinkingComplete: false,
          contentBlocks: [
            {
              id: 'block-thinking-msg-1',
              type: 'thinking',
              thinking: 'Thinking more',
              isThinkingComplete: false,
            },
          ],
        },
      ],
    });
  });

  it('projects stream completion and cancellation state', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello',
        timestamp: 1,
        isStreaming: true,
        contentBlocks: [
          {
            id: 'block-text',
            type: 'text',
            timestamp: 1,
            content: 'Hello',
            isStreaming: true,
          },
          {
            id: 'block-thinking',
            type: 'thinking',
            timestamp: 1,
            thinking: 'Reasoning',
            isThinkingComplete: false,
          },
        ],
      },
    ];

    const completed = projectStreamingCompleteIntoMessages({
      messages,
      streamingMessageId: 'msg-1',
    });
    const cancelled = projectMessageCancelledIntoMessages({
      messages,
      streamingMessageId: 'msg-1',
    });

    expect(completed).toMatchObject({
      updated: true,
      streamingMessageId: null,
      isThinking: false,
      messages: [
        {
          id: 'msg-1',
          isStreaming: false,
          contentBlocks: [
            { id: 'block-text', isStreaming: false },
            { id: 'block-thinking', isThinkingComplete: true },
          ],
        },
      ],
    });
    expect(cancelled).toMatchObject({
      updated: true,
      streamingMessageId: null,
      isThinking: false,
      messages: [
        {
          id: 'msg-1',
          content: 'Hello\n\n*(Cancelled)*',
          isStreaming: false,
          isCancelled: true,
        },
      ],
    });
  });

  it('projects fenced composite content into content blocks when streaming completes', () => {
    const created = projectStreamingTextIntoMessages({
      messages: [],
      streamingMessageId: null,
      messageId: 'msg-1',
      content:
        'Storyboard\n\n```neko-composite\n{"template":"storyboard-table","sections":[{"heading":"Shot 1","mediaRefs":[{"toolCallId":"read-1","assetIndex":0,"caption":"原图"}]}]}\n```',
      now: () => 1000,
    });

    const completed = projectStreamingCompleteIntoMessages({
      messages: created.messages,
      streamingMessageId: 'msg-1',
    });

    expect(completed.messages).toMatchObject([
      {
        id: 'msg-1',
        content: 'Storyboard',
        isStreaming: false,
        contentBlocks: [
          {
            id: 'block-msg-1',
            type: 'text',
            content: 'Storyboard',
            isStreaming: false,
          },
          {
            id: 'block-msg-1-composite-1',
            type: 'composite',
            composite: {
              template: 'storyboard-table',
              sections: [
                {
                  heading: 'Shot 1',
                  mediaRefs: [{ toolCallId: 'read-1', assetIndex: 0, caption: '原图' }],
                },
              ],
            },
          },
        ],
      },
    ]);
  });

  it('appends queued system messages', () => {
    expect(
      projectQueuedMessageIntoMessages({
        messages: [],
        content: 'Queued',
        now: () => 1000,
      }).messages,
    ).toEqual([
      {
        id: 'queued-1000',
        role: 'system',
        content: 'Queued',
        timestamp: 1000,
        isQueued: true,
      },
    ]);
  });
});

function createToolMessages(
  overrides: Partial<Message> = {},
  toolOverrides: Partial<ToolCall> = {},
): Message[] {
  const toolCall = {
    id: 'tool-1',
    name: 'GenerateImage',
    arguments: { prompt: 'cat' },
    ...toolOverrides,
  };
  return [
    {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [
        {
          id: 'block-tool-tool-1',
          type: 'tool_call',
          timestamp: 1,
          toolCall,
        },
      ],
      toolCalls: [toolCall],
      ...overrides,
    },
  ];
}

function makeArtifactSnapshot(artifactId: string, title: string) {
  return {
    type: 'artifactSnapshot' as const,
    complete: true,
    artifact: {
      schemaVersion: 1 as const,
      kind: 'composite-artifact' as const,
      artifactId,
      title,
      blocks: [{ blockId: 'summary', kind: 'text' as const, text: title }],
    },
  };
}

function makeArtifactBlockPage(artifactId: string, cursor: string) {
  return {
    type: 'artifactBlockPage' as const,
    artifactId,
    blocks: [{ blockId: cursor, kind: 'text' as const, text: 'Paged block' }],
    cursor,
    complete: false,
  };
}

function makeArtifactExecutionSummary(artifactId: string, actionId: string) {
  return {
    type: 'artifactExecutionSummary' as const,
    summary: {
      summaryId: `summary:${artifactId}:${actionId}`,
      artifactId,
      actionId,
      providerId: 'neko-canvas',
      status: 'succeeded' as const,
    },
  };
}
