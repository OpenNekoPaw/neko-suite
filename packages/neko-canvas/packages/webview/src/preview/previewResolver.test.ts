import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebviewPreviewResolver } from './previewResolver';
import { setGlobalVSCodeApi } from '../utils/vscode';

let restoreWindow: (() => void) | undefined;

afterEach(() => {
  setGlobalVSCodeApi(null);
  restoreWindow?.();
  restoreWindow = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WebviewPreviewResolver', () => {
  it('uses stable preview descriptors without persisting runtime URLs', async () => {
    const resolver = new WebviewPreviewResolver();
    const source = {
      id: 'node:block',
      role: 'image' as const,
      asset: { kind: 'asset-identity' as const, path: 'asset.png' },
      variants: [{ id: 'thumb', role: 'image' as const, sourcePath: 'thumb.png' }],
    };

    const variant = await resolver.resolve({ source });

    expect(variant.runtimeUrl).toBe('thumb.png');
    expect(source.variants[0]).not.toHaveProperty('runtimeUrl');
  });

  it('returns unavailable preview when no source exists', async () => {
    const resolver = new WebviewPreviewResolver();

    const variant = await resolver.resolve({
      source: { id: 'empty', role: 'image', title: 'Missing' },
    });

    expect(variant.role).toBe('unavailable');
    expect(variant.metadata?.label).toBe('No preview source');
  });

  it('cleans up pending runtime variant requests on dispose', async () => {
    vi.useFakeTimers();
    const fakeWindow = installFakeWindow();
    const postMessage = vi.fn();
    setGlobalVSCodeApi({
      postMessage,
      getState: () => undefined,
      setState: () => {},
    });
    const resolver = new WebviewPreviewResolver();

    const promise = resolver.resolve({
      source: {
        id: 'node:video',
        role: 'video-poster',
        asset: { kind: 'asset-identity', path: 'clip.mp4', mediaType: 'video' },
      },
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview:resolveVariant' }),
    );

    resolver.dispose();

    await expect(promise).resolves.toMatchObject({
      id: 'node:video:runtime',
      runtimeUrl: undefined,
    });
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('requests panoramic FOV variants without persisting returned runtime URLs', async () => {
    vi.useFakeTimers();
    installFakeWindow();
    const postMessage = vi.fn();
    let messageHandler: ((event: MessageEvent) => void) | undefined;
    window.addEventListener = vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) => {
        messageHandler =
          typeof listener === 'function'
            ? (listener as (event: MessageEvent) => void)
            : (event: MessageEvent) => listener.handleEvent(event);
      },
    );
    setGlobalVSCodeApi({
      postMessage,
      getState: () => undefined,
      setState: () => {},
    });
    const resolver = new WebviewPreviewResolver();
    const source = {
      id: 'node:pano',
      role: 'panorama-fov-crop' as const,
      asset: { kind: 'asset-identity' as const, path: 'skybox_360.jpg', mediaType: 'image' },
    };

    const promise = resolver.resolve({ source });
    const request = postMessage.mock.calls[0]?.[0] as { requestId: string };
    messageHandler?.({
      data: {
        type: 'preview:variantResolved',
        requestId: request.requestId,
        url: 'http://127.0.0.1:3456/v1/preview/file/token',
      },
    } as MessageEvent);

    await expect(promise).resolves.toMatchObject({
      role: 'panorama-fov-crop',
      sourcePath: 'skybox_360.jpg',
      runtimeUrl: 'http://127.0.0.1:3456/v1/preview/file/token',
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:resolveVariant',
        role: 'fov-crop',
        mediaType: 'image',
      }),
    );
    expect(JSON.stringify(source)).not.toContain('127.0.0.1');
    expect(JSON.stringify(source)).not.toContain('token');
  });

  it('passes document resource refs to runtime preview resolution without storing them on asset identity', async () => {
    vi.useFakeTimers();
    installFakeWindow();
    const postMessage = vi.fn();
    setGlobalVSCodeApi({
      postMessage,
      getState: () => undefined,
      setState: () => {},
    });
    const resolver = new WebviewPreviewResolver();
    const documentResourceRef = {
      kind: 'document-entry',
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
      entryPath: 'image/page-1.jpg',
      cachePath: '/cache/page-1.jpg',
      versionPolicy: 'versioned-export',
    };

    const promise = resolver.resolve({
      source: {
        id: 'node:document-image',
        role: 'image',
        asset: { kind: 'asset-identity', uri: 'image/page-1.jpg', mediaType: 'image' },
        metadata: { documentResourceRef },
      },
    });
    const request = postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    resolver.dispose();

    expect(request).toMatchObject({
      type: 'preview:resolveVariant',
      assetPath: 'image/page-1.jpg',
      documentResourceRef,
    });
    await expect(promise).resolves.toMatchObject({ sourcePath: 'image/page-1.jpg' });
  });

  it('requests runtime previews from document resource refs without an asset path', async () => {
    vi.useFakeTimers();
    installFakeWindow();
    const postMessage = vi.fn();
    setGlobalVSCodeApi({
      postMessage,
      getState: () => undefined,
      setState: () => {},
    });
    const resolver = new WebviewPreviewResolver();
    const documentResourceRef = {
      kind: 'document-entry',
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
      entryPath: 'image/page-1.jpg',
      cachePath: '/cache/page-1.jpg',
      versionPolicy: 'versioned-export',
    };

    const promise = resolver.resolve({
      source: {
        id: 'node:shot-reference',
        role: 'image',
        metadata: { documentResourceRef },
      },
    });
    const request = postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    resolver.dispose();

    expect(request).toMatchObject({
      type: 'preview:resolveVariant',
      documentResourceRef,
    });
    expect(request).not.toHaveProperty('assetPath');
    await expect(promise).resolves.toMatchObject({
      sourcePath: undefined,
      runtimeUrl: undefined,
    });
  });
});

function installFakeWindow(): {
  removeEventListener: ReturnType<typeof vi.fn>;
} {
  const previousWindow = globalThis.window;
  const fakeWindow = {
    vscode: null,
    __vscode_api__: null,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
  });

  restoreWindow = () => {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
      return;
    }

    Object.defineProperty(globalThis, 'window', {
      value: previousWindow,
      configurable: true,
    });
  };

  return fakeWindow;
}
