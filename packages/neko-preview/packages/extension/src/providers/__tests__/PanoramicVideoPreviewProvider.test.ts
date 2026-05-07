import { describe, expect, it, vi } from 'vitest';
import type { PreviewManifest } from '@neko/shared';

vi.mock('vscode', () => {
  const Uri = {
    file: (path: string) => ({ scheme: 'file', fsPath: path, path, toString: () => path }),
    joinPath: (base: { path: string }, ...segments: string[]) => {
      const joined = [base.path, ...segments].join('/');
      return { scheme: 'file', fsPath: joined, path: joined, toString: () => joined };
    },
  };
  return { Uri };
});

vi.mock('../../utils/html', () => ({
  getWebviewHtml: vi.fn(() => '<html>video panorama</html>'),
}));

import * as vscode from 'vscode';
import { PanoramicVideoPreviewProvider } from '../PanoramicVideoPreviewProvider';
import { getWebviewHtml } from '../../utils/html';

function createManifest(): PreviewManifest {
  return {
    manifestVersion: 1,
    assetId: 'video-asset-1',
    token: 'video-asset-1',
    kind: 'video',
    status: 'stream-required',
    sourceName: 'tour_360.mp4',
    projection: { type: 'equirectangular', confidence: 'trusted-filename', source: 'filename' },
    media: {
      dimensions: { width: 3840, height: 1920 },
      fileSizeBytes: 1024,
      mimeType: 'application/octet-stream',
      dynamicRange: 'unknown',
      codec: { container: 'mp4', videoCodec: 'h264', hasAudio: true },
    },
    variants: [],
    createdAt: '2026-05-07T00:00:00.000Z',
  };
}

function createPanel() {
  let handler: ((message: Record<string, unknown>) => Promise<void>) | null = null;
  const disposeHandlers: Array<() => void> = [];
  return {
    webview: {
      options: {},
      html: '',
      onDidReceiveMessage: vi.fn((nextHandler) => {
        handler = nextHandler;
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn().mockResolvedValue(true),
    },
    onDidDispose: vi.fn((nextHandler) => {
      disposeHandlers.push(nextHandler);
      return { dispose: vi.fn() };
    }),
    get handler() {
      return handler;
    },
    disposeHandlers,
  };
}

function createStatusBar() {
  return { show: vi.fn(), hide: vi.fn(), updatePlayback: vi.fn(), dispose: vi.fn() };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('PanoramicVideoPreviewProvider', () => {
  it('registers video through manifest path and starts engine streams on play', async () => {
    const manifest = createManifest();
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
      probeMedia: vi.fn().mockResolvedValue({ hasAudio: true }),
      startVideoPlayback: vi.fn().mockResolvedValue({
        videoStreamId: 'video-stream',
        audioStreamId: 'audio-stream',
      }),
      stopStreams: vi.fn().mockResolvedValue(undefined),
      getStreamWebSocketUrl: vi.fn((id: string) => `ws://127.0.0.1:3456/v1/streams/${id}`),
    };
    const provider = new PanoramicVideoPreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);
    const panel = createPanel();

    await provider.resolveCustomEditor(
      { uri: vscode.Uri.file('/project/tour_360.mp4'), dispose: vi.fn() } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    await panel.handler?.({ type: 'ready' });
    await panel.handler?.({ type: 'preview:play' });

    expect(service.registerPreviewAsset).toHaveBeenCalledWith({
      source: '/project/tour_360.mp4',
      kind: 'video',
    });
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'preview:streamReady',
      payload: {
        streamId: 'video-stream',
        streamUrl: 'ws://127.0.0.1:3456/v1/streams/video-stream',
        audioStreamId: 'audio-stream',
        audioStreamUrl: 'ws://127.0.0.1:3456/v1/streams/audio-stream',
      },
    });
    expect(getWebviewHtml).toHaveBeenCalledWith(
      expect.objectContaining({ entry: 'panorama-video' }),
    );
  });

  it('cleans stream and manifest resources on stop and dispose', async () => {
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(createManifest()),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
      probeMedia: vi.fn().mockResolvedValue({ hasAudio: false }),
      startVideoPlayback: vi.fn().mockResolvedValue({
        videoStreamId: 'video-stream',
        audioStreamId: null,
      }),
      stopStreams: vi.fn().mockResolvedValue(undefined),
      getStreamWebSocketUrl: vi.fn((id: string) => `ws://127.0.0.1:3456/v1/streams/${id}`),
    };
    const provider = new PanoramicVideoPreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);
    const panel = createPanel();

    await provider.resolveCustomEditor(
      { uri: vscode.Uri.file('/project/tour_360.mp4'), dispose: vi.fn() } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    await panel.handler?.({ type: 'ready' });
    await panel.handler?.({ type: 'preview:play' });
    await panel.handler?.({ type: 'preview:stop' });
    panel.disposeHandlers[0]?.();
    await flushAsyncWork();

    expect(service.stopStreams).toHaveBeenCalledWith('video-stream', null);
    expect(service.unregisterPreviewAsset).toHaveBeenCalledWith('video-asset-1');
  });
});
