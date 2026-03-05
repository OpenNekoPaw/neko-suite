import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { FountainDocument } from '@neko-story/types';

type MessageToWebview =
  | { type: 'update'; document: FountainDocument }
  | { type: 'scrollTo'; line: number }
  | { type: 'print' };

type MessageFromWebview =
  | { type: 'ready' }
  | { type: 'navigate'; line: number; character: number }
  | { type: 'scroll'; line: number };

export class PreviewPanel implements vscode.Disposable {
  public static currentPanel: PreviewPanel | undefined;
  private static readonly viewType = 'nekoStory.preview';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private activeEditor: vscode.TextEditor | undefined;
  private updateTimeout: ReturnType<typeof setTimeout> | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    // Set webview content
    this.panel.webview.html = this.getHtmlForWebview();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: MessageFromWebview) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Track active editor
    this.activeEditor = vscode.window.activeTextEditor;

    // Listen for editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.isStoryDocument(editor.document)) {
          this.activeEditor = editor;
          this.updatePreview();
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (
          this.activeEditor &&
          event.document === this.activeEditor.document
        ) {
          this.scheduleUpdate();
        }
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (
          this.activeEditor &&
          event.textEditor === this.activeEditor
        ) {
          const line = event.selections[0]?.start.line;
          if (line !== undefined) {
            this.scrollPreviewToLine(line);
          }
        }
      })
    );
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    // If panel exists, show it
    if (PreviewPanel.currentPanel) {
      PreviewPanel.currentPanel.panel.reveal(column);
      PreviewPanel.currentPanel.updatePreview();
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      'Story Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
        ],
      }
    );

    PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri);
  }

  private isStoryDocument(document: vscode.TextDocument): boolean {
    return document.languageId === 'nekostory';
  }

  private handleMessage(message: MessageFromWebview) {
    switch (message.type) {
      case 'ready':
        this.updatePreview();
        break;
      case 'navigate':
        this.navigateToLine(message.line, message.character);
        break;
      case 'scroll':
        // Could sync editor scroll position here
        break;
    }
  }

  private navigateToLine(line: number, character: number) {
    if (!this.activeEditor) return;

    const position = new vscode.Position(line, character);
    const selection = new vscode.Selection(position, position);

    this.activeEditor.selection = selection;
    this.activeEditor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );

    // Focus the editor
    vscode.window.showTextDocument(this.activeEditor.document, {
      viewColumn: this.activeEditor.viewColumn,
      preserveFocus: false,
    });
  }

  private scheduleUpdate() {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.updateTimeout = setTimeout(() => {
      this.updatePreview();
    }, 300);
  }

  private updatePreview() {
    if (!this.activeEditor || !this.isStoryDocument(this.activeEditor.document)) {
      return;
    }

    const text = this.activeEditor.document.getText();
    const document = parse(text);

    this.postMessage({ type: 'update', document });
  }

  private scrollPreviewToLine(line: number) {
    this.postMessage({ type: 'scrollTo', line });
  }

  public print(): void {
    this.postMessage({ type: 'print' });
  }

  private postMessage(message: MessageToWebview) {
    this.panel.webview.postMessage(message);
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;

    // Get URIs for webview resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'main.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Story Preview</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    PreviewPanel.currentPanel = undefined;

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
