import { describe, expect, it } from 'vitest';
import {
  applyAgentStreamEventToState,
  createAgentStreamMessageId,
  createAgentStreamProjectionState,
  finalizeAgentStreamProjectionState,
  projectAgentStreamEventToWebviewMessages,
} from '../agent-stream-state';

describe('agent stream state reducer', () => {
  it('creates deterministic stream message ids when adapters are provided', () => {
    expect(
      createAgentStreamMessageId({
        now: () => 1000,
        randomSuffix: () => 'abc1234',
      }),
    ).toBe('msg-1000-abc1234');
  });

  it('accumulates thinking and text blocks with phase changes', () => {
    const state = createAgentStreamProjectionState();

    expect(
      applyAgentStreamEventToState(
        state,
        { type: 'thinking_content', thinking: 'Think' },
        { now: () => 100 },
      ),
    ).toEqual({ phaseChange: { phase: 'thinking', toolName: undefined } });
    applyAgentStreamEventToState(
      state,
      { type: 'thinking_content', thinking: ' more' },
      { now: () => 101 },
    );
    expect(
      applyAgentStreamEventToState(state, { type: 'text', content: 'Answer' }, { now: () => 102 }),
    ).toEqual({ phaseChange: { phase: 'streaming', toolName: undefined } });

    finalizeAgentStreamProjectionState(state);

    expect(state.accumulatedThinking).toBe('Think more');
    expect(state.accumulatedResponse).toBe('Answer');
    expect(state.contentBlocks).toEqual([
      {
        id: 'block-thinking-100',
        type: 'thinking',
        timestamp: 100,
        thinking: 'Think more',
        isThinkingComplete: true,
      },
      {
        id: 'block-text-102',
        type: 'text',
        timestamp: 102,
        content: 'Answer',
        isStreaming: false,
      },
    ]);
  });

  it('collects tool calls, finalizes text, and writes tool results back', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(state, { type: 'text', content: 'Need a file' }, { now: () => 1 });
    expect(
      applyAgentStreamEventToState(
        state,
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: { path: '/tmp/a.ts' } },
        },
        { now: () => 2 },
      ),
    ).toEqual({ phaseChange: { phase: 'acting', toolName: 'read_file' } });
    applyAgentStreamEventToState(state, {
      type: 'tool_result',
      toolResult: { toolCallId: 'tool-1', success: true, data: 'content' },
    });

    expect(state.collectedToolCalls).toEqual([
      {
        id: 'tool-1',
        name: 'read_file',
        arguments: { path: '/tmp/a.ts' },
        result: { success: true, data: 'content', error: undefined },
      },
    ]);
    expect(state.contentBlocks[0]?.isStreaming).toBe(false);
    expect(state.contentBlocks[1]?.toolCall?.result).toEqual({
      success: true,
      data: 'content',
      error: undefined,
    });
  });

  it('preserves ordinary text block spacing when finalizing', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(state, { type: 'text', content: 'First.' }, { now: () => 1 });
    applyAgentStreamEventToState(
      state,
      {
        type: 'tool_call',
        toolCall: { id: 'tool-1', name: 'read_file', arguments: {} },
      },
      { now: () => 2 },
    );
    applyAgentStreamEventToState(state, { type: 'text', content: ' Second.' }, { now: () => 3 });

    finalizeAgentStreamProjectionState(state);

    expect(state.accumulatedResponse).toBe('First. Second.');
  });

  it('finalizes fenced composite content into standalone content blocks', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(
      state,
      {
        type: 'text',
        content:
          'Storyboard\n\n```neko-composite\n{"template":"storyboard-table","sections":[{"heading":"Shot 1","mediaRefs":[{"toolCallId":"read-1","assetIndex":0}]}]}\n```',
      },
      { now: () => 10 },
    );

    finalizeAgentStreamProjectionState(state);

    expect(state.accumulatedResponse).toBe('Storyboard');
    expect(state.contentBlocks).toEqual([
      {
        id: 'block-text-10',
        type: 'text',
        timestamp: 10,
        content: 'Storyboard',
        isStreaming: false,
      },
      {
        id: 'block-text-10-composite-1',
        type: 'composite',
        timestamp: 10,
        composite: {
          template: 'storyboard-table',
          sections: [
            {
              heading: 'Shot 1',
              mediaRefs: [{ toolCallId: 'read-1', assetIndex: 0 }],
            },
          ],
        },
      },
    ]);
  });

  it('applies delayed tool result backfill to collected calls and blocks', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(
      state,
      {
        type: 'tool_call',
        toolCall: { id: 'tool-1', name: 'generate_image', arguments: { prompt: 'rain' } },
      },
      { now: () => 1 },
    );
    applyAgentStreamEventToState(state, {
      type: 'tool_result',
      toolResult: {
        toolCallId: 'tool-1',
        success: true,
        data: { taskId: 'task-1', status: 'queued', prompt: 'rain' },
      },
    });

    applyAgentStreamEventToState(state, {
      type: 'tool_result_backfill',
      toolResultBackfill: {
        toolCallId: 'tool-1',
        timestamp: 2,
        dataPatch: {
          status: 'completed',
          prompt: 'incoming should not overwrite',
          thumbnailAssetRef: {
            assetId: 'asset-1',
            uri: '${WORKSPACE}/.neko/generated/image/out.png',
            mimeType: 'image/png',
          },
        },
        perceptionCards: [
          {
            version: 1,
            assetId: 'asset-1',
            modality: 'image',
            createdAt: 2,
            layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
            structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
          },
        ],
      },
    });

    expect(state.collectedToolCalls[0]?.result).toEqual(
      expect.objectContaining({
        success: true,
        data: {
          taskId: 'task-1',
          status: 'completed',
          prompt: 'rain',
          thumbnailAssetRef: {
            assetId: 'asset-1',
            uri: '${WORKSPACE}/.neko/generated/image/out.png',
            mimeType: 'image/png',
          },
        },
        perceptionCards: [expect.objectContaining({ assetId: 'asset-1' })],
        backfillDiagnostics: [
          {
            path: 'prompt',
            reason: 'conflict',
            existing: 'rain',
            incoming: 'incoming should not overwrite',
          },
        ],
      }),
    );
    expect(state.contentBlocks[0]?.toolCall?.result).toEqual(state.collectedToolCalls[0]?.result);
  });

  it('projects plan tool results into plan content blocks', () => {
    const state = createAgentStreamProjectionState();

    const update = applyAgentStreamEventToState(
      state,
      {
        type: 'tool_result',
        toolResult: {
          toolCallId: 'tool-plan',
          success: true,
          data: {
            planMode: { status: 'awaiting_approval' },
            title: 'Refactor Auth',
            plan: '## Step 1\nDo X',
            filePath: '/tmp/plan.md',
          },
        },
      },
      { now: () => 123 },
    );

    expect(update.plan).toEqual(
      expect.objectContaining({ id: 'plan-123', title: 'Refactor Auth' }),
    );
    expect(state.contentBlocks.at(-1)).toEqual({
      id: 'block-plan-plan-123',
      type: 'plan',
      timestamp: 123,
      plan: update.plan,
    });
  });

  it('marks errors and emits idle phase changes', () => {
    const state = createAgentStreamProjectionState();
    applyAgentStreamEventToState(state, { type: 'text', content: 'partial' });

    expect(applyAgentStreamEventToState(state, { type: 'error', error: new Error('bad') })).toEqual(
      { phaseChange: { phase: 'idle', toolName: undefined } },
    );
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe('bad');
  });

  it('projects agent events to webview protocol messages', () => {
    expect(
      projectAgentStreamEventToWebviewMessages({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        event: {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: { path: 'a.ts' } },
        },
      }),
    ).toEqual([
      {
        type: 'toolCall',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        arguments: { path: 'a.ts' },
      },
    ]);

    expect(
      projectAgentStreamEventToWebviewMessages({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        event: { type: 'done', usage: { inputTokens: 20, outputTokens: 22, totalTokens: 42 } },
      }),
    ).toEqual([{ type: 'streamComplete', conversationId: 'conv-1', messageId: 'msg-1' }]);

    expect(
      projectAgentStreamEventToWebviewMessages({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        event: {
          type: 'tool_result_backfill',
          toolResultBackfill: {
            toolCallId: 'tool-1',
            timestamp: 1,
            dataPatch: { status: 'completed' },
          },
        },
      }),
    ).toEqual([
      {
        type: 'toolResultBackfill',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'tool-1',
        dataPatch: { status: 'completed' },
        attachments: undefined,
        perceptionCards: undefined,
        backfillDiagnostics: undefined,
      },
    ]);
  });
});
