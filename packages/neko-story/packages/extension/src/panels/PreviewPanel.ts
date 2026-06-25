import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@neko-story/parser';
import type { FountainDocument, Note } from '@neko-story/types';
import { resolveWorkspaceMediaPath, type WorkspaceMediaPathContext } from '@neko/shared';
import {
  createDefaultLocalResourceAccessService,
  createVSCodeWorkspaceMediaPathContext,
  injectLocaleAttribute,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import { handleError } from '../utils/errorHandler';

type MessageToWebview =
  | {
      type: 'update';
      document: FountainDocument;
    }
  | { type: 'scrollTo'; line: number };

type MessageFromWebview =
  | { type: 'ready' }
  | { type: 'navigate'; line: number; character: number }
  | { type: 'scroll'; line: number };

export class PreviewPanel implements vscode.Disposable {
  private static readonly panels = new Set<PreviewPanel>();
  private static readonly viewType = 'nekoStory.preview';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly localResourceAccess: LocalResourceAccessService;
  private disposables: vscode.Disposable[] = [];
  private activeEditor: vscode.TextEditor | undefined;
  private updateTimeout: ReturnType<typeof setTimeout> | undefined;
  private updateVersion = 0;
  private isDisposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    localResourceAccess: LocalResourceAccessService,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.localResourceAccess = localResourceAccess;

    // Set webview content
    this.panel.webview.html = this.getHtmlForWebview();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: MessageFromWebview) => this.handleMessage(message),
      null,
      this.disposables,
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.disposePanelResources(false), null, this.disposables);

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
        if (this.activeEditor && event.document === this.activeEditor.document) {
          this.scheduleUpdate();
        }
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (this.activeEditor && event.textEditor === this.activeEditor) {
          const line = event.selections[0]?.start.line;
          if (line !== undefined) {
            this.scrollPreviewToLine(line);
          }
        }
      }),
    );
  }

  public static async create(extensionUri: vscode.Uri): Promise<PreviewPanel> {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    const localResourceAccess = createDefaultLocalResourceAccessService({
      extensionUri,
    });
    const panel = vscode.window.createWebviewPanel(PreviewPanel.viewType, 'Story Preview', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    await localResourceAccess.configureWebview(panel.webview, { enableScripts: true });

    const instance = new PreviewPanel(panel, extensionUri, localResourceAccess);
    PreviewPanel.panels.add(instance);
    return instance;
  }

  private isStoryDocument(document: vscode.TextDocument): boolean {
    return document.languageId === 'nekostory';
  }

  private handleMessage(message: MessageFromWebview) {
    if (this.isDisposed) {
      return;
    }

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
      vscode.TextEditorRevealType.InCenter,
    );

    // Focus the editor
    vscode.window.showTextDocument(this.activeEditor.document, {
      viewColumn: this.activeEditor.viewColumn,
      preserveFocus: false,
    });
  }

  private scheduleUpdate() {
    if (this.isDisposed) {
      return;
    }

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.updateTimeout = setTimeout(() => {
      this.updateTimeout = undefined;
      this.updatePreview();
    }, 300);
  }

  private updatePreview() {
    if (
      this.isDisposed ||
      !this.activeEditor ||
      !this.isStoryDocument(this.activeEditor.document)
    ) {
      return;
    }

    const text = this.activeEditor.document.getText();
    const document = parse(text);
    ++this.updateVersion;

    this.postMessage({
      type: 'update',
      document: this.resolveAssets(document),
    });
  }

  /** Walk elements and inject resolvedUri for notes with assetRef */
  private resolveAssets(doc: FountainDocument): FountainDocument {
    if (!this.activeEditor) return doc;
    const pathContext = this.createStoryWorkspaceMediaPathContext(this.activeEditor.document.uri);

    const elements = doc.elements.map((el) => {
      if (el.type !== 'note') return el;
      const note = el as Note;
      if (!note.assetRef) return el;

      const resolved = resolveWorkspaceMediaPath({
        source: note.assetRef.path,
        context: pathContext,
        fileExists: isExistingLocalFile,
        isPathAuthorized: (filePath) => isPathAuthorized(filePath, pathContext.allowedRoots),
      });
      const assetPath =
        resolved.status === 'resolved-local'
          ? resolved.path
          : resolved.status === 'remote'
            ? resolved.url
            : undefined;
      if (!assetPath) return el;

      const resolvedUri = this.projectLocalResource(assetPath, 'neko-story.note-asset');
      if (!resolvedUri) return el;

      return { ...note, resolvedUri };
    });

    return { ...doc, elements };
  }

  private scrollPreviewToLine(line: number) {
    this.postMessage({ type: 'scrollTo', line });
  }

  public postMessage(message: MessageToWebview): boolean {
    if (this.isDisposed) {
      return false;
    }

    try {
      void this.panel.webview.postMessage(message).then(undefined, (error: unknown) => {
        if (isWebviewDisposedError(error)) {
          this.disposePanelResources(false);
          return;
        }

        void handleError(error, { showToUser: false });
      });
    } catch (error) {
      if (isWebviewDisposedError(error)) {
        this.disposePanelResources(false);
        return false;
      }

      void handleError(error, { showToUser: false });
      return false;
    }

    return true;
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;
    // Get URIs for webview resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'main.css'),
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
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
    this.disposePanelResources(true);
  }

  private disposePanelResources(disposePanel: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.updateVersion++;
    PreviewPanel.panels.delete(this);

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = undefined;
    }

    if (disposePanel) {
      this.panel.dispose();
    }

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private projectLocalResource(source: string, caller: string): string | undefined {
    if (this.isDisposed) {
      return undefined;
    }

    return this.localResourceAccess.createSyncProjector(
      this.panel.webview,
      this.panel.webview.options.localResourceRoots ?? [],
      { caller },
    )(source);
  }

  private createStoryWorkspaceMediaPathContext(documentUri: vscode.Uri): WorkspaceMediaPathContext {
    const context = createVSCodeWorkspaceMediaPathContext({
      documentUri,
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
    });
    return {
      ...context,
      allowedRoots: context.allowedRoots ?? context.workspaceRoots ?? [],
    };
  }
}

function isExistingLocalFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isPathAuthorized(filePath: string, roots: readonly string[] | undefined): boolean {
  if (!roots || roots.length === 0) return true;
  return roots.some((root) => isPathInsideOrEqual(filePath, root));
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isWebviewDisposedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('Webview is disposed');
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
