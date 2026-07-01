import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MediaTurnBridge } from './mediaTurnBridge';
import type { MediaTask } from '@neko/platform';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

describe('MediaTurnBridge', () => {
  it('posts stream completion and idle phase after a direct media task reaches a terminal state', async () => {
    const created = createMediaTask({ status: 'pending', progress: 0 });
    const completed = createMediaTask({ status: 'completed', progress: 100 });
    const media = {
      generateImage: vi.fn().mockResolvedValue(created),
      getTask: vi.fn().mockResolvedValue(completed),
      onProgress: vi.fn().mockReturnValue(vi.fn()),
    };
    const webview = createWebview();
    const bridge = new MediaTurnBridge({
      platform: { media } as never,
      mediaDeliveryHost: {
        createTaskView: vi.fn(async (_webview: vscode.Webview, task: MediaTask) => ({
          id: task.id,
          type: 'image',
          status: task.status,
          progress: task.progress,
          providerId: task.providerId,
          modelId: task.modelId,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          request: { prompt: task.request.prompt },
        })),
      } as never,
      now: () => 123,
    });

    await bridge.execute({
      webview,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'openai', modelId: 'gpt-image-1', category: 'image' },
    });

    const messages = webview.postMessage.mock.calls.map((call) => call[0]);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'mediaTaskProgress',
          conversationId: 'conv-1',
          workItem: expect.objectContaining({ id: 'task-1', status: 'completed' }),
        }),
        { type: 'streamComplete', conversationId: 'conv-1', messageId: 'media-turn:task-1' },
        { type: 'agentPhase', conversationId: 'conv-1', phase: 'idle', timestamp: 123 },
      ]),
    );
  });
});

function createWebview(): vscode.Webview & {
  postMessage: ReturnType<typeof vi.fn>;
} {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: { toString(): string }) => uri),
  } as unknown as vscode.Webview & { postMessage: ReturnType<typeof vi.fn> };
}

function createMediaTask(input: {
  readonly status: MediaTask['status'];
  readonly progress: number;
}): MediaTask {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'task-1',
    type: 'text-to-image',
    status: input.status,
    progress: input.progress,
    providerId: 'openai',
    modelId: 'gpt-image-1',
    createdAt: now,
    updatedAt: now,
    request: {
      prompt: 'cat',
      metadata: { conversationId: 'conv-1' },
    },
    outputs:
      input.status === 'completed'
        ? [{ type: 'image', url: 'https://example.test/image.png', mimeType: 'image/png' }]
        : [],
  };
}
