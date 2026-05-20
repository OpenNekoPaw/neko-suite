import * as vscode from 'vscode';
import * as path from 'path';
import { EngineClient } from '@neko/neko-client';
import type {
  EngineSceneNodeSnapshot,
  EngineSceneSnapshot,
  EngineVec3,
  EnvironmentPlacement,
  ModelMaterialPatch,
  ModelNodeTransformPatch,
  ModelOperationResult,
  ModelSceneAnimationInfo,
  ModelSceneGraphSnapshot,
  ModelSceneMaterialInfo,
  ModelSceneNodeInfo,
  ModelSceneNodeKind,
  ModelViewportCameraUpdate,
  NekoModelAPI,
} from '@neko/shared';
import {
  generateDefaultCubeGlb,
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
import { getLogger } from '../logger';

const logger = getLogger('ModelEditorProvider');

interface ActiveSceneStream {
  readonly streamId: string;
  readonly generation: number;
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
  private activeStream: ActiveSceneStream | undefined;
  private panelGeneration = 0;
  private lastSceneSnapshot: EngineSceneSnapshot | undefined;
  private activeModelPath: string | undefined;

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
    this.destroyActiveStream('resolve:replaceStream');
    const generation = ++this.panelGeneration;
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
      (msg) => this.handleWebviewMessage(msg, webviewPanel, document, generation),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(() => {
      if (!this.isPanelCurrent(webviewPanel, generation)) return;
      this.panelGeneration++;
      this.activeWebviewPanel = undefined;
      this.activeDocument = undefined;
      this.activeModelPath = undefined;
      this.lastSceneSnapshot = undefined;
      this.destroyActiveStream('dispose:destroyStream', generation);
    });

    // Try to connect to engine backend
    await this.ensureEngineClient();
  }

  /**
   * Forward keyboard action to active webview
   */
  postKeyboardAction(action: string): void {
    const panel = this.activeWebviewPanel;
    if (!panel) return;
    void this.postToPanel(panel, this.panelGeneration, {
      type: 'keyboardAction',
      action,
    });
  }

  applyLiveExpressions(expressions: VrmExpressionValues): void {
    const panel = this.activeWebviewPanel;
    if (!panel) return;
    void this.postToPanel(panel, this.panelGeneration, {
      type: 'liveExpressions',
      expressions,
    });
  }

  useEnvironment(placement: EnvironmentPlacement): boolean {
    const panel = this.activeWebviewPanel;
    if (!panel) return false;
    void this.postToPanel(panel, this.panelGeneration, {
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
    const panel = this.activeWebviewPanel;
    const document = this.activeDocument;
    if (!panel || !document) return false;
    const generation = this.panelGeneration;
    await this.importModelFile(uri.fsPath, document, panel, generation);
    return this.isPanelCurrent(panel, generation);
  }

  getModelApi(): NekoModelAPI {
    return {
      getSceneGraph: () => this.getSceneGraph(),
      getNodeProperties: (nodeId) => this.getNodeProperties(nodeId),
      setNodeTransform: (nodeId, transform) => this.setNodeTransform(nodeId, transform),
      setNodeVisible: (nodeId, visible) => this.setNodeVisible(nodeId, visible),
      updateMaterial: (patch) => this.updateMaterial(patch),
      listAnimations: () => this.listAnimations(),
      playAnimation: (nameOrIndex) => this.playAnimation(nameOrIndex),
      stopAnimation: () => this.stopAnimation(),
      seekAnimation: (timeSeconds) => this.seekAnimation(timeSeconds),
      updateViewportCamera: (update) => this.updateViewportCamera(update),
      getActiveModelPath: () => this.getActiveModelPath(),
    };
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
    generation: number,
  ): Promise<void> {
    if (!this.isPanelCurrent(webviewPanel, generation)) return;

    switch (message.type) {
      case 'ready': {
        const filePath = document.uri.fsPath;
        const isProject = filePath.endsWith('.nkm');

        if (isProject) {
          // Load .nkm project file via engine backend
          const loaded = await this.loadProjectInEngine(filePath, webviewPanel, generation);

          // Empty projects start with Blender-style default scene content.
          if (loaded && loaded.snapshot?.nodes?.length === 0) {
            const restored = await this.tryLoadModelFromProject(filePath, webviewPanel, generation);
            if (!restored) {
              await this.ensureDefaultCubeModelForProject(
                filePath,
                document,
                webviewPanel,
                generation,
              );
            }
          }
        } else {
          await this.loadModelInEngine(filePath, webviewPanel, generation);
        }

        const queued = this.queuedModelImport;
        if (queued) {
          this.queuedModelImport = undefined;
          if (this.isPanelCurrent(webviewPanel, generation)) {
            await this.importModelFile(queued.uri.fsPath, document, webviewPanel, generation);
          }
        }
        break;
      }

      case 'requestEnginePort': {
        const client = await this.ensureEngineClient();
        if (client) {
          void this.postToPanel(webviewPanel, generation, {
            type: 'enginePort',
            port: client.port,
          });
        }
        break;
      }

      case 'streamStarted': {
        this.activeStream = { streamId: message.streamId as string, generation };
        break;
      }

      case 'streamDestroyed': {
        if (
          this.activeStream?.streamId === (message.streamId as string) &&
          this.activeStream.generation === generation
        ) {
          this.activeStream = undefined;
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
          if (this.rememberSceneSnapshot(snapshot, 'createShape')) {
            void this.postToPanel(webviewPanel, generation, { type: 'sceneSnapshot', snapshot });
          }
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
          if (this.rememberSceneSnapshot(snapshot, 'createTextMesh')) {
            void this.postToPanel(webviewPanel, generation, { type: 'sceneSnapshot', snapshot });
          }
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
          if (this.rememberSceneSnapshot(snapshot, 'csgBoolean')) {
            void this.postToPanel(webviewPanel, generation, { type: 'sceneSnapshot', snapshot });
          }
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
          void this.postToPanel(webviewPanel, generation, {
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
          void this.postToPanel(webviewPanel, generation, {
            type: 'latency:response',
            timestamp: message.timestamp,
          });
        } catch (err) {
          this.logError('latency_test', err);
          // Still echo back even on error
          void this.postToPanel(webviewPanel, generation, {
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
          void this.postToPanel(webviewPanel, generation, {
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
            void this.postToPanel(webviewPanel, generation, {
              type: 'exportComplete',
              success: true,
              filePath: saveUri.fsPath,
            });
          }
        } catch (err) {
          this.logError('exportGlb', err);
          void this.postToPanel(webviewPanel, generation, {
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
            void this.postToPanel(webviewPanel, generation, {
              type: 'projectSaved',
              success: true,
              filePath: saveUri.fsPath,
            });
          }
        } catch (err) {
          this.logError('saveProject', err);
          void this.postToPanel(webviewPanel, generation, {
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
          void this.postToPanel(webviewPanel, generation, { type: 'keyframeTracks', tracks });
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
          void this.postToPanel(webviewPanel, generation, {
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
          void this.postToPanel(webviewPanel, generation, {
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
          await this.importModelFile(uris[0].fsPath, document, webviewPanel, generation);
        }
        break;
      }

      case 'model:template': {
        const templateId = message.templateId as string;
        const name = path.basename(document.uri.fsPath, '.nkm');
        const glbData =
          templateId === 'humanoid' ? generateHumanoidGlb(name) : generateDefaultCubeGlb(name);

        // Write .glb alongside .nkm
        const nkmDir = path.dirname(document.uri.fsPath);
        const glbName = `${name}.glb`;
        const glbPath = path.join(nkmDir, glbName);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(glbPath), glbData);

        await this.importModelFile(glbPath, document, webviewPanel, generation);
        break;
      }

      case 'model:dropFile': {
        const fileName = message.name as string;
        const base64Data = message.data as string;
        const fileData = Buffer.from(base64Data, 'base64');

        const nkmDir2 = path.dirname(document.uri.fsPath);
        const dropPath = path.join(nkmDir2, fileName);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(dropPath), fileData);

        await this.importModelFile(dropPath, document, webviewPanel, generation);
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
    generation: number,
  ): Promise<void> {
    if (!this.isPanelCurrent(webviewPanel, generation)) return;

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

    await this.loadModelInEngine(importPath, webviewPanel, generation);
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

  private isPanelCurrent(webviewPanel: vscode.WebviewPanel, generation: number): boolean {
    return this.activeWebviewPanel === webviewPanel && this.panelGeneration === generation;
  }

  private postToPanel(
    webviewPanel: vscode.WebviewPanel,
    generation: number,
    message: Record<string, unknown>,
  ): Thenable<boolean> {
    if (!this.isPanelCurrent(webviewPanel, generation)) {
      return Promise.resolve(false);
    }
    return webviewPanel.webview.postMessage(message);
  }

  private destroyActiveStream(action: string, generation?: number): void {
    const activeStream = this.activeStream;
    if (!activeStream || !this.engineClient) return;
    if (generation !== undefined && activeStream.generation !== generation) return;

    this.activeStream = undefined;
    this.engineClient
      .controlStream('streams', activeStream.streamId, 'destroy')
      .catch((err) => this.logError(action, err));
  }

  /**
   * Load a model file into the Rust ECS backend and send the snapshot to webview.
   */
  private async loadModelInEngine(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
    generation: number,
  ): Promise<boolean> {
    const client = await this.ensureEngineClient();
    if (!client) return false;
    if (!this.isPanelCurrent(webviewPanel, generation)) return false;

    try {
      const data = await client.withRegisteredFile({ filePath, purpose: 'model' }, (registered) =>
        client.loadModel({ token: registered.token }),
      );
      if (!this.rememberSceneSnapshot(data, 'loadModel')) return false;
      this.activeModelPath = filePath;
      void this.postToPanel(webviewPanel, generation, {
        type: 'sceneSnapshot',
        snapshot: data,
      });
      return true;
    } catch (err) {
      this.logError('loadModel', err);
      return false;
    }
  }

  /**
   * Load a .nkm project file via the engine backend and send snapshot + editor state to webview.
   * Returns the result so callers can inspect the snapshot.
   */
  private async loadProjectInEngine(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
    generation: number,
  ): Promise<{ snapshot: EngineSceneSnapshot; editorState: unknown } | undefined> {
    const client = await this.ensureEngineClient();
    if (!client) return undefined;
    if (!this.isPanelCurrent(webviewPanel, generation)) return undefined;

    try {
      const result = await client.loadProject(filePath);
      if (!this.rememberSceneSnapshot(result.snapshot, 'loadProject')) return undefined;
      this.activeModelPath = filePath;
      void this.postToPanel(webviewPanel, generation, {
        type: 'projectLoaded',
        snapshot: result.snapshot,
        editorState: result.editorState,
      });
      return result;
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
    generation: number,
  ): Promise<boolean> {
    if (!this.isPanelCurrent(webviewPanel, generation)) return false;

    try {
      const nkmUri = vscode.Uri.file(nkmPath);
      const data = await vscode.workspace.fs.readFile(nkmUri);
      const project = JSON.parse(new TextDecoder().decode(data)) as {
        model?: { src?: string | null };
      };

      const modelSrc = project.model?.src;
      if (!modelSrc) return false;

      // Resolve relative path from .nkm directory
      const nkmDir = path.dirname(nkmPath);
      const modelPath = path.resolve(nkmDir, modelSrc);

      // Check file exists
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(modelPath));
      } catch {
        return false; // Model file doesn't exist
      }

      const loaded = await this.loadModelInEngine(modelPath, webviewPanel, generation);
      return loaded;
    } catch (err) {
      this.logError('tryLoadModelFromProject', err);
      return false;
    }
  }

  /**
   * Create Blender-style default content for a new empty .nkm project.
   */
  private async ensureDefaultCubeModelForProject(
    nkmPath: string,
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    generation: number,
  ): Promise<void> {
    if (!this.isPanelCurrent(webviewPanel, generation)) return;

    const nkmDir = path.dirname(nkmPath);
    const name = path.basename(nkmPath, '.nkm');
    const glbPath = await this.resolveAvailableImportPath(path.join(nkmDir, `${name}.glb`));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(glbPath), generateDefaultCubeGlb(name));
    await this.importModelFile(glbPath, document, webviewPanel, generation);
  }

  private getWorkspaceFolderUris(): readonly vscode.Uri[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri);
  }

  private logError(action: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`${action} failed`, msg);
  }

  private async getSceneGraph(): Promise<ModelSceneGraphSnapshot | undefined> {
    if (!this.isActive()) return undefined;
    const snapshot = await this.refreshSceneSnapshot();
    return snapshot
      ? mapEngineSceneSnapshotToModelGraph(snapshot, this.activeModelPath)
      : undefined;
  }

  private async getNodeProperties(nodeId: string): Promise<ModelSceneNodeInfo | undefined> {
    const scene = await this.getSceneGraph();
    return scene?.nodes.find((node) => node.id === nodeId);
  }

  private async setNodeTransform(
    nodeId: string,
    transform: ModelNodeTransformPatch,
  ): Promise<ModelOperationResult> {
    if (!this.isActive()) return unavailableModelOperation('No active model editor is available.');
    const client = await this.ensureEngineClient();
    const current = await this.getNodeProperties(nodeId);
    if (!client || !current) {
      return unavailableModelOperation('No active model scene node is available.');
    }

    const position = vec3ToTuple(transform.position ?? current.position ?? { x: 0, y: 0, z: 0 });
    const rotation = quatToTuple(
      transform.rotation ?? current.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
    );
    const scale = vec3ToTuple(transform.scale ?? current.scale ?? { x: 1, y: 1, z: 1 });

    try {
      await client.updateSceneTransform(nodeId, position, rotation, scale);
      const snapshot = await this.refreshSceneSnapshot();
      return { ok: true, revision: snapshot?.revision };
    } catch (error) {
      return errorModelOperation(error);
    }
  }

  private async setNodeVisible(nodeId: string, visible: boolean): Promise<ModelOperationResult> {
    if (!this.isActive()) return unavailableModelOperation('No active model editor is available.');
    const client = await this.ensureEngineClient();
    if (!client) return unavailableModelOperation('Neko Engine is not available.');

    try {
      await client.setSceneNodeVisible(nodeId, visible);
      const snapshot = await this.refreshSceneSnapshot();
      return { ok: true, revision: snapshot?.revision };
    } catch (error) {
      return errorModelOperation(error);
    }
  }

  private async updateMaterial(patch: ModelMaterialPatch): Promise<ModelOperationResult> {
    if (!this.isActive()) return unavailableModelOperation('No active model editor is available.');
    const client = await this.ensureEngineClient();
    if (!client) return unavailableModelOperation('Neko Engine is not available.');

    try {
      const params = patch.params;
      await client.updateSceneMaterial(patch.materialId, {
        baseColor: toColor4(params['baseColor']),
        metallic: toFiniteNumber(params['metallic']),
        roughness: toFiniteNumber(params['roughness']),
        emissive: toColor3(params['emissive']),
        occlusionStrength: toFiniteNumber(params['occlusionStrength']),
      });
      const snapshot = await this.refreshSceneSnapshot();
      return { ok: true, revision: snapshot?.revision };
    } catch (error) {
      return errorModelOperation(error);
    }
  }

  private async listAnimations(): Promise<readonly ModelSceneAnimationInfo[]> {
    const scene = await this.getSceneGraph();
    return scene?.animations ?? [];
  }

  private async playAnimation(nameOrIndex: string | number): Promise<ModelOperationResult> {
    if (!this.isActive()) return unavailableModelOperation('No active model editor is available.');
    const animations = await this.listAnimations();
    const clip = typeof nameOrIndex === 'number' ? animations[nameOrIndex] : undefined;
    const clipName = typeof nameOrIndex === 'string' ? nameOrIndex : clip?.name;
    if (!clipName) return unavailableModelOperation('Animation clip is not available.');

    const client = await this.ensureEngineClient();
    if (!client) return unavailableModelOperation('Neko Engine is not available.');

    try {
      await client.crossfadeSceneAnimation(clipName, 0, false);
      return { ok: true, revision: this.lastSceneSnapshot?.revision };
    } catch (error) {
      return errorModelOperation(error);
    }
  }

  private async stopAnimation(): Promise<ModelOperationResult> {
    if (!this.isActive()) return unavailableModelOperation('No active model editor is available.');
    const client = await this.ensureEngineClient();
    if (!client) return unavailableModelOperation('Neko Engine is not available.');

    try {
      const animations = await this.listAnimations();
      for (const animation of animations) {
        await client.setSceneBlendWeight(animation.name, 0);
      }
      return { ok: true, revision: this.lastSceneSnapshot?.revision };
    } catch (error) {
      return errorModelOperation(error);
    }
  }

  private async seekAnimation(timeSeconds: number): Promise<ModelOperationResult> {
    if (!this.isActive()) return unavailableModelOperation('No active model editor is available.');
    const client = await this.ensureEngineClient();
    const firstAnimation = (await this.listAnimations())[0];
    if (!client || !firstAnimation) {
      return unavailableModelOperation('No active model animation is available.');
    }

    try {
      await client.tickScene(firstAnimation.name, timeSeconds);
      return { ok: true, revision: this.lastSceneSnapshot?.revision };
    } catch (error) {
      return errorModelOperation(error);
    }
  }

  private async updateViewportCamera(
    update: ModelViewportCameraUpdate,
  ): Promise<ModelOperationResult> {
    if (!this.isActive()) return unavailableModelOperation('No active model editor is available.');
    const client = await this.ensureEngineClient();
    if (!client) return unavailableModelOperation('Neko Engine is not available.');

    try {
      await client.updateEditorCamera(
        tuple3(update.position),
        tuple3(update.target),
        update.fovY,
        update.viewportId,
      );
      return { ok: true, revision: this.lastSceneSnapshot?.revision };
    } catch (error) {
      return errorModelOperation(error);
    }
  }

  private getActiveModelPath(): string | undefined {
    return this.isActive() ? this.activeModelPath : undefined;
  }

  private async refreshSceneSnapshot(): Promise<EngineSceneSnapshot | undefined> {
    const client = await this.ensureEngineClient();
    if (!client) return this.lastSceneSnapshot;

    try {
      const snapshot = await client.getSceneSnapshot();
      return this.rememberSceneSnapshot(snapshot, 'refreshSceneSnapshot')
        ? snapshot
        : this.lastSceneSnapshot;
    } catch {
      return this.lastSceneSnapshot;
    }
  }

  private rememberSceneSnapshot(
    snapshot: unknown,
    source: string,
  ): snapshot is EngineSceneSnapshot {
    if (!isEngineSceneSnapshot(snapshot)) {
      logger.warn(`${source} returned invalid scene snapshot data; ignoring snapshot.`);
      return false;
    }

    this.lastSceneSnapshot = snapshot;
    return true;
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

/** @internal Exported for focused model API unit tests. */
export function mapEngineSceneSnapshotToModelGraph(
  snapshot: EngineSceneSnapshot,
  activeModelPath: string | undefined,
): ModelSceneGraphSnapshot {
  return {
    sceneId: snapshot.sceneId,
    nodes: snapshot.nodes.map(sceneNodeToModelNode),
    materials: collectSceneMaterials(snapshot.nodes),
    animations: snapshot.animations.map((animation, index) => ({
      name: animation.name,
      index,
      duration: animation.duration,
    })),
    activeModelPath,
    engineSnapshot: snapshot,
  };
}

function sceneNodeToModelNode(node: EngineSceneNodeSnapshot): ModelSceneNodeInfo {
  return {
    id: node.nodeId,
    name: node.name,
    parentId: node.parentId ?? null,
    visible: node.visible,
    kind: sceneNodeKind(node.kind),
    position: node.transform?.position,
    rotation: node.transform?.rotation,
    scale: node.transform?.scale,
    materialIds: node.material?.id ? [node.material.id] : undefined,
    bounds: node.bounds,
    worldBounds: node.worldBounds,
  };
}

function collectSceneMaterials(
  nodes: readonly EngineSceneNodeSnapshot[],
): readonly ModelSceneMaterialInfo[] {
  const materials = new Map<string, ModelSceneMaterialInfo>();
  for (const node of nodes) {
    const material = node.material;
    if (material?.id && !materials.has(material.id)) {
      materials.set(material.id, {
        id: material.id,
        name: material.uri ?? material.id,
      });
    }
  }
  return [...materials.values()];
}

/** @internal Exported for focused model API unit tests. */
export function isEngineSceneSnapshot(value: unknown): value is EngineSceneSnapshot {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['sceneId'])) return false;
  if (!isFiniteNumber(value['revision'])) return false;
  if (!Array.isArray(value['nodes']) || !value['nodes'].every(isEngineSceneNodeSnapshot)) {
    return false;
  }
  if (
    !Array.isArray(value['animations']) ||
    !value['animations'].every(isEngineAnimationClipInfo)
  ) {
    return false;
  }
  const activeCamera = value['activeCamera'];
  return activeCamera === undefined || isEngineCameraState(activeCamera);
}

function isEngineSceneNodeSnapshot(value: unknown): value is EngineSceneNodeSnapshot {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['nodeId'])) return false;
  if (!isNonEmptyString(value['name'])) return false;
  if (!Array.isArray(value['children']) || !value['children'].every(isString)) return false;
  if (typeof value['visible'] !== 'boolean') return false;
  if (!isOptionalString(value['parentId'])) return false;
  if (!isOptionalFiniteNumber(value['layerMask'])) return false;
  if (!isOptionalString(value['kind'])) return false;
  if (!isOptionalTransform3d(value['transform'])) return false;
  if (!isOptionalAssetHandle(value['mesh'])) return false;
  if (!isOptionalAssetHandle(value['material'])) return false;
  if (!isOptionalBounds3(value['bounds'])) return false;
  return isOptionalBounds3(value['worldBounds']);
}

function isEngineAnimationClipInfo(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value['name']) && isFiniteNumber(value['duration']);
}

function isEngineCameraState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['cameraId'])) return false;
  if (!isFiniteNumber(value['fov'])) return false;
  if (!isOptionalVec3(value['position'])) return false;
  if (!isOptionalVec3(value['target'])) return false;
  if (!isOptionalVec3(value['up'])) return false;
  if (!isOptionalFiniteNumber(value['near'])) return false;
  return isOptionalFiniteNumber(value['far']);
}

function sceneNodeKind(kind: string | undefined): ModelSceneNodeKind {
  switch (kind) {
    case 'mesh':
    case 'light':
    case 'camera':
    case 'bone':
    case 'empty':
      return kind;
    default:
      return 'unknown';
  }
}

function isOptionalTransform3d(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (!isOptionalVec3(value['position'])) return false;
  if (!isOptionalQuat(value['rotation'])) return false;
  return isOptionalVec3(value['scale']);
}

function isOptionalBounds3(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (!isOptionalVec3(value['min'])) return false;
  return isOptionalVec3(value['max']);
}

function isOptionalAssetHandle(value: unknown): boolean {
  if (value === undefined) return true;
  return isRecord(value) && isNonEmptyString(value['id']);
}

function isOptionalVec3(value: unknown): boolean {
  return value === undefined || isVec3(value);
}

function isVec3(value: unknown): value is EngineVec3 {
  return (
    isRecord(value) &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isFiniteNumber(value['z'])
  );
}

function isOptionalQuat(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      isFiniteNumber(value['x']) &&
      isFiniteNumber(value['y']) &&
      isFiniteNumber(value['z']) &&
      isFiniteNumber(value['w']))
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function vec3ToTuple(value: EngineVec3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function quatToTuple(value: {
  x: number;
  y: number;
  z: number;
  w: number;
}): [number, number, number, number] {
  return [value.x, value.y, value.z, value.w];
}

function tuple3(value: readonly [number, number, number]): [number, number, number] {
  return [value[0], value[1], value[2]];
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toColor4(value: unknown): [number, number, number, number] | undefined {
  return tupleOfNumbers(value, 4) as [number, number, number, number] | undefined;
}

function toColor3(value: unknown): [number, number, number] | undefined {
  return tupleOfNumbers(value, 3) as [number, number, number] | undefined;
}

function tupleOfNumbers(value: unknown, length: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== length) return undefined;
  const numbers = value.filter(
    (item): item is number => typeof item === 'number' && Number.isFinite(item),
  );
  return numbers.length === length ? numbers : undefined;
}

function unavailableModelOperation(message: string): ModelOperationResult {
  return { ok: false, message };
}

function errorModelOperation(error: unknown): ModelOperationResult {
  return { ok: false, message: error instanceof Error ? error.message : String(error) };
}
