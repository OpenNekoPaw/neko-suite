import * as vscode from 'vscode';
import * as path from 'path';
import { EngineClient } from '@neko/neko-client';
import type { FileSourceRef, RegisteredFile } from '@neko/neko-client';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { EnvironmentPlacement } from '@neko/shared';
import {
  generateMinimalGlb,
  generateHumanoidGlb,
  injectLocaleAttribute,
} from '@neko/shared/vscode/extension';
import { ModelDocument } from './ModelDocument';
import {
  createModelImportConflictPath,
  createModelProjectImportPlan,
  formatModelProjectSrc,
} from '../importModelAsset';
import type { VrmExpressionValues } from '../live/vmcMapping';

const logger = new ConsoleLogger('ModelEditorProvider', LogLevel.Info);

interface EngineModelResource {
  readonly sourceRef?: FileSourceRef;
  readonly resourceUrl?: string;
  readonly resourceBaseUrl?: string;
}

/**
 * Custom editor provider for 3D model files (.gltf, .glb, .vrm)
 *
 * Manages the lifecycle of:
 * - Webview panel (R3F 3D viewport)
 * - EngineClient connection (Rust backend for scene ECS)
 * - Bidirectional message passing between webview and engine
 */
export class ModelEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'neko.modelEditor';

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private activeDocument: vscode.CustomDocument | undefined;
  private queuedModelImport: { uri: vscode.Uri } | undefined;
  private engineClient: EngineClient | undefined;
  private activeStreamId: string | undefined;
  private activeModelResourceToken: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel = webviewPanel;
    this.activeDocument = document;

    const workspaceFolders = this.getWorkspaceFolderUris();
    const documentResourceRoots =
      document.uri.scheme === 'file' ? [vscode.Uri.file(path.dirname(document.uri.fsPath))] : [];

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ...documentResourceRoots,
        ...workspaceFolders,
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(() => {
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
        this.activeDocument = undefined;
      }
      const streamId = this.activeStreamId;
      if (streamId && this.engineClient) {
        this.activeStreamId = undefined;
        this.engineClient
          .controlStream('streams', streamId, 'destroy')
          .catch((err) => this.logError('dispose:destroyStream', err));
      }
      void this.releaseActiveModelResource();
    });

    // Try to connect to engine backend
    await this.ensureEngineClient();
  }

  /**
   * Forward keyboard action to active webview
   */
  postKeyboardAction(action: string): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
  }

  applyLiveExpressions(expressions: VrmExpressionValues): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'liveExpressions',
      expressions,
    });
  }

  useEnvironment(placement: EnvironmentPlacement): boolean {
    if (!this.activeWebviewPanel) return false;
    void this.activeWebviewPanel.webview.postMessage({
      type: 'environmentPlacement',
      placement,
    });
    return true;
  }

  isActive(): boolean {
    return Boolean(this.activeWebviewPanel && this.activeDocument);
  }

  queueModelImport(uri: vscode.Uri): void {
    this.queuedModelImport = { uri };
  }

  clearQueuedModelImport(): void {
    this.queuedModelImport = undefined;
  }

  async importAsset(uri: vscode.Uri): Promise<boolean> {
    if (!this.activeWebviewPanel || !this.activeDocument) return false;
    await this.importModelFile(uri.fsPath, this.activeDocument, this.activeWebviewPanel);
    return true;
  }

  /**
   * Ensure EngineClient is connected to the Rust backend.
   * Falls back gracefully — webview works standalone (R3F only) without engine.
   */
  private async ensureEngineClient(): Promise<EngineClient | undefined> {
    if (this.engineClient) {
      return this.engineClient;
    }

    try {
      const result = await vscode.commands.executeCommand<{ port: number }>(
        'neko.engine.ensureFrameServer',
      );
      if (result) {
        this.engineClient = new EngineClient(result.port);
      }
    } catch {
      // Engine extension not installed or not running — standalone mode
    }

    return this.engineClient;
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        const filePath = document.uri.fsPath;
        const isProject = filePath.endsWith('.nkm');

        if (isProject) {
          // Load .nkm project file via engine backend
          const loaded = await this.loadProjectInEngine(filePath, webviewPanel);

          // If project has model.src but empty scene, auto-load the referenced model
          if (loaded && loaded.snapshot?.nodes?.length === 0) {
            await this.tryLoadModelFromProject(filePath, webviewPanel);
          }
        } else {
          await this.postLoadModelMessage(filePath, webviewPanel);

          // Also load in engine backend if available
          await this.loadModelInEngine(filePath, webviewPanel);
        }

        const queued = this.queuedModelImport;
        if (queued) {
          this.queuedModelImport = undefined;
          await this.importModelFile(queued.uri.fsPath, document, webviewPanel);
        }
        break;
      }

      case 'requestEnginePort': {
        const client = await this.ensureEngineClient();
        if (client) {
          webviewPanel.webview.postMessage({
            type: 'enginePort',
            port: client.port,
          });
        }
        break;
      }

      case 'streamStarted': {
        this.activeStreamId = message.streamId as string;
        break;
      }

      case 'streamDestroyed': {
        if (this.activeStreamId === (message.streamId as string)) {
          this.activeStreamId = undefined;
        }
        break;
      }

      case 'updateTransform': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        const { nodeId, position, rotation, scale } = message as {
          type: string;
          nodeId: string;
          position: [number, number, number];
          rotation: [number, number, number, number];
          scale: [number, number, number];
        };

        try {
          await client.updateSceneTransform(nodeId, position, rotation, scale);
        } catch (err) {
          this.logError('updateTransform', err);
        }
        break;
      }

      case 'playAnimation': {
        // Animation playback is handled client-side by R3F useAnimations.
        // Engine backend tick is optional for future server-side animation.
        break;
      }

      case 'pauseAnimation':
      case 'stopAnimation': {
        // Handled client-side
        break;
      }

      case 'createShape': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const snapshot = await client.createShape(
            message.shapeType as string,
            message.params as Record<string, number>,
          );
          webviewPanel.webview.postMessage({ type: 'sceneSnapshot', snapshot });
        } catch (err) {
          this.logError('createShape', err);
        }
        break;
      }

      case 'createTextMesh': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const snapshot = await client.createTextMesh(
            message.text as string,
            message.fontSize as number,
            message.extrusionDepth as number,
          );
          webviewPanel.webview.postMessage({ type: 'sceneSnapshot', snapshot });
        } catch (err) {
          this.logError('createTextMesh', err);
        }
        break;
      }

      case 'csgBoolean': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const snapshot = await client.csgBoolean(
            message.entityA as string,
            message.entityB as string,
            message.operation as 'union' | 'difference' | 'intersection',
          );
          webviewPanel.webview.postMessage({ type: 'sceneSnapshot', snapshot });
        } catch (err) {
          this.logError('csgBoolean', err);
        }
        break;
      }

      case 'updateBoneTransform': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.updateSceneTransform(
            message.nodeId as string,
            [0, 0, 0], // position unchanged
            message.rotation as [number, number, number, number],
            [1, 1, 1], // scale unchanged
          );
        } catch (err) {
          this.logError('updateBoneTransform', err);
        }
        break;
      }

      case 'latency:test': {
        // Latency test: forward to engine and echo back response
        const client = await this.ensureEngineClient();
        if (!client) {
          // No engine available, just echo back immediately
          webviewPanel.webview.postMessage({
            type: 'latency:response',
            timestamp: message.timestamp,
          });
          break;
        }

        try {
          // Call engine latency_test action
          await client.dispatch({
            group: 'scenes',
            action: 'latency_test',
            options: {},
          });
          // Echo back to webview
          webviewPanel.webview.postMessage({
            type: 'latency:response',
            timestamp: message.timestamp,
          });
        } catch (err) {
          this.logError('latency_test', err);
          // Still echo back even on error
          webviewPanel.webview.postMessage({
            type: 'latency:response',
            timestamp: message.timestamp,
          });
        }
        break;
      }

      case 'scene:capturePreview': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const preview = await client.captureScenePreview({
            width: (message.width as number | undefined) ?? 1280,
            height: (message.height as number | undefined) ?? 720,
            quality: (message.quality as number | undefined) ?? 90,
          });
          webviewPanel.webview.postMessage({
            type: 'sceneCapturePreview',
            preview,
          });
        } catch (err) {
          this.logError('scene:capturePreview', err);
        }
        break;
      }

      case 'exportGlb': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const result = await client.exportGlb();
          // Decode base64 and write to file
          const saveUri = await vscode.window.showSaveDialog({
            filters: { 'GLB Files': ['glb'] },
            defaultUri: vscode.Uri.file(document.uri.fsPath.replace(/\.[^.]+$/, '.glb')),
          });
          if (saveUri) {
            const binaryStr = Buffer.from(result.data, 'base64');
            await vscode.workspace.fs.writeFile(saveUri, binaryStr);
            webviewPanel.webview.postMessage({
              type: 'exportComplete',
              success: true,
              filePath: saveUri.fsPath,
            });
          }
        } catch (err) {
          this.logError('exportGlb', err);
          webviewPanel.webview.postMessage({
            type: 'exportComplete',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case 'saveProject': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const saveUri = await vscode.window.showSaveDialog({
            filters: { 'Neko Model Project': ['nkm'] },
            defaultUri: vscode.Uri.file(document.uri.fsPath.replace(/\.[^.]+$/, '.nkm')),
          });
          if (saveUri) {
            await client.saveProject(saveUri.fsPath, message.editorState);
            webviewPanel.webview.postMessage({
              type: 'projectSaved',
              success: true,
              filePath: saveUri.fsPath,
            });
          }
        } catch (err) {
          this.logError('saveProject', err);
          webviewPanel.webview.postMessage({
            type: 'projectSaved',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      // ── Keyframe CRUD ──

      case 'requestKeyframeTracks': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const tracks = await client.getSceneKeyframeTracks(message.clipName as string);
          webviewPanel.webview.postMessage({ type: 'keyframeTracks', tracks });
        } catch (err) {
          this.logError('requestKeyframeTracks', err);
        }
        break;
      }

      case 'addKeyframe': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const result = await client.addSceneKeyframe(
            message.clipName as string,
            message.nodeId as string,
            message.property as string,
            message.timestamp as number,
            message.values as number[],
          );
          webviewPanel.webview.postMessage({
            type: 'keyframeAdded',
            trackProperty: `${message.nodeId as string}.${message.property as string}`,
            keyframeId: result.id,
          });
        } catch (err) {
          this.logError('addKeyframe', err);
        }
        break;
      }

      case 'removeKeyframe': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.removeSceneKeyframe(
            message.clipName as string,
            message.keyframeId as string,
          );
          webviewPanel.webview.postMessage({
            type: 'keyframeRemoved',
            trackProperty: '',
            keyframeId: message.keyframeId as string,
          });
        } catch (err) {
          this.logError('removeKeyframe', err);
        }
        break;
      }

      case 'updateKeyframe': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.updateSceneKeyframe(
            message.clipName as string,
            message.keyframeId as string,
            {
              timestamp: message.timestamp as number | undefined,
              values: message.values as number[] | undefined,
              easing: message.easing as string | undefined,
            },
          );
        } catch (err) {
          this.logError('updateKeyframe', err);
        }
        break;
      }

      case 'createClip': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.createSceneClip(message.name as string, message.duration as number);
        } catch (err) {
          this.logError('createClip', err);
        }
        break;
      }

      case 'crossfadeAnimation': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.crossfadeSceneAnimation(
            message.clipName as string,
            message.fadeDuration as number,
            (message.loop as boolean | undefined) ?? false,
          );
        } catch (err) {
          this.logError('crossfadeAnimation', err);
        }
        break;
      }

      case 'model:import': {
        // Open file dialog to select .glb/.gltf/.vrm
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { '3D Models': ['glb', 'gltf', 'vrm'] },
        });
        if (uris?.[0]) {
          await this.importModelFile(uris[0].fsPath, document, webviewPanel);
        }
        break;
      }

      case 'model:template': {
        const templateId = message.templateId as string;
        const name = path.basename(document.uri.fsPath, '.nkm');
        const glbData =
          templateId === 'humanoid' ? generateHumanoidGlb(name) : generateMinimalGlb(name);

        // Write .glb alongside .nkm
        const nkmDir = path.dirname(document.uri.fsPath);
        const glbName = `${name}.glb`;
        const glbPath = path.join(nkmDir, glbName);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(glbPath), glbData);

        await this.importModelFile(glbPath, document, webviewPanel);
        break;
      }

      case 'model:dropFile': {
        const fileName = message.name as string;
        const base64Data = message.data as string;
        const fileData = Buffer.from(base64Data, 'base64');

        const nkmDir2 = path.dirname(document.uri.fsPath);
        const dropPath = path.join(nkmDir2, fileName);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(dropPath), fileData);

        await this.importModelFile(dropPath, document, webviewPanel);
        break;
      }

      default:
        break;
    }
  }

  /**
   * Import a model file into the project: update .nkm, send to webview, load in engine.
   */
  private async importModelFile(
    modelPath: string,
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    let importPath = path.resolve(modelPath);

    // Update model.src in the .nkm project file
    if (document.uri.fsPath.endsWith('.nkm')) {
      try {
        const importPlan = createModelProjectImportPlan({
          sourcePath: modelPath,
          documentPath: document.uri.fsPath,
          workspaceFolderPaths: (vscode.workspace.workspaceFolders ?? []).map(
            (folder) => folder.uri.fsPath,
          ),
        });

        importPath = importPlan.importPath;
        let projectModelSrc = importPlan.projectModelSrc;

        if (importPlan.action === 'copy') {
          importPath = await this.resolveAvailableImportPath(importPlan.importPath);
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(importPath)));
          await vscode.workspace.fs.copy(
            vscode.Uri.file(importPlan.sourcePath),
            vscode.Uri.file(importPath),
            { overwrite: false },
          );
          projectModelSrc = formatModelProjectSrc(
            path.relative(path.dirname(document.uri.fsPath), importPath),
          );
        }

        const nkmData = await vscode.workspace.fs.readFile(document.uri);
        const project = JSON.parse(new TextDecoder().decode(nkmData)) as Record<string, unknown>;
        (project as { model?: { src?: string } }).model = { src: projectModelSrc };
        await vscode.workspace.fs.writeFile(
          document.uri,
          new TextEncoder().encode(JSON.stringify(project, null, 2)),
        );
      } catch (err) {
        this.logError('updateNkmModelSrc', err);
        return;
      }
    }

    // Send model URI to webview for R3F loading
    this.addWebviewResourceRoot(webviewPanel, path.dirname(importPath));
    await this.postLoadModelMessage(importPath, webviewPanel);

    // Also load in engine backend
    await this.loadModelInEngine(importPath, webviewPanel);
  }

  private async resolveAvailableImportPath(targetPath: string): Promise<string> {
    if (!(await this.fileExists(targetPath))) {
      return targetPath;
    }

    const nonce = Date.now();
    const timestampedPath = createModelImportConflictPath({ targetPath, nonce });
    if (!(await this.fileExists(timestampedPath))) {
      return timestampedPath;
    }

    return createModelImportConflictPath({ targetPath, nonce, attempt: 1 });
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  private addWebviewResourceRoot(webviewPanel: vscode.WebviewPanel, rootPath: string): void {
    const nextRoot = vscode.Uri.file(rootPath);
    const currentRoots = webviewPanel.webview.options.localResourceRoots ?? [];
    const hasRoot = currentRoots.some((root) => root.toString() === nextRoot.toString());
    if (hasRoot) return;

    webviewPanel.webview.options = {
      ...webviewPanel.webview.options,
      localResourceRoots: [...currentRoots, nextRoot],
    };
  }

  private async postLoadModelMessage(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<EngineModelResource | undefined> {
    const modelUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(filePath));
    const engineResource = await this.registerModelResource(filePath);
    webviewPanel.webview.postMessage({
      type: 'loadModel',
      uri: modelUri.toString(),
      filePath,
      sourceRef: engineResource?.sourceRef,
      resourceUrl: engineResource?.resourceUrl,
      resourceBaseUrl: engineResource?.resourceBaseUrl,
    });
    return engineResource;
  }

  private async registerModelResource(filePath: string): Promise<EngineModelResource | undefined> {
    const client = await this.ensureEngineClient();
    if (!client) return undefined;

    try {
      const registered = await client.registerFile({ filePath, purpose: 'model' });
      await this.releaseActiveModelResource(client);
      this.activeModelResourceToken = registered.token;
      return this.toEngineModelResource(client, filePath, registered);
    } catch (err) {
      this.logError('registerModelResource', err);
      return undefined;
    }
  }

  private async releaseActiveModelResource(client = this.engineClient): Promise<void> {
    const token = this.activeModelResourceToken;
    if (!token || !client) return;
    this.activeModelResourceToken = undefined;
    await client.unregisterFile(token);
  }

  private toEngineModelResource(
    client: EngineClient,
    filePath: string,
    registered: RegisteredFile,
  ): EngineModelResource {
    const fileName = path.basename(filePath);
    return {
      sourceRef: { token: registered.token },
      resourceUrl: client.getFileResourceUrl(registered.token, fileName),
      resourceBaseUrl: client.getFileResourceBaseUrl(registered.token),
    };
  }

  private getWorkspaceFolderUris(): readonly vscode.Uri[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri);
  }

  /**
   * Load a model file into the Rust ECS backend and send the snapshot to webview.
   */
  private async loadModelInEngine(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const client = await this.ensureEngineClient();
    if (!client) return;

    try {
      const data = await client.withRegisteredFile({ filePath, purpose: 'model' }, (registered) =>
        client.loadModel({ token: registered.token }),
      );
      webviewPanel.webview.postMessage({
        type: 'sceneSnapshot',
        snapshot: data,
      });
    } catch (err) {
      this.logError('loadModel', err);
    }
  }

  /**
   * Load a .nkm project file via the engine backend and send snapshot + editor state to webview.
   * Returns the result so callers can inspect the snapshot.
   */
  private async loadProjectInEngine(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<{ snapshot: { nodes: unknown[] }; editorState: unknown } | undefined> {
    const client = await this.ensureEngineClient();
    if (!client) return undefined;

    try {
      const result = await client.loadProject(filePath);
      webviewPanel.webview.postMessage({
        type: 'projectLoaded',
        snapshot: result.snapshot,
        editorState: result.editorState,
      });
      return result as { snapshot: { nodes: unknown[] }; editorState: unknown };
    } catch (err) {
      this.logError('loadProject', err);
      return undefined;
    }
  }

  /**
   * Read model.src from .nkm JSON and load the referenced model file.
   * Used when a template-created project has an empty scene snapshot.
   */
  private async tryLoadModelFromProject(
    nkmPath: string,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    try {
      const nkmUri = vscode.Uri.file(nkmPath);
      const data = await vscode.workspace.fs.readFile(nkmUri);
      const project = JSON.parse(new TextDecoder().decode(data)) as {
        model?: { src?: string | null };
      };

      const modelSrc = project.model?.src;
      if (!modelSrc) return;

      // Resolve relative path from .nkm directory
      const nkmDir = path.dirname(nkmPath);
      const modelPath = path.resolve(nkmDir, modelSrc);

      // Check file exists
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(modelPath));
      } catch {
        return; // Model file doesn't exist
      }

      // Send model URI to webview for R3F loading
      await this.postLoadModelMessage(modelPath, webviewPanel);

      // Also load in engine backend
      await this.loadModelInEngine(modelPath, webviewPanel);
    } catch (err) {
      this.logError('tryLoadModelFromProject', err);
    }
  }

  private logError(action: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`${action} failed`, msg);
  }

  private getHtmlForWebview(webview: vscode.Webview, documentUri: vscode.Uri): string {
    const webviewDistUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}' 'wasm-unsafe-eval';
             img-src ${webview.cspSource} data: blob: https: http://127.0.0.1:*;
             font-src ${webview.cspSource};
             connect-src ${webview.cspSource} ws://127.0.0.1:* http://127.0.0.1:*;">
  <link rel="stylesheet" href="${webviewDistUri}/assets/index.css">
  <title>3D Model Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.documentUri = "${documentUri.toString()}";</script>
  <script nonce="${nonce}" type="module" src="${webviewDistUri}/assets/index.js"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
