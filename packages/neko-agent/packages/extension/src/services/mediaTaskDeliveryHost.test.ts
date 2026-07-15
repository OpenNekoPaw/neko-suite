import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MediaTaskDeliveryHost } from './mediaTaskDeliveryHost';
import { MEDIA_TASK_OUTPUT_DIR_SETTING_KEY, type MediaTask } from '@neko/platform';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

describe('MediaTaskDeliveryHost', () => {
  it('keeps generated task outputs in the media-specific runtime cache by default', async () => {
    vscode.workspace.workspaceFolders = [
      { uri: vscode.Uri.file('/workspace/demo'), name: 'demo', index: 0 },
    ];
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, fallback: unknown) => fallback),
      inspect: vi.fn(),
      update: vi.fn(),
    } as never);
    const saveOutputs = vi
      .fn()
      .mockResolvedValue(['/workspace/demo/.neko/.cache/generated/video/video.mp4']);
    const host = new MediaTaskDeliveryHost({
      platform: {
        media: {
          saveOutputs,
        },
      } as never,
      localResourceAccess: {
        toWebviewUri: vi.fn((_webview, filePath) => `webview:${filePath}`),
        toWebviewAsset: vi.fn(({ path: _path, ...asset }) => ({
          ...asset,
          renderUri: `webview:generated:${asset.id}`,
        })),
      } as never,
    });

    await host.createProgressViewDelivery(createWebview(), createCompletedVideoTask(), 'video');

    expect(saveOutputs).toHaveBeenCalledWith(
      taskScope('task-1'),
      '/workspace/demo/.neko/.cache/generated/video',
      expect.any(Object),
    );
    expect(JSON.stringify(saveOutputs.mock.calls)).not.toContain('/neko/generated/');
  });

  it('keeps completed image tasks under the generated runtime cache', async () => {
    vscode.workspace.workspaceFolders = [
      { uri: vscode.Uri.file('/workspace/demo'), name: 'demo', index: 0 },
    ];
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, fallback: unknown) => fallback),
      inspect: vi.fn(),
      update: vi.fn(),
    } as never);
    const saveOutputs = vi
      .fn()
      .mockResolvedValue(['/workspace/demo/.neko/.cache/generated/image/task-1_0.png']);
    const host = new MediaTaskDeliveryHost({
      platform: {
        media: {
          saveOutputs,
        },
      } as never,
      localResourceAccess: {
        toWebviewUri: vi.fn((_webview, filePath) => `webview:${filePath}`),
        toWebviewAsset: vi.fn(({ path: _path, ...asset }) => ({
          ...asset,
          renderUri: `webview:generated:${asset.id}`,
        })),
      } as never,
    });

    await host.createProgressViewDelivery(createWebview(), createCompletedImageTask(), 'image');

    expect(saveOutputs).toHaveBeenCalledWith(
      taskScope('task-1'),
      '/workspace/demo/.neko/.cache/generated/image',
      expect.any(Object),
    );
  });

  it('rejects legacy root, cache, and Board-local configured output directories', async () => {
    vscode.workspace.workspaceFolders = [
      { uri: vscode.Uri.file('/workspace/demo'), name: 'demo', index: 0 },
    ];
    const saveOutputs = vi
      .fn()
      .mockResolvedValue(['/workspace/demo/.neko/.cache/generated/image/task-1_0.png']);
    const host = new MediaTaskDeliveryHost({
      platform: { media: { saveOutputs } } as never,
      localResourceAccess: {
        toWebviewUri: vi.fn(),
        toWebviewAsset: vi.fn(({ path: _path, ...asset }) => ({
          ...asset,
          renderUri: `webview:generated:${asset.id}`,
        })),
      } as never,
    });

    for (const configured of [
      '/workspace/demo/generated',
      '/workspace/demo/neko/generated',
      '/workspace/demo/.neko/generated',
      '/workspace/demo/neko/boards/story-media',
    ]) {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, fallback: unknown) =>
          key === MEDIA_TASK_OUTPUT_DIR_SETTING_KEY ? configured : fallback,
        ),
        inspect: vi.fn(),
        update: vi.fn(),
      } as never);

      await host.createProgressViewDelivery(createWebview(), createCompletedImageTask(), 'image');
    }

    expect(saveOutputs).toHaveBeenCalledTimes(4);
    for (const call of saveOutputs.mock.calls) {
      expect(call[1]).toBe('/workspace/demo/.neko/.cache/generated/image');
    }
  });
});

function createWebview(): vscode.Webview {
  return {
    asWebviewUri: vi.fn((uri: { toString(): string }) => ({ toString: () => uri.toString() })),
  } as unknown as vscode.Webview;
}

function createCompletedVideoTask(): MediaTask {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    scope: taskScope('task-1'),
    id: 'task-1',
    type: 'text-to-video',
    status: 'completed',
    progress: 100,
    providerId: 'runway',
    modelId: 'gen-4',
    createdAt: now,
    updatedAt: now,
    request: { prompt: 'city flythrough', metadata: { conversationId: 'conv-1', runId: 'run-1' } },
    outputs: [{ type: 'video', url: 'https://example.test/video.mp4', mimeType: 'video/mp4' }],
  };
}

function createCompletedImageTask(): MediaTask {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    scope: taskScope('task-1'),
    id: 'task-1',
    type: 'text-to-image',
    status: 'completed',
    progress: 100,
    providerId: 'openai',
    modelId: 'gpt-image',
    createdAt: now,
    updatedAt: now,
    request: { prompt: 'cat', metadata: { conversationId: 'conv-1', runId: 'run-1' } },
    outputs: [{ type: 'image', url: 'https://example.test/image.png', mimeType: 'image/png' }],
  };
}

function taskScope(childRunId: string) {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task' as const,
  };
}
