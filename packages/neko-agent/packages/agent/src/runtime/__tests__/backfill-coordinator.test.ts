import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ToolResultBackfillPayload } from '@neko/shared';
import {
  applyAgentStreamEventToState,
  createAgentStreamProjectionState,
} from '../stream/agent-stream-state';
import { BackfillCoordinator } from '../backfill-coordinator';
import { applyToolResultBackfillToChatHistory } from '../../session/working-memory';

describe('BackfillCoordinator', () => {
  it('patches active stream state and notifies webview through ports', async () => {
    const state = createAgentStreamProjectionState();
    applyAgentStreamEventToState(state, {
      type: 'tool_call',
      toolCall: { id: 'call-1', name: 'GenerateImage', arguments: { prompt: 'rain' } },
    });
    applyAgentStreamEventToState(state, {
      type: 'tool_result',
      toolResult: {
        toolCallId: 'call-1',
        success: true,
        data: { status: 'queued', taskId: 'task-1' },
      },
    });

    const postMessage = vi.fn();
    const coordinator = new BackfillCoordinator({
      stream: { state, conversationId: 'conv-1', messageId: 'msg-1' },
      webview: { postMessage },
    });

    const result = await coordinator.apply({
      toolCallId: 'call-1',
      timestamp: 1,
      dataPatch: { status: 'completed', width: 1024 },
    });

    expect(result).toMatchObject({
      streamPatched: true,
      sessionPatched: false,
      webviewNotified: true,
      diagnostics: [],
    });
    expect(state.collectedToolCalls[0]?.result?.data).toEqual({
      status: 'completed',
      taskId: 'task-1',
      width: 1024,
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'toolResultBackfill',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'call-1',
      }),
    );
  });

  it('patches ended session history through session authority port', async () => {
    const history: ChatMessage[] = [
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({ status: 'queued', taskId: 'task-1' }),
      },
    ];
    const payload: ToolResultBackfillPayload = {
      toolCallId: 'call-1',
      timestamp: 1,
      dataPatch: {
        status: 'completed',
        thumbnailAssetRef: {
          assetId: 'asset-1',
          uri: '${WORKSPACE}/thumb.png',
          mimeType: 'image/png',
        },
      },
      perceptionCards: [
        {
          version: 1,
          assetId: 'asset-1',
          modality: 'image',
          createdAt: 1,
          layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
        },
      ],
    };
    const session = {
      patchToolResult: vi.fn(async (incoming: ToolResultBackfillPayload) => ({
        patched: applyToolResultBackfillToChatHistory(history, incoming),
        eventId: 'evt-1',
      })),
    };

    const result = await new BackfillCoordinator({ session }).apply(payload);

    expect(result).toMatchObject({
      streamPatched: false,
      sessionPatched: true,
      webviewNotified: false,
      diagnostics: [],
      eventId: 'evt-1',
    });
    expect(session.patchToolResult).toHaveBeenCalledWith(payload);
    expect(JSON.parse(history[0]!.content as string)).toEqual(
      expect.objectContaining({
        schema: 'neko.tool-result.v1',
        data: expect.objectContaining({
          status: 'completed',
          taskId: 'task-1',
        }),
        perceptionCards: [expect.objectContaining({ assetId: 'asset-1' })],
      }),
    );
  });

  it('records missing tool call diagnostics when no surface patches the payload', async () => {
    const diagnostics = vi.fn();
    const result = await new BackfillCoordinator({ recordDiagnostic: diagnostics }).apply({
      toolCallId: 'missing',
      timestamp: 1,
      dataPatch: { status: 'completed' },
    });

    expect(result.diagnostics).toEqual([
      {
        path: 'missing',
        reason: 'missing-tool-call',
        incoming: {
          toolCallId: 'missing',
          timestamp: 1,
          dataPatch: { status: 'completed' },
        },
      },
    ]);
    expect(diagnostics).toHaveBeenCalledWith(result.diagnostics[0]);
  });

  it('continues notifying webview when session patching fails', async () => {
    const state = createAgentStreamProjectionState();
    applyAgentStreamEventToState(state, {
      type: 'tool_call',
      toolCall: { id: 'call-1', name: 'GenerateImage', arguments: {} },
    });
    applyAgentStreamEventToState(state, {
      type: 'tool_result',
      toolResult: { toolCallId: 'call-1', success: true, data: { status: 'queued' } },
    });
    const error = new Error('session failed');
    const postMessage = vi.fn();

    const result = await new BackfillCoordinator({
      stream: { state, conversationId: 'conv-1', messageId: 'msg-1' },
      session: {
        patchToolResult: vi.fn(async () => {
          throw error;
        }),
      },
      webview: { postMessage },
    }).apply({
      toolCallId: 'call-1',
      timestamp: 1,
      dataPatch: { status: 'completed' },
    });

    expect(result).toMatchObject({
      streamPatched: true,
      sessionPatched: false,
      webviewNotified: true,
      diagnostics: [],
      errors: [error],
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toolResultBackfill' }),
    );
  });

  it('keeps stream/session patches when webview notification fails', async () => {
    const state = createAgentStreamProjectionState();
    applyAgentStreamEventToState(state, {
      type: 'tool_call',
      toolCall: { id: 'call-1', name: 'GenerateImage', arguments: {} },
    });
    applyAgentStreamEventToState(state, {
      type: 'tool_result',
      toolResult: { toolCallId: 'call-1', success: true, data: { status: 'queued' } },
    });
    const history: ChatMessage[] = [
      { role: 'tool', toolCallId: 'call-1', content: JSON.stringify({ status: 'queued' }) },
    ];
    const error = new Error('webview failed');

    const result = await new BackfillCoordinator({
      stream: { state, conversationId: 'conv-1', messageId: 'msg-1' },
      session: {
        patchToolResult: vi.fn(async (incoming) => ({
          patched: applyToolResultBackfillToChatHistory(history, incoming),
        })),
      },
      webview: {
        postMessage: vi.fn(async () => {
          throw error;
        }),
      },
    }).apply({
      toolCallId: 'call-1',
      timestamp: 1,
      dataPatch: { status: 'completed' },
    });

    expect(result).toMatchObject({
      streamPatched: true,
      sessionPatched: true,
      webviewNotified: false,
      diagnostics: [],
      errors: [error],
    });
    expect(JSON.parse(history[0]!.content as string)).toEqual({
      schema: 'neko.tool-result.v1',
      success: true,
      data: { status: 'completed' },
    });
  });
});
