import * as vscode from 'vscode';
import type { AssetEntity, AssetVariant } from '@neko/shared';

export interface IAssetVariantDiffMessageHandler extends vscode.Disposable {
  initializeDiff(): Promise<void>;
  handleMessage(message: unknown): Promise<void>;
}

export interface IAssetVariantDiffSession extends vscode.Disposable {
  attach(onDidDispose: () => void): void;
  start(): Promise<void>;
}

export interface IAssetVariantDiffSessionOptions {
  webviewPanel: vscode.WebviewPanel;
  entity: AssetEntity;
  variantA: AssetVariant;
  variantB: AssetVariant;
}

export interface IAssetVariantDiffSessionFactory {
  createSession(options: IAssetVariantDiffSessionOptions): IAssetVariantDiffSession;
}

export class AssetVariantDiffSession implements IAssetVariantDiffSession {
  private readonly disposables: vscode.Disposable[] = [];
  private isAttached = false;
  private isDisposed = false;

  constructor(
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly messageHandler: IAssetVariantDiffMessageHandler,
  ) {}

  attach(onDidDispose: () => void): void {
    if (this.isDisposed || this.isAttached) {
      return;
    }

    this.isAttached = true;
    this.disposables.push(
      this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
        await this.messageHandler.handleMessage(message);
      }),
      this.webviewPanel.onDidDispose(() => {
        onDidDispose();
        this.dispose();
      }),
    );
  }

  async start(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    await this.messageHandler.initializeDiff();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }

    this.messageHandler.dispose();
  }
}
