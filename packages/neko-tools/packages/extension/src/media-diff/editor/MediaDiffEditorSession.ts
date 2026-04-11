import * as vscode from 'vscode';
import type { MediaDiffRequest } from '@neko/shared';

export interface IMediaDiffEditorMessageHandler extends vscode.Disposable {
  initializeDiff(ref?: string): Promise<void>;
  handleMessage(message: MediaDiffRequest): Promise<void>;
}

export interface IMediaDiffEditorSession extends vscode.Disposable {
  attach(onDidDispose: () => void): void;
  start(requiresRecompare?: boolean): Promise<void>;
}

export interface IMediaDiffEditorSessionOptions {
  webviewPanel: vscode.WebviewPanel;
  documentUri: vscode.Uri;
  previousUri?: vscode.Uri;
}

export interface IMediaDiffEditorSessionFactory {
  createSession(options: IMediaDiffEditorSessionOptions): Promise<IMediaDiffEditorSession>;
}

export class MediaDiffEditorSession implements IMediaDiffEditorSession {
  private readonly disposables: vscode.Disposable[] = [];
  private isAttached = false;
  private isDisposed = false;

  constructor(
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly messageHandler: IMediaDiffEditorMessageHandler,
    private readonly engineAvailable: boolean,
  ) {}

  attach(onDidDispose: () => void): void {
    if (this.isDisposed || this.isAttached) {
      return;
    }

    this.isAttached = true;
    this.disposables.push(
      this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
        await this.messageHandler.handleMessage(message as MediaDiffRequest);
      }),
      this.webviewPanel.onDidDispose(() => {
        onDidDispose();
        this.dispose();
      }),
    );
  }

  async start(requiresRecompare: boolean = false): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (!this.engineAvailable) {
      this.webviewPanel.webview.postMessage({
        type: 'mediaDiff:error',
        error: vscode.l10n.t('mediaDiff.error.engineUnavailable'),
      });
    }

    if (requiresRecompare) {
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
