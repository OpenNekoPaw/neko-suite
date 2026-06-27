import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MediaTaskDeliveryHost } from './mediaTaskDeliveryHost';
import type { MediaTask } from '@neko/platform';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

describe('MediaTaskDeliveryHost', () => {
  it('saves generated task outputs under the durable generated root by default', async () => {
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
      .mockResolvedValue(['/workspace/demo/neko/generated/file/video.mp4']);
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
      'task-1',
      '/workspace/demo/neko/generated/file',
      expect.any(Object),
    );
    expect(JSON.stringify(saveOutputs.mock.calls)).not.toContain('.neko/.cache/generated');
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
    id: 'task-1',
    type: 'text-to-video',
    status: 'completed',
    progress: 100,
    providerId: 'runway',
    modelId: 'gen-4',
    createdAt: now,
    updatedAt: now,
    request: { prompt: 'city flythrough' },
    outputs: [{ type: 'video', url: 'https://example.test/video.mp4', mimeType: 'video/mp4' }],
  };
}
