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

  it('falls back when no preview source exists', async () => {
    const resolver = new WebviewPreviewResolver();

    const variant = await resolver.resolve({
      source: { id: 'empty', role: 'image', title: 'Missing' },
    });

    expect(variant.role).toBe('fallback');
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
      runtimeUrl: 'clip.mp4',
    });
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
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
