import * as vscode from 'vscode';
import * as path from 'path';
import { parse } from '@neko-story/parser';
import type { FountainDocument, Note } from '@neko-story/types';
import { createStoryboardPayload } from '@neko/shared';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import type {
  AgentContextPayload,
  CreatedCanvasStoryboardScene,
  NekoStoryScriptIndex,
} from '@neko/shared';
import { buildScriptIndex } from '../services/scriptIndexBuilder';
import { StorySceneStateStore, type StorySceneState } from '../services/storySceneStateStore';
import { handleError } from '../utils/errorHandler';

type MessageToWebview =
  | {
      type: 'update';
      document: FountainDocument;
      scriptIndex: NekoStoryScriptIndex;
      sceneStates: Record<string, StorySceneState>;
    }
  | { type: 'scrollTo'; line: number }
  | { type: 'setView'; view: 'screenplay' | 'table' };

type MessageFromWebview =
  | { type: 'ready' }
  | { type: 'navigate'; line: number; character: number }
  | { type: 'scroll'; line: number }
  | {
      type: 'sceneAction';
      sceneId: string;
      action: 'analyze' | 'generateStoryboard' | 'sendToCanvas' | 'openCanvas' | 'toggleSkip';
    };

type ResolveCharacterBindings = (
  names: readonly string[],
  uriOrPath?: string,
) => Promise<Record<string, string>>;

export class PreviewPanel implements vscode.Disposable {
  private static readonly panels = new Set<PreviewPanel>();
  private static readonly viewType = 'nekoStory.preview';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly sceneStateStore: StorySceneStateStore;
  private readonly resolveCharacterBindings: ResolveCharacterBindings;
  private disposables: vscode.Disposable[] = [];
  private activeEditor: vscode.TextEditor | undefined;
  private updateTimeout: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    sceneStateStore: StorySceneStateStore,
    resolveCharacterBindings: ResolveCharacterBindings,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.sceneStateStore = sceneStateStore;
    this.resolveCharacterBindings = resolveCharacterBindings;

    // Set webview content
    this.panel.webview.html = this.getHtmlForWebview();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: MessageFromWebview) => this.handleMessage(message),
      null,
      this.disposables,
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
      this.sceneStateStore.onDidChange((uri) => {
        if (this.activeEditor?.document.uri.toString() === uri.toString()) {
          this.updatePreview();
        }
      }),
    );
  }

  public static create(
    extensionUri: vscode.Uri,
    sceneStateStore: StorySceneStateStore,
    resolveCharacterBindings: ResolveCharacterBindings,
  ): PreviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    const workspaceFolderUris = vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? [];
    const panel = vscode.window.createWebviewPanel(PreviewPanel.viewType, 'Story Preview', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
        ...workspaceFolderUris,
      ],
    });

    const instance = new PreviewPanel(
      panel,
      extensionUri,
      sceneStateStore,
      resolveCharacterBindings,
    );
    PreviewPanel.panels.add(instance);
    return instance;
  }

  /** Broadcast a message to all live panels */
  public static broadcastMessage(message: MessageToWebview): void {
    PreviewPanel.panels.forEach((p) => p.postMessage(message));
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
      case 'sceneAction':
        void this.handleSceneAction(message.sceneId, message.action);
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
    const scriptIndex = buildScriptIndex(this.activeEditor.document.uri, document);
    const sceneStates = this.sceneStateStore.getSceneStates(
      this.activeEditor.document.uri,
      scriptIndex,
    );

    this.postMessage({
      type: 'update',
      document: this.resolveAssets(document),
      scriptIndex,
      sceneStates,
    });
  }

  private async handleSceneAction(
    sceneId: string,
    action:
      | 'analyze'
      | 'generateStoryboard'
      | 'sendToCanvas'
      | 'openCanvas'
      | 'toggleSkip'
      | 'startVideoCreation'
      | 'generateCurrentScene'
      | 'retryFailed',
  ): Promise<void> {
    const editor = this.activeEditor;
    if (!editor || !this.isStoryDocument(editor.document)) {
      return;
    }

    const document = parse(editor.document.getText());
    const scriptIndex = buildScriptIndex(editor.document.uri, document);
    const scene = scriptIndex.scenes.find((entry) => entry.sceneId === sceneId);
    if (!scene) {
      return;
    }
    const sceneStates = this.sceneStateStore.getSceneStates(editor.document.uri, scriptIndex);
    const existingState = sceneStates[sceneId];
    if (!existingState) {
      return;
    }

    if (action === 'openCanvas') {
      await vscode.commands.executeCommand('neko.canvas.new');
      return;
    }

    if (action === 'toggleSkip') {
      const skipped =
        existingState.agentStatus !== 'skipped' || existingState.canvasStatus !== 'skipped';
      this.sceneStateStore.updateSceneState(editor.document.uri, scriptIndex, sceneId, {
        agentStatus: skipped ? 'skipped' : 'not-requested',
        canvasStatus: skipped ? 'skipped' : 'not-sent',
      });
      return;
    }

    await this.selectSceneRange(scene.line_start, scene.line_end);

    if (action === 'analyze') {
      this.sceneStateStore.updateSceneState(editor.document.uri, scriptIndex, sceneId, {
        agentStatus: 'ready',
      });
      await this.sendSceneToAgent(scene, '请分析这个场景并给出 scene-level 分镜建议：');
      return;
    }

    if (action === 'generateStoryboard') {
      await vscode.commands.executeCommand('neko.story.generateStoryboard');
      return;
    }

    if (action === 'startVideoCreation') {
      await vscode.commands.executeCommand('neko.story.startVideoCreation', { sceneId });
      return;
    }

    if (action === 'generateCurrentScene') {
      await vscode.commands.executeCommand('neko.story.startVideoCreation', {
        sceneIds: [sceneId],
      });
      return;
    }

    if (action === 'retryFailed') {
      await vscode.commands.executeCommand('neko.story.startVideoCreation', {
        sceneIds: [sceneId],
      });
      return;
    }

    if (action === 'sendToCanvas') {
      const importedScene = await this.sendSceneToCanvas(scriptIndex, scene);
      if (importedScene) {
        this.sceneStateStore.recordCanvasImport(editor.document.uri, scriptIndex, importedScene);
      } else {
        this.sceneStateStore.updateSceneState(editor.document.uri, scriptIndex, sceneId, {
          canvasStatus: 'sent',
        });
      }
    }
  }

  /** Walk elements and inject resolvedUri for notes with assetRef */
  private resolveAssets(doc: FountainDocument): FountainDocument {
    if (!this.activeEditor) return doc;
    const docDir = path.dirname(this.activeEditor.document.uri.fsPath);

    const elements = doc.elements.map((el) => {
      if (el.type !== 'note') return el;
      const note = el as Note;
      if (!note.assetRef) return el;

      const assetPath = path.isAbsolute(note.assetRef.path)
        ? note.assetRef.path
        : path.join(docDir, note.assetRef.path);

      const resolvedUri = this.panel.webview.asWebviewUri(vscode.Uri.file(assetPath)).toString();

      return { ...note, resolvedUri };
    });

    return { ...doc, elements };
  }

  private scrollPreviewToLine(line: number) {
    this.postMessage({ type: 'scrollTo', line });
  }

  private async selectSceneRange(startLine: number, endLine: number): Promise<void> {
    if (!this.activeEditor) return;
    const selection = new vscode.Selection(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
    this.activeEditor.selection = selection;
    this.activeEditor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
    await vscode.window.showTextDocument(this.activeEditor.document, {
      viewColumn: this.activeEditor.viewColumn,
      preserveFocus: false,
    });
  }

  private async sendSceneToAgent(
    scene: NekoStoryScriptIndex['scenes'][number],
    intent: string,
  ): Promise<void> {
    if (!this.activeEditor) return;

    const selection = new vscode.Selection(
      scene.line_start,
      0,
      scene.line_end,
      Number.MAX_SAFE_INTEGER,
    );
    const selectedText = this.activeEditor.document.getText(selection);
    const scriptPath = this.activeEditor.document.uri.fsPath;

    const payload: AgentContextPayload = {
      type: 'story-selection',
      id: `story:${scriptPath}:${scene.sceneId}`,
      label: scene.sceneTitle,
      summary: `Scene: ${scene.sceneTitle}\n\n${selectedText.slice(0, 400)}${selectedText.length > 400 ? '…' : ''}`,
      data: {
        scriptPath,
        sceneId: scene.sceneId,
        selectedText,
        range: {
          start: { line: scene.line_start, character: 0 },
          end: { line: scene.line_end, character: Number.MAX_SAFE_INTEGER },
        },
      },
      intent,
    };

    try {
      await vscode.commands.executeCommand('neko.agent.sendContext', payload);
    } catch {
      // neko-agent not installed or not active
    }
  }

  private async sendSceneToCanvas(
    scriptIndex: NekoStoryScriptIndex,
    scene: NekoStoryScriptIndex['scenes'][number],
  ): Promise<CreatedCanvasStoryboardScene | undefined> {
    const characterBindings = await this.resolveCharacterBindings(
      scene.sceneCharacters,
      scriptIndex.uri,
    );
    const sceneIndex: NekoStoryScriptIndex = {
      ...scriptIndex,
      scenes: [scene],
    };
    const payload = createStoryboardPayload(sceneIndex, {
      mode: 'mechanical',
      scenesLimit: 1,
      characterBindings,
    });

    try {
      const created = await vscode.commands.executeCommand<{
        scenes?: CreatedCanvasStoryboardScene[];
      }>('neko.canvas.importStoryboard', payload);
      vscode.window.showInformationMessage(`已发送场景到 Canvas：${scene.sceneTitle}`);
      return created?.scenes?.find((createdScene) => createdScene.sourceSceneId === scene.sceneId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('No active canvas editor')) {
        void handleError(
          new Error('没有活动的 Canvas 编辑器。请先打开一个 .nkc 画布，再重试发送场景。'),
          { showToUser: true, severity: 'warning' },
        );
        return undefined;
      }
      void handleError(error instanceof Error ? error : new Error(message), { showToUser: true });
      return undefined;
    }
  }

  public postMessage(message: MessageToWebview) {
    this.panel.webview.postMessage(message);
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
    PreviewPanel.panels.delete(this);

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
