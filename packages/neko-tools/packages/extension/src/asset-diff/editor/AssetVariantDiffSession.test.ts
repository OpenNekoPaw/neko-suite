import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import type * as vscode from 'vscode';
import { AssetVariantDiffSession } from './AssetVariantDiffSession';
import { AssetVariantDiffSessionFactory } from './AssetVariantDiffSessionFactory';
import type { IAssetVariantDiffMessageHandler } from './AssetVariantDiffSession';
import type { VariantComparisonResult } from '@neko/shared';

function createMockDisposable() {
  return { dispose: vi.fn() };
}

function createMockWebviewPanel() {
  const receiveDisposable = createMockDisposable();
  const disposeDisposable = createMockDisposable();

  const webview = {
    onDidReceiveMessage: vi.fn().mockReturnValue(receiveDisposable),
  };

  const panel = {
    webview,
    onDidDispose: vi.fn().mockReturnValue(disposeDisposable),
  };

  return {
    panel: panel as unknown as vscode.WebviewPanel,
    webview,
    receiveDisposable,
    disposeDisposable,
  };
}

function createMockMessageHandler(): IAssetVariantDiffMessageHandler {
  return {
    initializeDiff: vi.fn().mockResolvedValue(undefined),
    handleMessage: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
}

describe('AssetVariantDiffSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should attach listeners and initialize diff', async () => {
    const { panel } = createMockWebviewPanel();
    const messageHandler = createMockMessageHandler();
    const session = new AssetVariantDiffSession(panel, messageHandler);

    session.attach(vi.fn());
    await session.start();

    expect(panel.webview.onDidReceiveMessage).toHaveBeenCalledTimes(1);
    expect(panel.onDidDispose).toHaveBeenCalledTimes(1);
    expect(messageHandler.initializeDiff).toHaveBeenCalledTimes(1);
  });

  it('should dispose listeners and handler only once', () => {
    const { panel, receiveDisposable, disposeDisposable } = createMockWebviewPanel();
    const messageHandler = createMockMessageHandler();
    const session = new AssetVariantDiffSession(panel, messageHandler);

    session.attach(vi.fn());
    session.dispose();
    session.dispose();

    expect(receiveDisposable.dispose).toHaveBeenCalledTimes(1);
    expect(disposeDisposable.dispose).toHaveBeenCalledTimes(1);
    expect(messageHandler.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('AssetVariantDiffSessionFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create session with message handler factory', async () => {
    const { panel } = createMockWebviewPanel();
    const compareVariants =
      vi.fn<
        (
          entityId: string,
          variantIdA: string,
          variantIdB: string,
        ) => Promise<VariantComparisonResult>
      >();
    const messageHandler = createMockMessageHandler();
    const createMessageHandler = vi.fn().mockReturnValue(messageHandler);
    const factory = new AssetVariantDiffSessionFactory(compareVariants, createMessageHandler);
    const entity = { id: 'entity-1' };
    const variantA = { id: 'variant-a' };
    const variantB = { id: 'variant-b' };

    const session = factory.createSession({
      webviewPanel: panel,
      entity: entity as never,
      variantA: variantA as never,
      variantB: variantB as never,
    });

    expect(createMessageHandler).toHaveBeenCalledWith({
      webview: panel.webview,
      entity,
      variantA,
      variantB,
    });

    await session.start();
    expect(messageHandler.initializeDiff).toHaveBeenCalledTimes(1);
  });
});
