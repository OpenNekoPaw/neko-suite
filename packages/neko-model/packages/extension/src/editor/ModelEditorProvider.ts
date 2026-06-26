import * as vscode from 'vscode';
import * as path from 'path';
import { EngineClient } from '@neko/neko-client';
import type {
  ContentAccessRequest,
  ContentEngineSource,
  EngineSceneNodeSnapshot,
  EngineSceneSnapshot,
  EngineVec3,
  EnvironmentPatch,
  EnvironmentPlacement,
  LightPatch,
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
  NkmProjectData,
  NkmSceneProfile,
  ProjectSourceAddRequest,
  ProjectSourceAddResult,
} from '@neko/shared';
import {
  handleProjectSourceAddHostRequest,
  handleProjectSourceAddRequest,
  ingestProjectSourceAddRequest,
} from '@neko/shared';
import {
  createProjectSnapshotPackage,
  createHostContentAccessRuntime,
  createFocusedWebviewRegistry,
  generateDefaultCubeGlb,
  generateHumanoidGlb,
  hasWebviewKeyboardEditableOwner,
  injectLocaleAttribute,
  normalizeVSCodeProjectSourceAddRequest,
  readStringMetadata,
  updateWebviewKeyboardEditableOwner,
  type FocusedWebviewDisposable,
  type ContentAccessService,
  type IFocusedWebviewRegistry,
} from '@neko/shared/vscode/extension';
import {
  loadNkmProject,
  ModelDocument,
  createNkmSourcePolicyOptions,
  resolveNkmProjectModelSource,
  saveNkmProject,
} from './ModelDocument';
import type { ModelStatusProjection, ModelStatusSnapshot } from './modelStatusProjection';
import { getDefaultModelStatusSnapshot } from './modelStatusProjection';
import type { VrmExpressionValues } from '../live/vmcMapping';
import { getLogger } from '../logger';

const logger = getLogger('ModelEditorProvider');
const MODEL_KEYBOARD_OWNER_PREFIX = 'neko.modelEditor:';
const MODEL_EDITOR_LEVEL_KEYBOARD_ACTIONS = new Set([
  'deleteSelected',
  'escape',
  'selectAll',
  'undo',
  'redo',
  'resetView',
]);

function createVSCodeSourceAssetFileOps() {
  return {
    createDirectory: async (dirPath: string) =>
      vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
    fileExists: async (filePath: string) => {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return true;
      } catch {
        return false;
      }
    },
    writeFile: async (filePath: string, bytes: Uint8Array) =>
      vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes),
  };
}

interface ActiveSceneStream {
  readonly streamId: string;
  readonly generation: number;
}

export interface WebviewAssetManifest {
  readonly scripts: readonly string[];
  readonly styles: readonly string[];
}

/**
 * Custom editor provider for 3D model files (.gltf, .glb, .vrm)
 *
 * Manages the lifecycle of:
 * - Webview panel (R3F 3D viewport)
 * - EngineClient connection (Rust backend for scene ECS)
 * - Bidirectional message passing between webview and engine
 */
export class ModelEditorProvider implements vscode.CustomReadonlyEditorProvider<ModelDocument> {
  public static readonly viewType = 'neko.modelEditor';

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private activeDocument: ModelDocument | undefined;
  private queuedModelImport: { uri: vscode.Uri } | undefined;
  private engineClient: EngineClient | undefined;
  private activeStream: ActiveSceneStream | undefined;
  private panelGeneration = 0;
  private lastSceneSnapshot: EngineSceneSnapshot | undefined;
  private activeModelPath: string | undefined;
  private modelContentAccess: ContentAccessService | undefined;
  private readonly focusedWebviews: IFocusedWebviewRegistry;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly statusProjection?: ModelStatusProjection,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
  ) {
    this.focusedWebviews = focusedWebviews;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<ModelDocument> {
    return uri.fsPath.endsWith('.nkm')
      ? ModelDocument.fromNkm(uri)
      : ModelDocument.fromModelFile(uri);
  }

  async resolveCustomEditor(
    document: ModelDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.destroyActiveStream('resolve:replaceStream');
    const generation = ++this.panelGeneration;
    this.activeWebviewPanel = webviewPanel;
    this.activeDocument = document;
    const documentUri = document.uri.toString();
    const focusedRegistration: FocusedWebviewDisposable = this.focusedWebviews.register({
      id: documentUri,
      viewType: ModelEditorProvider.viewType,
      documentUri,
      panel: webviewPanel,
      visible: webviewPanel.visible,
      active: webviewPanel.active,
    });
    this.context.subscriptions.push(focusedRegistration);

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

    webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg, webviewPanel, document, generation),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidChangeViewState(
      (event) => {
        if (!this.isPanelCurrent(event.webviewPanel, generation)) return;
        const panelId = document.uri.toString();
        this.focusedWebviews.markVisible(panelId, event.webviewPanel.visible);
        if (!event.webviewPanel.visible) {
          void this.setGlobalKeyboardEditable(panelId, false);
        }
        if (event.webviewPanel.active) {
          this.focusedWebviews.markActive(panelId);
          this.activeWebviewPanel = event.webviewPanel;
          this.activeDocument = document;
        } else {
          this.focusedWebviews.markInactive(panelId);
          void this.setGlobalKeyboardEditable(panelId, false);
        }
        void this.postToPanel(event.webviewPanel, generation, {
          type: 'webviewVisibility',
          visible: event.webviewPanel.visible,
        });
        if (!event.webviewPanel.visible) {
          this.destroyActiveStream('hidden:destroyStream', generation);
        }
      },
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(() => {
      focusedRegistration.dispose();
      void this.setGlobalKeyboardEditable(documentUri, false);
      if (!this.isPanelCurrent(webviewPanel, generation)) return;
      this.panelGeneration++;
      this.activeWebviewPanel = undefined;
      this.activeDocument = undefined;
      this.activeModelPath = undefined;
      this.lastSceneSnapshot = undefined;
      this.resetStatusProjection();
      this.destroyActiveStream('dispose:destroyStream', generation);
    });

    // Try to connect to engine backend
    await this.ensureEngineClient();
  }

  /**
   * Forward keyboard action to active webview
   */
  async postKeyboardAction(action: string, documentUri?: vscode.Uri): Promise<boolean> {
    if (isModelEditorLevelKeyboardAction(action) && (await this.hasGlobalKeyboardEditableOwner())) {
      return false;
    }

    return this.focusedWebviews.postKeyboardAction(action, {
      viewType: ModelEditorProvider.viewType,
      documentUri: documentUri?.toString(),
      allowRecentVisibleFallback: false,
      allowSingleVisibleFallback: true,
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
    void this.postEnvironmentCommand(panel, this.panelGeneration, placement);
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
    document: ModelDocument,
    generation: number,
  ): Promise<void> {
    if (!this.isPanelCurrent(webviewPanel, generation)) return;

    switch (message.type) {
      case 'ready': {
        this.focusedWebviews.syncFocus(document.uri.toString());
        const filePath = document.uri.fsPath;
        const isProject = filePath.endsWith('.nkm');
        const sceneProfile = isProject ? await this.readNkmSceneProfile(filePath) : '3d';

        void this.postToPanel(webviewPanel, generation, {
          type: 'documentContext',
          context: {
            owner: 'neko-model',
            documentKind: isProject ? 'nkm' : 'model-asset',
            sceneProfile,
          },
        });

        if (isProject) {
          // Load .nkm project file via engine backend
          const loaded = await this.loadProjectInEngine(
            filePath,
            webviewPanel,
            generation,
            sceneProfile,
          );

          // Empty projects start with Blender-style default scene content.
          if (sceneProfile === '3d' && loaded && loaded.snapshot?.nodes?.length === 0) {
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

      case 'webviewKeyboardFocus': {
        if (typeof message.focused !== 'boolean') {
          break;
        }
        this.focusedWebviews.markKeyboardFocused(document.uri.toString(), message.focused);
        if (message.focused && webviewPanel.visible) {
          this.activeWebviewPanel = webviewPanel;
          this.activeDocument = document;
        }
        break;
      }

      case 'webviewKeyboardEditable': {
        if (typeof message.editable !== 'boolean') {
          break;
        }
        const editable = message.editable && webviewPanel.visible;
        this.focusedWebviews.markKeyboardEditable(document.uri.toString(), editable);
        void this.setGlobalKeyboardEditable(document.uri.toString(), editable);
        break;
      }

      case 'requestEnginePort': {
        const client = await this.ensureEngineClient();
        if (client) {
          void this.postToPanel(webviewPanel, generation, {
            type: 'enginePort',
            port: client.port,
          });
          void this.postToPanel(webviewPanel, generation, {
            type: 'webviewVisibility',
            visible: webviewPanel.visible,
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

      case 'modelStatus': {
        const status = parseModelStatusSnapshot(message);
        if (status) {
          this.statusProjection?.update(status);
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

      case 'model:export': {
        const choice = await vscode.window.showQuickPick(
          [
            {
              label: '$(symbol-file) GLB',
              description: 'Export rendered scene as GLB',
              action: 'glb',
            },
            {
              label: '$(run-all) Motion artifact',
              description: 'Export model motion artifact (.nkma)',
              action: 'motions',
            },
            {
              label: '$(settings-gear) Config artifact',
              description: 'Export model config artifact (.nkmc)',
              action: 'config',
            },
          ] as const,
          { placeHolder: 'Select model export target' },
        );
        if (!choice) break;
        if (choice.action === 'glb') {
          await this.handleWebviewMessage(
            { type: 'exportGlb' },
            webviewPanel,
            document,
            generation,
          );
        } else {
          await vscode.commands.executeCommand(
            choice.action === 'motions' ? 'neko.model.exportMotions' : 'neko.model.exportConfig',
            document.uri,
          );
        }
        break;
      }

      case 'project:package': {
        await createProjectSnapshotPackage({
          packageId: 'neko-model',
          title: 'Package Model Project',
          sourceUri: document.uri,
          metadata: {
            kind: 'model',
            viewType: ModelEditorProvider.viewType,
          },
        });
        break;
      }

      case 'saveProject': {
        try {
          const saveUri = await vscode.window.showSaveDialog({
            filters: { 'Neko Model Project': ['nkm'] },
            defaultUri: vscode.Uri.file(document.uri.fsPath.replace(/\.[^.]+$/, '.nkm')),
          });
          if (saveUri) {
            const project = getModelDocumentProjectData(document);
            await saveNkmProject(
              saveUri,
              {
                ...project,
                editorState: normalizeModelEditorState(message.editorState),
              },
              'manual',
            );
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

      case 'environment:pickPanorama': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'Environment Images': ['png', 'jpg', 'jpeg', 'webp', 'hdr', 'exr'] },
        });
        if (uris?.[0]) {
          const uri = uris[0];
          await this.postEnvironmentCommand(webviewPanel, generation, {
            sourceAssetId: uri.fsPath,
            sourceUri: uri.toString(),
            mode: 'background-and-ibl',
            rotationDeg: 0,
            intensity: 1,
            exposure: 0,
            visibleAsBackground: true,
          });
        }
        break;
      }

      case 'model:template': {
        const templateId = message.templateId as string;
        const name = path.basename(document.uri.fsPath, '.nkm');
        const glbData =
          templateId === 'humanoid' ? generateHumanoidGlb(name) : generateDefaultCubeGlb(name);
        await this.handleModelProjectAddSource(
          this.createModelProjectSourceAddRequest({
            documentUri: document.uri,
            fileName: `${name}.glb`,
            bytes: glbData,
            kind: 'generated-output',
            caller: 'neko-model.template-add-source',
            requestId: `model-template-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          }),
          document,
          webviewPanel,
          generation,
        );
        break;
      }

      case 'project:addSource': {
        await this.handleModelProjectAddSource(
          (message as { request?: ProjectSourceAddRequest }).request,
          document,
          webviewPanel,
          generation,
        );
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
    document: ModelDocument,
    webviewPanel: vscode.WebviewPanel,
    generation: number,
  ): Promise<void> {
    if (!this.isPanelCurrent(webviewPanel, generation)) return;

    await this.handleModelProjectAddSource(
      this.createModelProjectSourceAddRequest({
        documentUri: document.uri,
        sourcePath: modelPath,
        kind: 'file-picker',
        caller: 'neko-model.import-model',
        requestId: `model-import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      }),
      document,
      webviewPanel,
      generation,
    );
  }

  private async handleModelProjectAddSource(
    request: ProjectSourceAddRequest | undefined,
    document: ModelDocument,
    webviewPanel: vscode.WebviewPanel,
    generation: number,
  ): Promise<void> {
    if (!request) return;
    if (this.isModelFilePickerSourceAddRequest(request)) {
      await this.handleModelFilePickerSourceAdd(request, document, webviewPanel, generation);
      return;
    }
    await handleProjectSourceAddHostRequest(request, {
      addSource: (sourceRequest) =>
        this.addModelProjectSource(
          normalizeVSCodeProjectSourceAddRequest(sourceRequest),
          document,
          webviewPanel,
          generation,
        ),
      postMessage: (message) => webviewPanel.webview.postMessage(message),
      logger,
    });
  }

  private isModelFilePickerSourceAddRequest(request: ProjectSourceAddRequest): boolean {
    return (
      request.kind === 'file-picker' &&
      request.formatId === 'nkm' &&
      !request.sourcePath &&
      !request.sourceUri &&
      !request.bytes &&
      !request.generatedAssetId
    );
  }

  private async handleModelFilePickerSourceAdd(
    request: ProjectSourceAddRequest,
    document: ModelDocument,
    webviewPanel: vscode.WebviewPanel,
    generation: number,
  ): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { '3D Models': ['glb', 'gltf', 'vrm'] },
    });
    const uri = uris?.[0];
    if (!uri) {
      await handleProjectSourceAddHostRequest(request, {
        addSource: async () => ({
          requestId: request.requestId,
          ok: false,
          diagnostics: [
            {
              code: 'add-source-cancelled',
              severity: 'info',
              message: 'Model source selection was cancelled.',
              recoverability: 'none',
            },
          ],
        }),
        postMessage: (message) => webviewPanel.webview.postMessage(message),
        logger,
      });
      return;
    }

    await this.handleModelProjectAddSource(
      this.createModelProjectSourceAddRequest({
        documentUri: document.uri,
        sourcePath: uri.fsPath,
        kind: 'file-picker',
        caller: request.caller ?? 'neko-model.project-add-source',
        requestId: request.requestId,
      }),
      document,
      webviewPanel,
      generation,
    );
  }

  private async addModelProjectSource(
    request: ProjectSourceAddRequest,
    document: ModelDocument,
    webviewPanel: vscode.WebviewPanel,
    generation: number,
  ): Promise<ProjectSourceAddResult> {
    const fileName = readModelSourceAddFileName(request);
    const result = await handleProjectSourceAddRequest(
      {
        ...request,
        caller: request.caller ?? 'neko-model.project-add-source',
        target: request.target ?? { role: 'model' },
        destination: {
          kind: 'project',
          directory: request.destination.directory ?? '.',
          copyMode: request.destination.copyMode ?? (request.bytes ? 'copy' : 'link'),
        },
        metadata: {
          ...(request.metadata ?? {}),
          modelAdd: true,
          name: fileName,
        },
      },
      {
        ingest: (ingestRequest) =>
          ingestProjectSourceAddRequest(ingestRequest, {
            documentPath: document.uri.fsPath,
            assetDirectory: request.destination.directory ?? '.',
            workspaceContext: createNkmSourcePolicyOptions(document.uri).context,
            fileOps: createVSCodeSourceAssetFileOps(),
            defaultFileName: 'model.glb',
            unmanagedSourceMessage:
              'Model source must be moved into the project, asset library, or a configured media root before saving.',
          }),
      },
    );

    if (!result.ok || !result.durablePath) {
      return result;
    }

    if (document.uri.fsPath.endsWith('.nkm')) {
      document.updateProjectData({
        model: { ...document.projectData.model, src: result.durablePath },
      });
    }

    const runtimePath =
      result.ingest?.outputPath ??
      (await resolveNkmProjectModelSource(document.uri)) ??
      request.sourcePath ??
      result.durablePath;
    await this.loadModelInEngine(runtimePath, webviewPanel, generation);
    return result;
  }

  private createModelProjectSourceAddRequest(input: {
    readonly documentUri: vscode.Uri;
    readonly sourcePath?: string;
    readonly fileName?: string;
    readonly bytes?: Uint8Array;
    readonly kind: ProjectSourceAddRequest['kind'];
    readonly caller: string;
    readonly requestId: string;
  }): ProjectSourceAddRequest {
    const fileName = input.fileName ?? path.basename(input.sourcePath ?? 'model.glb');
    return {
      requestId: input.requestId,
      kind: input.kind,
      formatId: 'nkm',
      documentUri: input.documentUri.toString(),
      ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
      ...(input.bytes ? { bytes: input.bytes } : {}),
      browserFile: { name: fileName },
      target: { role: 'model' },
      destination: { kind: 'project', directory: '.', copyMode: input.bytes ? 'copy' : 'link' },
      ingestMode: input.bytes ? 'create-asset' : 'link',
      caller: input.caller,
      metadata: { modelAdd: true, name: fileName },
    };
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
      const source = await this.resolveModelEngineSource(filePath, {
        purpose: 'model',
        caller: 'neko-model.load-model',
        mimeHint: modelMimeHint(filePath),
      });
      const data = await client.loadModel({ token: source.token });
      if (!this.rememberSceneSnapshot(data, 'loadModel')) return false;
      this.activeModelPath = source.sourcePath ?? filePath;
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
    sceneProfile: NkmSceneProfile = '3d',
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
        sceneProfile,
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
      const modelPath = await resolveNkmProjectModelSource(nkmUri);
      if (!modelPath) return false;

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
   * Read the profile before Engine load so empty 2D/Live projects do not fall
   * into 3D default content creation.
   */
  private async readNkmSceneProfile(nkmPath: string): Promise<NkmSceneProfile> {
    try {
      const loaded = await loadNkmProject(vscode.Uri.file(nkmPath));
      return loaded.project?.profile ?? '3d';
    } catch (err) {
      this.logError('readNkmSceneProfile', err);
      return '3d';
    }
  }

  /**
   * Create Blender-style default content for a new empty .nkm project.
   */
  private async ensureDefaultCubeModelForProject(
    nkmPath: string,
    document: ModelDocument,
    webviewPanel: vscode.WebviewPanel,
    generation: number,
  ): Promise<void> {
    if (!this.isPanelCurrent(webviewPanel, generation)) return;

    const name = path.basename(nkmPath, '.nkm');
    await this.handleModelProjectAddSource(
      this.createModelProjectSourceAddRequest({
        documentUri: document.uri,
        fileName: `${name}.glb`,
        bytes: generateDefaultCubeGlb(name),
        kind: 'generated-output',
        caller: 'neko-model.default-cube-add-source',
        requestId: `model-default-cube-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      }),
      document,
      webviewPanel,
      generation,
    );
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

  private async postEnvironmentCommand(
    panel: vscode.WebviewPanel,
    generation: number,
    placement: EnvironmentPlacement,
  ): Promise<void> {
    const patch = await this.environmentPatchFromPlacement(placement);
    if (!this.isPanelCurrent(panel, generation)) return;
    void this.postToPanel(panel, generation, {
      type: 'environmentCommand',
      patch,
      placement,
    });
  }

  private async environmentPatchFromPlacement(
    placement: EnvironmentPlacement,
  ): Promise<EnvironmentPatch> {
    const source =
      placement.sourceUri !== undefined
        ? await this.registerEnvironmentSource(placement)
        : {
            id: placement.sourceAssetId,
            uri: placement.sourceUri,
            kind: 'asset-handle',
          };

    return {
      environmentId: 'scene-environment',
      source,
      mode: placement.mode,
      rotationDeg: placement.rotationDeg,
      intensity: placement.intensity,
      exposure: placement.exposure,
      visibleAsBackground: placement.visibleAsBackground,
    };
  }

  private async registerEnvironmentSource(
    placement: EnvironmentPlacement,
  ): Promise<NonNullable<EnvironmentPatch['source']>> {
    const uri = vscode.Uri.parse(placement.sourceUri ?? placement.sourceAssetId);
    if (uri.scheme !== 'file') {
      return {
        id: placement.sourceAssetId,
        uri: placement.sourceUri,
        kind: 'asset-handle',
      };
    }

    try {
      const source = await this.resolveModelEngineSource(uri.fsPath, {
        purpose: 'preview',
        caller: 'neko-model.environment-source',
        mimeHint: 'image/*',
      });
      return {
        id: source.token,
        uri: source.uri,
        kind: 'file-token',
      };
    } catch (error) {
      this.logError('useEnvironment.registerFile', error);
      return {
        id: placement.sourceAssetId,
        uri: placement.sourceUri,
        kind: 'asset-handle',
      };
    }
  }

  private async resolveModelEngineSource(
    filePath: string,
    options: {
      readonly purpose: 'model' | 'preview';
      readonly caller: string;
      readonly mimeHint?: string;
    },
  ): Promise<ContentEngineSource> {
    const contentAccess = this.getModelContentAccess(filePath);
    const result = await contentAccess.resolve({
      ref: { kind: 'file', path: filePath },
      intent: 'interactive-preview',
      target: 'engine-source',
      caller: options.caller,
      metadata: {
        enginePurpose: options.purpose,
        ...(options.mimeHint ? { mimeType: options.mimeHint } : {}),
      },
    });
    if (result.status !== 'ready' || !result.engineSource) {
      throw new Error(result.error ?? 'Model source could not be registered with the engine.');
    }
    return result.engineSource;
  }

  private getModelContentAccess(filePath: string): ContentAccessService {
    if (this.modelContentAccess) return this.modelContentAccess;
    this.modelContentAccess = createHostContentAccessRuntime({
      workspaceRoot:
        vscode.workspace.getWorkspaceFolder?.(vscode.Uri.file(filePath))?.uri.fsPath ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
        path.dirname(filePath),
      sourceFileProvider: {
        engineSourceResolver: ({ request, path: resolvedPath }) =>
          this.createModelEngineSource(request, resolvedPath),
      },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
      logger,
    }).contentAccess;
    return this.modelContentAccess;
  }

  private async createModelEngineSource(
    request: ContentAccessRequest,
    filePath: string,
  ): Promise<ContentEngineSource> {
    const client = await this.ensureEngineClient();
    if (!client) {
      throw new Error('Neko Engine is not available for model source registration.');
    }
    const registered = await client.registerFile({
      filePath,
      purpose: readModelEnginePurpose(request),
      mimeHint: readStringMetadata(request.metadata, 'mimeType'),
    });
    return {
      token: registered.token,
      sourcePath: filePath,
      uri: registered.rangeUrl,
      runtimeOnly: true,
    };
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

  private resetStatusProjection(): void {
    this.statusProjection?.update(getDefaultModelStatusSnapshot());
  }

  private async setGlobalKeyboardEditable(documentUri: string, editable: boolean): Promise<void> {
    try {
      await updateWebviewKeyboardEditableOwner(
        `${MODEL_KEYBOARD_OWNER_PREFIX}${documentUri}`,
        editable,
      );
    } catch (error) {
      logger.warn('Failed to update Model keyboard editable owner', error);
    }
  }

  private async hasGlobalKeyboardEditableOwner(): Promise<boolean> {
    try {
      return await hasWebviewKeyboardEditableOwner();
    } catch (error) {
      logger.warn('Failed to query global Webview keyboard editable owner', error);
      return false;
    }
  }

  private async getHtmlForWebview(
    webview: vscode.Webview,
    documentUri: vscode.Uri,
  ): Promise<string> {
    const nonce = this.getNonce();

    try {
      return this.renderWebviewHtml(webview, documentUri, nonce, await this.readWebviewAssets());
    } catch (error) {
      logger.error(
        'Failed to load Model webview assets',
        error instanceof Error ? error.message : String(error),
      );
      return this.renderWebviewAssetErrorHtml(webview, nonce, error);
    }
  }

  private async readWebviewAssets(): Promise<WebviewAssetManifest> {
    const indexUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'dist',
      'webview',
      'index.html',
    );
    const indexBytes = await vscode.workspace.fs.readFile(indexUri);
    return parseViteWebviewAssets(new TextDecoder().decode(indexBytes));
  }

  private renderWebviewHtml(
    webview: vscode.Webview,
    documentUri: vscode.Uri,
    nonce: string,
    assets: WebviewAssetManifest,
  ): string {
    const styleTags = assets.styles
      .map((asset) => `<link rel="stylesheet" href="${this.toWebviewAssetUri(webview, asset)}">`)
      .join('\n  ');
    const scriptTags = assets.scripts
      .map(
        (asset) =>
          `<script nonce="${nonce}" type="module" src="${this.toWebviewAssetUri(webview, asset)}"></script>`,
      )
      .join('\n  ');

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
  ${styleTags}
  <title>3D Model Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.documentUri = ${JSON.stringify(documentUri.toString())};</script>
  ${scriptTags}
</body>
</html>`;
  }

  private renderWebviewAssetErrorHtml(
    webview: vscode.Webview,
    nonce: string,
    error: unknown,
  ): string {
    const message = error instanceof Error ? error.message : String(error);

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data:;
             font-src ${webview.cspSource};">
  <title>3D Model Editor</title>
</head>
<body>
  <main style="font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 24px;">
    <h1 style="font-size: 16px; margin: 0 0 8px;">${vscode.l10n.t('Unable to load Neko Model webview assets.')}</h1>
    <p style="margin: 0; color: var(--vscode-descriptionForeground);">${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
  }

  private toWebviewAssetUri(webview: vscode.Webview, assetPath: string): string {
    return webview
      .asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', ...assetPath.split('/')),
      )
      .toString();
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

export function parseViteWebviewAssets(indexHtml: string): WebviewAssetManifest {
  const scripts = Array.from(indexHtml.matchAll(/<script\b[^>]*>/gi))
    .map((match) => readHtmlAttribute(match[0], 'src'))
    .map((asset) => normalizeViteAssetPath(asset))
    .filter(isDefined);
  const styles = Array.from(indexHtml.matchAll(/<link\b[^>]*>/gi))
    .filter((match) => readHtmlAttribute(match[0], 'rel')?.toLowerCase() === 'stylesheet')
    .map((match) => normalizeViteAssetPath(readHtmlAttribute(match[0], 'href')))
    .filter(isDefined);

  if (scripts.length === 0) {
    throw new Error('Vite webview index.html does not reference a script asset.');
  }
  if (styles.length === 0) {
    throw new Error('Vite webview index.html does not reference a stylesheet asset.');
  }

  return {
    scripts: unique(scripts),
    styles: unique(styles),
  };
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

function parseModelStatusSnapshot(value: unknown): ModelStatusSnapshot | null {
  if (!isRecord(value)) return null;
  if (value['type'] !== 'modelStatus') return null;
  if (!isOptionalStringOrNull(value['selectedNodeName'])) return null;
  if (!isFiniteNumber(value['objectCount'])) return null;
  if (!isModelSceneControlStatus(value['sceneControlStatus'])) return null;
  if (!isOptionalStringOrNull(value['sceneControlError'])) return null;
  if (typeof value['hasPendingPrediction'] !== 'boolean') return null;
  if (!isOptionalFiniteNumberOrNull(value['enginePort'])) return null;
  if (!isFiniteNumber(value['sceneRevision'])) return null;

  return {
    selectedNodeName: value['selectedNodeName'] ?? null,
    objectCount: value['objectCount'],
    sceneControlStatus: value['sceneControlStatus'],
    sceneControlError: value['sceneControlError'] ?? null,
    hasPendingPrediction: value['hasPendingPrediction'],
    enginePort: value['enginePort'] ?? null,
    sceneRevision: value['sceneRevision'],
  };
}

function isModelSceneControlStatus(
  value: unknown,
): value is ModelStatusSnapshot['sceneControlStatus'] {
  return (
    value === 'disconnected' || value === 'connecting' || value === 'ready' || value === 'error'
  );
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
  if (!isOptionalBounds3(value['worldBounds'])) return false;
  return isOptionalLightPatch(value['light']);
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

function isOptionalLightPatch(value: unknown): value is LightPatch | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['nodeId'])) return false;
  if (!isNonEmptyString(value['kind'])) return false;
  if (!isOptionalVec3(value['color'])) return false;
  if (!isFiniteNumber(value['intensity'])) return false;
  if (!isOptionalFiniteNumber(value['range'])) return false;
  if (!isOptionalFiniteNumber(value['innerConeAngle'])) return false;
  if (!isOptionalFiniteNumber(value['outerConeAngle'])) return false;
  const shadow = value['shadow'];
  if (shadow === undefined) return true;
  if (!isRecord(shadow)) return false;
  if (typeof shadow['enabled'] !== 'boolean') return false;
  if (!isOptionalFiniteNumber(shadow['resolution'])) return false;
  return isOptionalFiniteNumber(shadow['bias']);
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

function isOptionalStringOrNull(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isString(value);
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

function isOptionalFiniteNumberOrNull(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getModelDocumentProjectData(document: ModelDocument): NkmProjectData {
  return document.projectData;
}

function normalizeModelEditorState(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isModelEditorLevelKeyboardAction(action: string): boolean {
  return MODEL_EDITOR_LEVEL_KEYBOARD_ACTIONS.has(action);
}

function modelMimeHint(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.glb') return 'model/gltf-binary';
  if (ext === '.gltf') return 'model/gltf+json';
  if (ext === '.vrm') return 'model/vrm';
  return undefined;
}

function readModelEnginePurpose(request: ContentAccessRequest): 'model' | 'preview' {
  const purpose = readStringMetadata(request.metadata, 'enginePurpose');
  return purpose === 'preview' ? 'preview' : 'model';
}

function normalizeViteAssetPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('/') || value.includes('..')) return undefined;
  const [pathWithoutQuery] = value.split(/[?#]/, 1);
  const normalized = pathWithoutQuery?.replace(/^\.?\//, '');
  if (!normalized || normalized.startsWith('http:') || normalized.startsWith('https:')) {
    return undefined;
  }
  return normalized;
}

function readHtmlAttribute(tag: string, attribute: string): string | undefined {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedAttribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1];
}

function unique<T>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function readModelSourceAddFileName(request: ProjectSourceAddRequest): string {
  const metadataName = request.metadata?.['name'];
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName;
  }
  const source =
    request.browserFile?.name ?? request.sourcePath ?? request.sourceUri ?? 'model.glb';
  const normalized = source.split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? source;
  const name = normalized.split('/').pop();
  return name && name.length > 0 ? decodeURIComponentSafe(name) : 'model.glb';
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
