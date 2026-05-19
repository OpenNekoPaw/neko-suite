import * as vscode from 'vscode';
import * as path from 'path';
import { parse } from '@neko-story/parser';
import type { FountainDocument, Note } from '@neko-story/types';
import { createStoryboardPayload } from '@neko/shared';
import {
  createDefaultLocalResourceAccessService,
  injectLocaleAttribute,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import type {
  AgentContextPayload,
  CanvasStoryboardExecutionSummary,
  CanvasStoryboardExecutionSummaryRequest,
  CharacterRegistryFile,
  CreatedCanvasStoryboardScene,
  NekoStoryScriptIndex,
  StoryCharacterAgentContextData,
  StorySceneAgentContextData,
  StorySceneVideoReadiness,
} from '@neko/shared';
import { buildScriptIndex } from '../services/scriptIndexBuilder';
import { StorySceneStateStore, type StorySceneState } from '../services/storySceneStateStore';
import { buildStorySceneVideoReadinessRows } from '../services/storyVideoReadinessService';
import { handleError } from '../utils/errorHandler';

type MessageToWebview =
  | {
      type: 'update';
      document: FountainDocument;
      scriptIndex: NekoStoryScriptIndex;
      sceneStates: Record<string, StorySceneState>;
      readinessRows?: readonly StorySceneVideoReadiness[];
    }
  | { type: 'scrollTo'; line: number }
  | { type: 'setView'; view: 'screenplay' | 'table' }
  | { type: 'characterThumbnails'; data: Record<string, string> };

type MessageFromWebview =
  | { type: 'ready' }
  | { type: 'navigate'; line: number; character: number }
  | { type: 'scroll'; line: number }
  | {
      type: 'sceneAction';
      sceneId: string;
      action:
        | 'analyze'
        | 'generateStoryboard'
        | 'sendToCanvas'
        | 'openCanvas'
        | 'toggleSkip'
        | 'startVideoCreation'
        | 'generateCurrentScene'
        | 'retryFailed';
    }
  | { type: 'characterSendToAgent'; name: string; sceneId?: string; characterId?: string }
  | { type: 'characterNavigate'; name: string; sceneId?: string; characterId?: string };

type ResolveCharacterBindings = (
  names: readonly string[],
  uriOrPath?: string,
) => Promise<Record<string, string>>;

type ResolveCharacterRegistry = (uriOrPath?: string) => CharacterRegistryFile | undefined;

export class PreviewPanel implements vscode.Disposable {
  private static readonly panels = new Set<PreviewPanel>();
  private static readonly viewType = 'nekoStory.preview';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly sceneStateStore: StorySceneStateStore;
  private readonly localResourceAccess: LocalResourceAccessService;
  private readonly resolveCharacterBindings: ResolveCharacterBindings;
  private readonly resolveCharacterRegistry: ResolveCharacterRegistry;
  private readonly readinessRowsByScene = new Map<string, StorySceneVideoReadiness>();
  private disposables: vscode.Disposable[] = [];
  private activeEditor: vscode.TextEditor | undefined;
  private updateTimeout: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    localResourceAccess: LocalResourceAccessService,
    sceneStateStore: StorySceneStateStore,
    resolveCharacterBindings: ResolveCharacterBindings,
    resolveCharacterRegistry: ResolveCharacterRegistry,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.localResourceAccess = localResourceAccess;
    this.sceneStateStore = sceneStateStore;
    this.resolveCharacterBindings = resolveCharacterBindings;
    this.resolveCharacterRegistry = resolveCharacterRegistry;

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

  public static async create(
    extensionUri: vscode.Uri,
    sceneStateStore: StorySceneStateStore,
    resolveCharacterBindings: ResolveCharacterBindings,
    resolveCharacterRegistry: ResolveCharacterRegistry,
  ): Promise<PreviewPanel> {
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

    const instance = new PreviewPanel(
      panel,
      extensionUri,
      localResourceAccess,
      sceneStateStore,
      resolveCharacterBindings,
      resolveCharacterRegistry,
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
      case 'characterSendToAgent':
        void this.handleCharacterSendToAgent(message.name, message.sceneId, message.characterId);
        break;
      case 'characterNavigate':
        void this.handleCharacterNavigate(message.name, message.sceneId, message.characterId);
        break;
    }
  }

  private async handleCharacterSendToAgent(
    name: string,
    sceneId?: string,
    characterId?: string,
  ): Promise<void> {
    const scriptPath = this.activeEditor?.document.uri.fsPath;
    const readiness = this.findCharacterReadiness(name, sceneId, characterId);
    const sceneReadiness = sceneId ? this.findSceneReadiness(sceneId) : undefined;
    const missingInputs = sceneReadiness?.missingInputs.filter(
      (input) => input.characterName === name || input.characterId === readiness?.characterId,
    );
    const data: StoryCharacterAgentContextData = {
      characterName: name,
      scriptPath: scriptPath ?? null,
      sourceScriptUri: this.activeEditor?.document.uri.toString(),
      sceneId,
      characterId: readiness?.characterId,
      assetEntityIds: readiness?.assetEntityIds,
      generatedAssetIds: readiness?.generatedAssetIds,
      galleryNodeIds: readiness?.galleryNodeIds,
      thumbnailRef: readiness?.thumbnailUri,
      readinessStatus: readiness?.status,
      missingInputs,
    };
    const payload: AgentContextPayload = {
      type: 'story-selection',
      id: sceneId ? `character:${sceneId}:${name}` : `character:${name}`,
      label: name,
      summary: `Character: ${name}${scriptPath ? `\nFrom: ${path.basename(scriptPath)}` : ''}`,
      data,
      intent: `请帮我完善角色「${name}」的形象设计：`,
    };

    try {
      await vscode.commands.executeCommand('neko.agent.sendContext', payload);
    } catch {
      // neko-agent not installed or not activated
    }
  }

  private async handleCharacterNavigate(
    name: string,
    sceneId?: string,
    characterId?: string,
  ): Promise<void> {
    try {
      const readiness = this.findCharacterReadiness(name, sceneId, characterId);
      const assetRef = readiness?.assetEntityIds?.[0] ?? readiness?.generatedAssetIds?.[0];
      if (assetRef) {
        try {
          await vscode.commands.executeCommand('neko.assets.openAsset', assetRef);
          return;
        } catch {
          // Fall back to the thumbnail path when the assets command is unavailable.
        }
      }
      const assetPath = await vscode.commands.executeCommand<string | undefined>(
        'neko.assets.getCharacterThumbnail',
        name,
      );
      if (assetPath) {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(assetPath));
      }
    } catch {
      // neko-assets not available
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

    void this.updateReadinessRows(document, scriptIndex, sceneStates);
    void this.sendCharacterThumbnails(scriptIndex);
  }

  private async updateReadinessRows(
    document: FountainDocument,
    scriptIndex: NekoStoryScriptIndex,
    sceneStates: Record<string, StorySceneState>,
  ): Promise<void> {
    if (!this.activeEditor) {
      return;
    }

    const editor = this.activeEditor;
    const readinessRows = await buildStorySceneVideoReadinessRows({
      document,
      scriptIndex,
      sceneStates,
      characterRegistry: this.resolveCharacterRegistry(editor.document.uri.toString()),
      canvasSummary: await this.getCanvasSummary(scriptIndex.uri),
      thumbnailResolver: async (name, record) =>
        this.resolveCharacterThumbnail(name, record?.id, false),
    });

    if (this.activeEditor?.document.uri.toString() !== scriptIndex.uri) {
      return;
    }

    this.readinessRowsByScene.clear();
    for (const row of readinessRows) {
      this.readinessRowsByScene.set(row.sceneId, row);
    }

    this.postMessage({
      type: 'update',
      document: this.resolveAssets(document),
      scriptIndex,
      sceneStates,
      readinessRows,
    });
  }

  private async sendCharacterThumbnails(scriptIndex: NekoStoryScriptIndex): Promise<void> {
    const names = scriptIndex.characters?.map((c) => c.name) ?? [];
    if (names.length === 0) return;

    try {
      const thumbnails: Record<string, string> = {};
      await Promise.allSettled(
        names.slice(0, 30).map(async (name) => {
          const thumbnailUri = await this.resolveCharacterThumbnail(name, undefined, true);
          if (thumbnailUri) {
            thumbnails[name] = thumbnailUri;
          }
        }),
      );

      if (Object.keys(thumbnails).length > 0) {
        this.postMessage({ type: 'characterThumbnails', data: thumbnails });
      }
    } catch {
      // Best-effort
    }
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
      const binding = this.sceneStateStore.getCanvasBinding(sceneId, editor.document.uri);
      if (binding?.canvasFileUri) {
        const uri = vscode.Uri.parse(binding.canvasFileUri);
        try {
          await vscode.workspace.fs.stat(uri);
          await vscode.commands.executeCommand('vscode.open', uri);
          if (binding.canvasSceneNodeId) {
            await vscode.commands.executeCommand(
              'neko.canvas.selectNodeFromOutline',
              binding.canvasSceneNodeId,
            );
          }
          return;
        } catch {
          // Canvas file no longer exists, fall through to create new
        }
      }
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
      const canvasFileUri = findActiveCanvasFileUri();
      const importedScene = await this.sendSceneToCanvas(scriptIndex, scene);
      if (importedScene) {
        this.sceneStateStore.recordCanvasImport(
          editor.document.uri,
          scriptIndex,
          importedScene,
          {},
          canvasFileUri,
        );
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

      const resolvedUri = this.projectLocalResource(assetPath, 'neko-story.note-asset');
      if (!resolvedUri) return el;

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
    const readiness = this.findSceneReadiness(scene.sceneId);
    const data: StorySceneAgentContextData = {
      scriptPath,
      sourceScriptUri: this.activeEditor.document.uri.toString(),
      sceneId: scene.sceneId,
      selectedText,
      range: {
        start: { line: scene.line_start, character: 0 },
        end: { line: scene.line_end, character: Number.MAX_SAFE_INTEGER },
      },
      readinessStatus: readiness?.readinessStatus,
      missingInputs: readiness?.missingInputs,
      canvasSummary: readiness?.canvasSummary,
    };

    const payload: AgentContextPayload = {
      type: 'story-selection',
      id: `story:${scriptPath}:${scene.sceneId}`,
      label: scene.sceneTitle,
      summary: `Scene: ${scene.sceneTitle}\n\n${selectedText.slice(0, 400)}${selectedText.length > 400 ? '…' : ''}`,
      data,
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

  private async resolveCharacterThumbnail(
    name: string,
    characterId: string | undefined,
    swallowErrors: boolean,
  ): Promise<string | undefined> {
    try {
      const thumbPath = await vscode.commands.executeCommand<string | undefined>(
        'neko.assets.getCharacterThumbnail',
        name,
      );
      if (!thumbPath && characterId) {
        const characterThumbPath = await vscode.commands.executeCommand<string | undefined>(
          'neko.assets.getCharacterThumbnail',
          characterId,
        );
        return characterThumbPath
          ? this.projectLocalResource(characterThumbPath, 'neko-story.character-thumbnail')
          : undefined;
      }
      return thumbPath
        ? this.projectLocalResource(thumbPath, 'neko-story.character-thumbnail')
        : undefined;
    } catch (error) {
      if (swallowErrors) {
        return undefined;
      }
      throw error;
    }
  }

  private async getCanvasSummary(
    sourceScriptUri: string,
  ): Promise<CanvasStoryboardExecutionSummary | undefined> {
    try {
      const request: CanvasStoryboardExecutionSummaryRequest = { sourceScriptUri };
      return await vscode.commands.executeCommand<CanvasStoryboardExecutionSummary>(
        'neko.canvas.getStoryboardExecutionSummary',
        request,
      );
    } catch {
      return undefined;
    }
  }

  private findSceneReadiness(sceneId: string): StorySceneVideoReadiness | undefined {
    return this.readinessRowsByScene.get(sceneId);
  }

  private findCharacterReadiness(
    name: string,
    sceneId?: string,
    characterId?: string,
  ): StorySceneVideoReadiness['characters'][number] | undefined {
    const rows = sceneId
      ? [this.findSceneReadiness(sceneId)].filter(
          (row): row is StorySceneVideoReadiness => row !== undefined,
        )
      : [...this.readinessRowsByScene.values()];

    for (const row of rows) {
      const character = row.characters.find(
        (candidate) =>
          (characterId !== undefined && candidate.characterId === characterId) ||
          candidate.name === name ||
          candidate.characterId === name,
      );
      if (character) {
        return character;
      }
    }

    return undefined;
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

  private projectLocalResource(source: string, caller: string): string | undefined {
    return this.localResourceAccess.createSyncProjector(
      this.panel.webview,
      this.panel.webview.options.localResourceRoots ?? [],
      { caller },
    )(source);
  }
}

function findActiveCanvasFileUri(): string | undefined {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.viewType === 'neko.canvasEditor'
      ) {
        return tab.input.uri.toString();
      }
    }
  }
  return undefined;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
