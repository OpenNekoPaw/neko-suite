/**
 * Canvas Editor Provider - Custom editor for .nkc files
 *
 * Supports inline media playback via MediaPlaybackService
 * from @neko/neko-client (direct engine connection).
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'path';
import {
  createDefaultLocalResourceAccessService,
  createFocusedWebviewRegistry,
  createProjectSnapshotPackage,
  hasWebviewKeyboardEditableOwner,
  injectLocaleAttribute,
  normalizeLocalFilePath,
  updateWebviewKeyboardEditableOwner,
  type IFocusedWebviewRegistry,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import {
  buildStoryboardImportTimelineSyncPayload,
  createCanvasStoryboardExecutionSummary,
  extractCanvasNodeGenerationLineage,
  getPanoramicPreviewRoute,
  inferCanvasDocumentType,
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasModelType,
  inferNkProjectType,
  isDocumentArchiveResourceRef,
  isDocumentResourceStatusReason,
  isCanvasNodeType,
  isProjectedCanvasData,
  isProjectedCanvasSource,
  loadNkc,
  createProjectionAdapterRegistry,
  summarizeCanvasSubsystems,
} from '@neko/shared';
import type {
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasDroppedAsset,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasData,
  CanvasNode,
  CanvasNodeType,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  CanvasTimelineSyncPayload,
  CanvasStoryboardExecutionSummary,
  CanvasStoryboardExecutionSummaryRequest,
  CanvasStoryboardPayload,
  CreatedCanvasStoryboard,
  CanvasAgentActiveContextRequest,
  CanvasAgentActiveContextResult,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  DocumentResourceStatusReason,
  DocumentArchiveResourceRef,
  ProjectionAdapter,
  ProjectionAdapterRegistry,
  ProjectionDisposable,
  ProjectionSourceChangeEvent,
  ProjectionWriteBack,
  ProjectionWriteBackResult,
  ProjectedCanvasData,
  ProjectedCanvasSource,
  NekoStoryAPI,
  NekoStoryScriptIndex,
  ScriptScene,
} from '@neko/shared';
import type { CanvasChangeEvent, ShapeConfig } from '../api';
import type { CanvasOutlineProvider, CanvasOutlineData } from '../views/canvasOutlineProvider';
import type { CanvasStatusBar } from '../views/canvasStatusBar';
import { EngineClient, MediaPlaybackService } from '@neko/neko-client';
import type { PlaybackHandle, PlaybackMediaType } from '@neko/neko-client';
import { getLogger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';
import { BatchGenerationScheduler } from '../services/batchGenerationScheduler';

const logger = getLogger('CanvasEditorProvider');
const CANVAS_KEYBOARD_OWNER_PREFIX = 'neko.canvasEditor:';

const CANVAS_EDITOR_LEVEL_KEYBOARD_ACTIONS = new Set([
  'deleteSelected',
  'escape',
  'selectAll',
  'undo',
  'redo',
  'copy',
  'cut',
  'paste',
  'pasteInPlace',
  'duplicate',
  'resetZoom',
  'generateSelected',
]);

function isCanvasEditorLevelKeyboardAction(action: string): boolean {
  return CANVAS_EDITOR_LEVEL_KEYBOARD_ACTIONS.has(action);
}

function readPlaybackMediaType(value: unknown): PlaybackMediaType {
  return value === 'video' || value === 'audio' ? value : 'auto';
}

function assertCanvasNodeType(type: CanvasNodeType | undefined): void {
  if (type !== undefined && !isCanvasNodeType(type)) {
    throw new Error(`Unsupported Canvas node type "${type}"`);
  }
}

function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  const resolvedFilePath = realpathIfExists(filePath);
  const resolvedRootPath = realpathIfExists(rootPath);
  const relative = path.relative(
    path.normalize(resolvedRootPath),
    path.normalize(resolvedFilePath),
  );
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function realpathIfExists(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.normalize(filePath);
  }
}

function readCanvasSubsystemSummary(
  canvasData: Record<string, unknown>,
  nodes: readonly unknown[],
): string | undefined {
  const reportedStatus = canvasData._subsystemStatus;
  if (
    reportedStatus &&
    typeof reportedStatus === 'object' &&
    !Array.isArray(reportedStatus) &&
    Array.isArray((reportedStatus as { activeSubsystems?: unknown }).activeSubsystems)
  ) {
    const activeSubsystems = (
      reportedStatus as { activeSubsystems: readonly unknown[] }
    ).activeSubsystems.filter((item): item is string => typeof item === 'string');
    return activeSubsystems.length > 0 ? activeSubsystems.join(', ') : undefined;
  }

  const structurallyTypedNodes = nodes.filter(
    (node): node is CanvasNode =>
      typeof node === 'object' &&
      node !== null &&
      !Array.isArray(node) &&
      typeof (node as { type?: unknown }).type === 'string' &&
      isCanvasNodeType((node as { type: string }).type),
  );
  const summary = summarizeCanvasSubsystems({ nodes: structurallyTypedNodes });
  return summary.activeSubsystems.length > 0 ? summary.activeSubsystems.join(', ') : undefined;
}

function readCanvasProjectionSummary(canvasData: Record<string, unknown>): string | undefined {
  const projectionStatus = canvasData.projectionStatus;
  if (
    !projectionStatus ||
    typeof projectionStatus !== 'object' ||
    Array.isArray(projectionStatus)
  ) {
    return undefined;
  }
  const status = projectionStatus as { state?: unknown; message?: unknown };
  if (typeof status.state !== 'string' || status.state.length === 0) {
    return undefined;
  }

  return typeof status.message === 'string' && status.message.length > 0
    ? `Projected: ${status.state} - ${status.message}`
    : `Projected: ${status.state}`;
}

function createProjectionSourceKey(source: ProjectedCanvasSource): string {
  return `${source.kind}:${source.uri}`;
}

function hashProjectionSource(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Extract prompt-building fields from a shot node for batch generation paths
 * (e.g. `canvas_apply_style_transfer` → `generateBatch` → `generateImageForNode`)
 * where no explicit prompt is supplied by the caller. Returns `undefined` when
 * the node is not a shot so the caller can fall back to empty prompt.
 */
function extractShotPromptFields(node: CanvasNode):
  | {
      prompt: string;
      shotScale?: string;
      cameraMovement?: string;
      cameraAngle?: string;
    }
  | undefined {
  if (node.type !== 'shot') return undefined;
  const data = node.data as {
    visualDescription?: unknown;
    shotScale?: unknown;
    cameraMovement?: unknown;
    cameraAngle?: unknown;
    characterAction?: unknown;
    emotion?: unknown;
    sceneTags?: unknown;
    characters?: Array<{ characterName?: unknown; emotion?: unknown }>;
  };
  const parts: string[] = [];
  if (typeof data.visualDescription === 'string' && data.visualDescription.trim()) {
    parts.push(data.visualDescription.trim());
  }
  if (Array.isArray(data.characters) && data.characters.length > 0) {
    const names = data.characters
      .map((c) => (typeof c?.characterName === 'string' ? c.characterName : ''))
      .filter((n) => n.length > 0);
    if (names.length > 0) parts.push(`Characters: ${names.join(', ')}`);
  }
  if (typeof data.characterAction === 'string' && data.characterAction.trim()) {
    parts.push(`Action: ${data.characterAction.trim()}`);
  }
  if (Array.isArray(data.emotion) && data.emotion.length > 0) {
    const emotions = data.emotion.filter((e): e is string => typeof e === 'string' && e.length > 0);
    if (emotions.length > 0) parts.push(`Emotion: ${emotions.join(', ')}`);
  }
  if (Array.isArray(data.sceneTags) && data.sceneTags.length > 0) {
    const tags = data.sceneTags.filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
  }
  const result: {
    prompt: string;
    shotScale?: string;
    cameraMovement?: string;
    cameraAngle?: string;
  } = { prompt: parts.join('. ') };
  if (typeof data.shotScale === 'string') result.shotScale = data.shotScale;
  if (typeof data.cameraMovement === 'string') result.cameraMovement = data.cameraMovement;
  if (typeof data.cameraAngle === 'string') result.cameraAngle = data.cameraAngle;
  return result;
}

/**
 * Extract IP-Adapter reference IDs from a canvas node.
 * Shot nodes may have a top-level `referenceNodeId` and/or per-character
 * `characters[i].referenceNodeId`. Returns `undefined` if the node has no refs.
 */
function extractReferenceRefs(node: CanvasNode): string[] | undefined {
  if (node.type !== 'shot') return undefined;
  const data = node.data as {
    referenceNodeId?: unknown;
    characters?: Array<{ referenceNodeId?: unknown }>;
  };
  const refs = new Set<string>();
  if (typeof data.referenceNodeId === 'string' && data.referenceNodeId) {
    refs.add(data.referenceNodeId);
  }
  if (Array.isArray(data.characters)) {
    for (const c of data.characters) {
      if (typeof c?.referenceNodeId === 'string' && c.referenceNodeId) {
        refs.add(c.referenceNodeId);
      }
    }
  }
  return refs.size > 0 ? Array.from(refs) : undefined;
}

function readCanvasNodeContainerChildIds(node: Record<string, unknown>): string[] {
  const container = node.container;
  if (typeof container !== 'object' || container === null || Array.isArray(container)) {
    return [];
  }

  const childIds = (container as { childIds?: unknown }).childIds;
  return Array.isArray(childIds)
    ? childIds.filter((childId): childId is string => typeof childId === 'string')
    : [];
}

function mapStoryScriptIndexToCanvasScenes(index: NekoStoryScriptIndex | undefined): ScriptScene[] {
  if (!index) {
    return [];
  }

  return Array.from(index.scenes, (scene) => ({
    id: scene.sceneId,
    title: scene.sceneTitle || scene.heading,
    lineStart: scene.line_start,
    lineEnd: scene.line_end,
  }));
}

function mapOperationToCanvasChangeEvent(operation: {
  type?: string;
  payload?: Record<string, unknown>;
}): CanvasChangeEvent {
  const opType = operation.type ?? 'unknown';
  const payload = operation.payload ?? {};
  const payloadNode = payload['node'];
  const payloadGroupNode = payload['groupNode'];
  const nodeId =
    typeof payload['nodeId'] === 'string'
      ? payload['nodeId']
      : typeof payloadNode === 'object' &&
          payloadNode !== null &&
          typeof (payloadNode as { id?: unknown }).id === 'string'
        ? (payloadNode as { id: string }).id
        : typeof payloadGroupNode === 'object' &&
            payloadGroupNode !== null &&
            typeof (payloadGroupNode as { id?: unknown }).id === 'string'
          ? (payloadGroupNode as { id: string }).id
          : undefined;
  const nodeIds = Array.isArray(payload['childIds'])
    ? (payload['childIds'] as unknown[]).filter(
        (value): value is string => typeof value === 'string',
      )
    : nodeId
      ? [nodeId]
      : undefined;

  return {
    type: opType.includes('.add')
      ? 'add'
      : opType.includes('.remove') || opType.includes('.ungroup')
        ? 'delete'
        : 'update',
    nodeId,
    nodeIds,
    entityType: opType.startsWith('canvas.connection')
      ? 'connection'
      : opType.startsWith('canvas.node')
        ? 'node'
        : 'operation',
    reason: 'operationApplied',
    operationType: opType,
  };
}

interface NekoPreviewVariantAPI {
  registerPreviewAsset(request: {
    source: string;
    kind?: 'image' | 'video' | 'audio' | 'document' | 'unknown';
    expectedProjection?: 'flat' | 'equirectangular' | 'cubemap' | 'fisheye' | 'unknown';
    explicitOpen?: boolean;
  }): Promise<{
    assetId: string;
    variants: ReadonlyArray<{ role: string; url?: string }>;
  }>;
  requestPreviewVariant(
    assetId: string,
    request: { role: 'thumbnail' | 'proxy' | 'fov-crop'; width?: number; height?: number },
  ): Promise<{ url?: string }>;
  unregisterPreviewAsset(assetIdOrToken: string): Promise<void>;
}

function isPreviewVariantAPI(api: unknown): api is NekoPreviewVariantAPI {
  const candidate = api as Partial<NekoPreviewVariantAPI> | null;
  return (
    typeof candidate?.registerPreviewAsset === 'function' &&
    typeof candidate.requestPreviewVariant === 'function' &&
    typeof candidate.unregisterPreviewAsset === 'function'
  );
}

export class CanvasEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'neko.canvasEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly _onDidChangeCanvas = new vscode.EventEmitter<CanvasChangeEvent>();
  public readonly onDidChangeCanvas = this._onDidChangeCanvas.event;

  private readonly _onSelectionChange = new vscode.EventEmitter<CanvasNode[]>();
  public readonly onSelectionChange = this._onSelectionChange.event;

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private activeDocument: vscode.CustomDocument | undefined;
  private readonly webviewPanelsByDocumentUri = new Map<string, vscode.WebviewPanel>();
  private readonly canvasSnapshotsByDocumentUri = new Map<string, Record<string, unknown>>();

  // External providers for VSCode integration
  private outlineProvider: CanvasOutlineProvider | undefined;
  private statusBar: CanvasStatusBar | undefined;

  // Direct media playback via neko-client (no cross-extension dependency)
  private _engineClient: EngineClient | null = null;
  private _mediaPlayback: MediaPlaybackService | null = null;
  // Batch image generation scheduler
  private readonly scheduler = new BatchGenerationScheduler();
  // Track active streams per panel for cleanup
  private _activeStreams = new Map<vscode.WebviewPanel, Map<string, PlaybackHandle>>();
  private readonly localResourceAccess: LocalResourceAccessService;
  private readonly documentResourceCacheRoots: readonly vscode.Uri[];
  private readonly projectionAdapters: ProjectionAdapterRegistry =
    createProjectionAdapterRegistry();
  private readonly projectionSubscriptions = new Map<string, ProjectionDisposable>();
  private readonly focusedWebviews: IFocusedWebviewRegistry;

  constructor(
    private readonly context: vscode.ExtensionContext,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
  ) {
    this.focusedWebviews = focusedWebviews;
    this.localResourceAccess = createDefaultLocalResourceAccessService({
      extensionUri: context.extensionUri,
      context,
      logger,
    });
    this.documentResourceCacheRoots = [
      context.globalStorageUri,
      vscode.Uri.joinPath(context.globalStorageUri, 'document-image-cache'),
      ...(vscode.workspace.workspaceFolders ?? []).map((folder) =>
        vscode.Uri.joinPath(folder.uri, '.neko', '.cache'),
      ),
    ];
  }

  private async getMediaPlayback(): Promise<MediaPlaybackService | null> {
    if (this._mediaPlayback) return this._mediaPlayback;
    try {
      const result = await vscode.commands.executeCommand<{ port: number } | null>(
        'neko.engine.ensureFrameServer',
      );
      if (!result) {
        logger.warn('ensureFrameServer returned null');
        return null;
      }
      this._engineClient = new EngineClient(result.port);
      this._mediaPlayback = new MediaPlaybackService(this._engineClient);
      return this._mediaPlayback;
    } catch (error) {
      logger.error(`Failed to init media playback: ${error}`);
      return null;
    }
  }

  private async getPreviewVariantApi(): Promise<NekoPreviewVariantAPI | null> {
    try {
      const ext = vscode.extensions.getExtension('neko.neko-preview');
      if (!ext) return null;
      if (!ext.isActive) await ext.activate();
      const api = ext.exports;
      return isPreviewVariantAPI(api) ? api : null;
    } catch {
      return null;
    }
  }

  /** Wire up external providers after construction */
  setProviders(opts: { outline?: CanvasOutlineProvider; statusBar?: CanvasStatusBar }): void {
    this.outlineProvider = opts.outline;
    this.statusBar = opts.statusBar;
  }

  private setActiveCanvasEditor(
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): void {
    const documentUri = document.uri.toString();
    this.focusedWebviews.markActive(documentUri);
    this.activeWebviewPanel = webviewPanel;
    this.activeDocument = document;
    this.syncActiveCanvasChrome(documentUri);
    this.statusBar?.show();
  }

  private clearActiveCanvasEditor(webviewPanel: vscode.WebviewPanel): void {
    if (this.activeWebviewPanel !== webviewPanel) {
      return;
    }

    this.activeWebviewPanel = undefined;
    this.activeDocument = undefined;
    this.outlineProvider?.updateData(null);
    this.statusBar?.hide();
  }

  private getWebviewPanelForDocument(
    document: vscode.CustomDocument,
  ): vscode.WebviewPanel | undefined {
    return this.webviewPanelsByDocumentUri.get(document.uri.toString());
  }

  private async setGlobalKeyboardEditable(documentUri: string, editable: boolean): Promise<void> {
    try {
      await updateWebviewKeyboardEditableOwner(
        `${CANVAS_KEYBOARD_OWNER_PREFIX}${documentUri}`,
        editable,
      );
    } catch (error) {
      logger.warn('Failed to update Canvas keyboard editable owner', error);
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

  private isActiveCanvasDocument(document: vscode.CustomDocument): boolean {
    return this.activeDocument?.uri.toString() === document.uri.toString();
  }

  private rememberCanvasSnapshot(
    document: vscode.CustomDocument,
    canvasData: Record<string, unknown>,
  ): void {
    this.canvasSnapshotsByDocumentUri.set(document.uri.toString(), canvasData);
  }

  private syncActiveCanvasChrome(documentUri: string): void {
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) {
      this.outlineProvider?.updateData(null);
      return;
    }

    this.syncOutline(documentUri, canvasData);
    this.syncStatusBar(canvasData);
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const documentUri = document.uri.toString();
    this.webviewPanelsByDocumentUri.set(documentUri, webviewPanel);
    const focusedRegistration = this.focusedWebviews.register({
      id: documentUri,
      viewType: CanvasEditorProvider.viewType,
      documentUri,
      panel: webviewPanel,
      visible: webviewPanel.visible,
      active: webviewPanel.active,
    });
    this.context.subscriptions.push(focusedRegistration);

    const extraRoots =
      document.uri.scheme === 'file' ? [vscode.Uri.file(path.dirname(document.uri.fsPath))] : [];
    await this.localResourceAccess.configureWebview(webviewPanel.webview, {
      enableScripts: true,
      extraRoots,
    });

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    if (webviewPanel.active) {
      this.setActiveCanvasEditor(webviewPanel, document);
    }

    webviewPanel.onDidChangeViewState(
      (event) => {
        const panelId = document.uri.toString();
        this.focusedWebviews.markVisible(panelId, event.webviewPanel.visible);
        if (!event.webviewPanel.visible) {
          void this.setGlobalKeyboardEditable(panelId, false);
        }
        if (event.webviewPanel.active) {
          this.setActiveCanvasEditor(event.webviewPanel, document);
        } else if (this.activeWebviewPanel === event.webviewPanel) {
          this.focusedWebviews.markInactive(panelId);
          void this.setGlobalKeyboardEditable(panelId, false);
          this.clearActiveCanvasEditor(event.webviewPanel);
        } else {
          this.focusedWebviews.markInactive(panelId);
          void this.setGlobalKeyboardEditable(panelId, false);
        }
      },
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(async () => {
      focusedRegistration.dispose();
      await this.setGlobalKeyboardEditable(documentUri, false);
      this.webviewPanelsByDocumentUri.delete(documentUri);
      this.canvasSnapshotsByDocumentUri.delete(documentUri);
      const panelStreams = this._activeStreams.get(webviewPanel);
      if (panelStreams && panelStreams.size > 0) {
        const playback = await this.getMediaPlayback();
        for (const handle of panelStreams.values()) {
          await playback?.stopPlayback(handle).catch(() => {});
        }
        this._activeStreams.delete(webviewPanel);
      }
      if (this.activeWebviewPanel === webviewPanel) {
        this.clearActiveCanvasEditor(webviewPanel);
      }
    });

    if (webviewPanel.active) {
      this.statusBar?.show();
    }
  }

  async saveCustomDocument(
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.getWebviewPanelForDocument(document)?.webview.postMessage({ type: 'save' });
  }

  async saveCustomDocumentAs(
    document: vscode.CustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.getWebviewPanelForDocument(document)?.webview.postMessage({
      type: 'saveAs',
      path: destination.fsPath,
    });
  }

  async revertCustomDocument(
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.getWebviewPanelForDocument(document)?.webview.postMessage({ type: 'revert' });
  }

  async backupCustomDocument(
    _document: vscode.CustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    return {
      id: context.destination.toString(),
      delete: () => {},
    };
  }

  // Keyboard action forwarding
  async postKeyboardAction(action: string, documentUri?: vscode.Uri): Promise<boolean> {
    const request = {
      viewType: CanvasEditorProvider.viewType,
      documentUri: documentUri?.toString(),
      allowRecentVisibleFallback: false,
      allowSingleVisibleFallback: true,
    };
    if (
      isCanvasEditorLevelKeyboardAction(action) &&
      (this.focusedWebviews.hasKeyboardEditable(request) ||
        (await this.hasGlobalKeyboardEditableOwner()))
    ) {
      return false;
    }
    return this.focusedWebviews.postKeyboardAction(action, request);
  }

  /**
   * Forward a GeneratedAsset import to the active canvas webview (ADR-5 P0).
   * Returns false if no canvas editor is open.
   */
  async postImportAsset(asset: {
    path?: string;
    type?: string;
    name?: string;
    documentResourceRef?: DocumentArchiveResourceRef;
  }): Promise<boolean> {
    const activePanel = this.activeWebviewPanel;
    if (!activePanel) return false;
    await this.authorizeDocumentResourceRoot(activePanel.webview, asset);
    const webviewAsset = this.toWebviewImportAsset(activePanel.webview, asset);
    activePanel.webview.postMessage({
      type: 'importGeneratedAsset',
      asset: webviewAsset,
    });
    return true;
  }

  private toWebviewImportAsset(
    webview: vscode.Webview,
    asset: {
      path?: string;
      type?: string;
      name?: string;
      documentResourceRef?: DocumentArchiveResourceRef;
    },
  ): {
    path?: string;
    type?: string;
    name?: string;
    originalPath?: string;
    documentResourceRef?: DocumentArchiveResourceRef;
  } {
    if (!asset.path) return asset;
    if (
      asset.path.startsWith('http://') ||
      asset.path.startsWith('https://') ||
      asset.path.startsWith('blob:') ||
      asset.path.includes('vscode-resource.vscode-cdn.net')
    ) {
      return asset;
    }
    if (!(asset.path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(asset.path))) {
      return asset;
    }

    const webviewUri = this.projectLocalResource(webview, asset.path, 'neko-canvas.import-asset');
    if (!webviewUri) return asset;
    return {
      ...asset,
      originalPath: asset.path,
      path: webviewUri,
    };
  }

  /**
   * Update the generatedImage of a shot node and push the change to the webview.
   * Called by the `neko.canvas.updateNodeImage` command when Sketch sends back
   * an edited image via the round-trip workflow.
   */
  postUpdateNodeImage(nodeId: string, imageData: string, childNodeId?: string): boolean {
    if (!this.activeWebviewPanel) return false;
    this.activeWebviewPanel.webview.postMessage({
      type: 'updateNodeImage',
      nodeId,
      imageData,
      childNodeId,
    });
    return true;
  }

  // API Methods
  async addShape(shape: ShapeConfig): Promise<string> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    const result = await this.sendRequest<{ id: string }>('addShape', shape);
    this._onDidChangeCanvas.fire({ type: 'add', shapeId: result.id });
    return result.id;
  }

  async updateShape(shapeId: string, updates: Partial<ShapeConfig>): Promise<void> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    await this.sendRequest('updateShape', { shapeId, updates });
    this._onDidChangeCanvas.fire({ type: 'update', shapeId });
  }

  async deleteShape(shapeId: string): Promise<void> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    await this.sendRequest('deleteShape', { shapeId });
    this._onDidChangeCanvas.fire({ type: 'delete', shapeId });
  }

  // ===========================================================================
  // Node API — used by neko-agent Canvas MCP tools
  // ===========================================================================

  async listNodes(type?: CanvasNodeType): Promise<CanvasNode[]> {
    if (!this.activeWebviewPanel) return [];
    assertCanvasNodeType(type);
    const result = await this.sendRequest<{ nodes: CanvasNode[] }>('nodes.list', {
      nodeType: type,
    });
    return result.nodes;
  }

  async getNode(nodeId: string): Promise<CanvasNode | undefined> {
    if (!this.activeWebviewPanel) return undefined;
    const result = await this.sendRequest<{ node: CanvasNode | null }>('nodes.get', { nodeId });
    return result.node ?? undefined;
  }

  async updateNode(nodeId: string, data: Record<string, unknown>): Promise<void> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    await this.sendRequest('nodes.update', { nodeId, data });
    this._onDidChangeCanvas.fire({ type: 'update' });
  }

  async createNode(
    type: CanvasNodeType,
    position: { x: number; y: number },
    data: object,
    preset?: string,
  ): Promise<string> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    assertCanvasNodeType(type);
    const result = await this.sendRequest<{ nodeId: string }>('nodes.create', {
      payload: { type, position, data, preset },
    });
    this._onDidChangeCanvas.fire({ type: 'add' });
    return result.nodeId;
  }

  async deriveNode(request: CanvasDeriveNodeRequest): Promise<CanvasDeriveNodeResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    assertCanvasNodeType(request.targetType);
    const result = await this.sendRequest<CanvasDeriveNodeResult>('nodes.derive', {
      payload: request,
    });
    this._onDidChangeCanvas.fire({
      type: 'add',
      nodeId: result.nodeId,
      entityType: 'node',
      reason: 'nodeDerived',
      operationType: 'nodes.derive',
    });
    return result;
  }

  async createComposite(
    request: CanvasCreateCompositeRequest,
  ): Promise<CanvasCreateCompositeResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    assertCanvasNodeType(request.containerType);
    for (const child of request.children) {
      assertCanvasNodeType(child.type);
    }
    const result = await this.sendRequest<CanvasCreateCompositeResult>('nodes.createComposite', {
      payload: request,
    });
    this._onDidChangeCanvas.fire({
      type: 'add',
      nodeId: result.containerId,
      nodeIds: [result.containerId, ...result.childIds],
      entityType: 'node',
      reason: 'compositeCreated',
      operationType: 'nodes.createComposite',
    });
    return result;
  }

  async updateBlock(request: CanvasUpdateBlockRequest): Promise<CanvasUpdateBlockResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    const result = await this.sendRequest<CanvasUpdateBlockResult>('nodes.updateBlock', {
      payload: request,
    });
    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeId: result.nodeId,
      entityType: 'node',
      reason: 'blockUpdated',
      operationType: 'nodes.updateBlock',
    });
    return result;
  }

  async extractStructuredContent(
    request: CanvasExtractStructuredContentRequest,
  ): Promise<CanvasExtractStructuredContentResult> {
    if (!this.activeWebviewPanel) {
      return {
        format: request.format,
        nodeIds: [],
        nodes: [],
        content: request.format === 'json' ? [] : '',
      };
    }
    return this.sendRequest<CanvasExtractStructuredContentResult>(
      'nodes.extractStructuredContent',
      {
        payload: request,
      },
    );
  }

  async getActiveContext(
    request: CanvasAgentActiveContextRequest = {},
  ): Promise<CanvasAgentActiveContextResult> {
    if (!this.activeWebviewPanel) {
      return {
        documentUri: this.activeDocument?.uri.toString(),
        selectedNodeIds: [],
        selectedNodes: [],
      };
    }
    return this.sendRequest<CanvasAgentActiveContextResult>('nodes.getActiveContext', {
      payload: request,
    });
  }

  async applyAgentContent(
    payload: CanvasAgentContentPayload,
  ): Promise<CanvasAgentApplyContentResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    const result = await this.sendRequest<CanvasAgentApplyContentResult>(
      'nodes.applyAgentContent',
      {
        payload,
      },
    );
    this._onDidChangeCanvas.fire({
      type: result.createdNodeIds?.length ? 'add' : 'update',
      nodeId: result.nodeId,
      nodeIds: result.createdNodeIds,
      entityType: 'node',
      reason: 'agentContentApplied',
      operationType: 'nodes.applyAgentContent',
    });
    return result;
  }

  registerProjectionAdapter(adapter: ProjectionAdapter): ProjectionDisposable {
    const registration = this.projectionAdapters.register(adapter);
    const key = createProjectionSourceKey({ kind: adapter.kind, uri: adapter.sourceUri });
    const existing = this.projectionSubscriptions.get(key);
    existing?.dispose();
    this.projectionSubscriptions.set(
      key,
      adapter.onSourceChanged((event) => this.handleProjectionSourceChanged(event)),
    );
    return {
      dispose: () => {
        registration.dispose();
        const subscription = this.projectionSubscriptions.get(key);
        subscription?.dispose();
        this.projectionSubscriptions.delete(key);
      },
    };
  }

  async openProjectedCanvas(source: ProjectedCanvasSource): Promise<ProjectedCanvasData> {
    const adapter = this.getProjectionAdapter(source);
    const projected = await adapter.project();
    const cacheUri = this.getProjectionCacheUri(source);
    const data: ProjectedCanvasData = {
      ...projected,
      projected: true,
      projectionSource: source,
      projectionStatus: {
        ...(projected.projectionStatus ?? { state: 'clean' }),
        state: 'clean',
        cacheUri: cacheUri.toString(),
        updatedAt: Date.now(),
      },
    };
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(cacheUri.fsPath)));
    await vscode.workspace.fs.writeFile(
      cacheUri,
      Buffer.from(JSON.stringify(data, null, 2), 'utf-8'),
    );
    return data;
  }

  async writeProjectionBack(
    source: ProjectedCanvasSource,
    changes: readonly ProjectionWriteBack[],
  ): Promise<ProjectionWriteBackResult> {
    const adapter = this.getProjectionAdapter(source);
    return adapter.writeBack(changes);
  }

  private getProjectionAdapter(source: ProjectedCanvasSource): ProjectionAdapter {
    const adapter = this.projectionAdapters.get(source.kind, source.uri);
    if (!adapter) {
      throw new Error(`No ${source.kind} projection adapter registered for ${source.uri}`);
    }
    return adapter;
  }

  private getProjectionCacheUri(source: ProjectedCanvasSource): vscode.Uri {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri;
    const root = workspace
      ? vscode.Uri.joinPath(workspace, '.neko', '.cache')
      : vscode.Uri.joinPath(this.context.globalStorageUri, 'projected-canvas-cache');
    return vscode.Uri.joinPath(root, `${source.kind}-${hashProjectionSource(source.uri)}.nkc`);
  }

  private handleProjectionSourceChanged(event: ProjectionSourceChangeEvent): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'projectionSourceChanged',
      event,
    });
    this._onDidChangeCanvas.fire({
      type: 'update',
      entityType: 'operation',
      reason: 'projectionSourceChanged',
      operationType: 'projection.source.changed',
      documentUri: this.activeDocument?.uri.toString(),
    });
  }

  private async tryRegenerateProjectedCanvas(
    data: ProjectedCanvasData,
    webview: vscode.Webview,
    document: vscode.CustomDocument,
  ): Promise<void> {
    const adapter = this.projectionAdapters.get(
      data.projectionSource.kind,
      data.projectionSource.uri,
    );
    if (!adapter) {
      return;
    }

    try {
      const projected = await adapter.project();
      const cacheUri = this.getProjectionCacheUri(data.projectionSource);
      const nextData: ProjectedCanvasData = {
        ...projected,
        projected: true,
        projectionSource: data.projectionSource,
        viewport: data.viewport ?? projected.viewport,
        projectionStatus: {
          state: 'clean',
          cacheUri: cacheUri.toString(),
          updatedAt: Date.now(),
        },
      };
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(cacheUri.fsPath)));
      await vscode.workspace.fs.writeFile(
        cacheUri,
        Buffer.from(JSON.stringify(nextData, null, 2), 'utf-8'),
      );
      webview.postMessage({ type: 'update', data: nextData });
      const canvasRecord = nextData as unknown as Record<string, unknown>;
      this.rememberCanvasSnapshot(document, canvasRecord);
      if (this.isActiveCanvasDocument(document)) {
        this.syncOutline(document.uri.toString(), canvasRecord);
        this.syncStatusBar(canvasRecord);
      }
    } catch (error) {
      webview.postMessage({
        type: 'projectionStatus',
        status: {
          state: 'writeback-error',
          message: error instanceof Error ? error.message : String(error),
          updatedAt: Date.now(),
        },
      });
    }
  }

  async getStoryboardExecutionSummary(
    request: CanvasStoryboardExecutionSummaryRequest = {},
  ): Promise<CanvasStoryboardExecutionSummary> {
    if (!this.activeWebviewPanel) {
      return {
        sourceScriptUri: request.sourceScriptUri,
        canvasFileUri: request.canvasFileUri,
        status: 'not-available',
        scenes: [],
        error: 'No active canvas editor',
      };
    }

    const nodes = await this.listNodes();
    return createCanvasStoryboardExecutionSummary({
      nodes,
      request,
      canvasFileUri: this.activeDocument?.uri.toString() ?? request.canvasFileUri,
    });
  }

  async generateImageForNode(nodeId: string, childNodeId?: string): Promise<void> {
    const node = await this.getNode(nodeId);
    const lineage = node ? extractCanvasNodeGenerationLineage(node) : { sourceNodeId: nodeId };
    const referenceRefs = node ? extractReferenceRefs(node) : undefined;
    const shotFields = node ? extractShotPromptFields(node) : undefined;

    this.scheduler.enqueue({
      nodeId,
      childNodeId,
      params: {
        prompt: shotFields?.prompt ?? '',
        shotScale: shotFields?.shotScale,
        cameraMovement: shotFields?.cameraMovement,
        cameraAngle: shotFields?.cameraAngle,
        sourceNodeId: lineage?.sourceNodeId ?? nodeId,
        characterIds: lineage?.characterIds ? [...lineage.characterIds] : undefined,
        referenceRefs,
      },
      onProgress: (status, dataUrl) => {
        this.activeWebviewPanel?.webview.postMessage({
          type: 'generationProgress',
          nodeId,
          childNodeId,
          status,
          dataUrl,
        });
        if (status === 'done' && dataUrl) {
          void this.pushGeneratedToCut(nodeId, dataUrl);
        }
      },
    });
  }

  async generateBatchForNodes(nodeIds: string[]): Promise<void> {
    for (const nodeId of nodeIds) {
      await this.generateImageForNode(nodeId);
    }
  }

  reportStoryboardImport(payload: CanvasStoryboardPayload, created: CreatedCanvasStoryboard): void {
    const nodeIds = created.scenes.flatMap((scene) => [scene.sceneNodeId, ...scene.shotIds]);
    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeIds,
      documentUri: this.activeDocument?.uri.toString(),
      entityType: 'import',
      reason: 'storyboardImported',
      operationType: 'storyboard.import',
      sourceScriptUri: payload.sourceScriptUri,
      storyboardImport: created,
    });
  }

  /**
   * Save a base64 data URL to workspace .neko/generated/image/ and return a GeneratedImage.
   * ADR-4: writes binary to disk, returns JSON reference only.
   */
  private saveGeneratedImage(
    workspaceDir: string,
    nodeId: string,
    dataUrl: string,
  ): { filePath: string; assetId: string } {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
    const dir = path.join(workspaceDir, '.neko', 'generated', 'image');
    fs.mkdirSync(dir, { recursive: true });
    const assetId = crypto.randomUUID();
    const filePath = path.join(dir, `${assetId}.${ext}`);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { filePath, assetId };
  }

  /** If neko-cut is active, import the generated asset into the cut timeline. */
  private async pushGeneratedToCut(nodeId: string, dataUrl: string): Promise<void> {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) return;
    const cutExt = vscode.extensions.getExtension('neko.neko-cut');
    if (!cutExt?.isActive) return;
    try {
      const { filePath } = this.saveGeneratedImage(workspaceDir, nodeId, dataUrl);
      await vscode.commands.executeCommand('neko.cut.importGeneratedClip', { assetPath: filePath });
      logger.info('Auto-pushed generated image to neko-cut', { nodeId, assetPath: filePath });
    } catch (err) {
      logger.warn('Failed to push generated image to neko-cut', { nodeId, err });
    }
  }

  private reportCanvasReady(documentUri: vscode.Uri, data: Record<string, unknown> | null): void {
    const nodeIds = Array.isArray(data?.['nodes'])
      ? (data['nodes'] as unknown[])
          .map((node) => {
            if (typeof node !== 'object' || node === null) {
              return null;
            }
            return typeof (node as { id?: unknown }).id === 'string'
              ? (node as { id: string }).id
              : null;
          })
          .filter((nodeId): nodeId is string => nodeId !== null)
      : [];

    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeIds,
      documentUri: documentUri.toString(),
      entityType: 'operation',
      reason: 'editorReady',
      operationType: 'canvas.editor.ready',
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, documentUri: vscode.Uri): string {
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob: https:; font-src ${webview.cspSource}; media-src ${webview.cspSource} data: blob: https:; connect-src ws://127.0.0.1:* http://127.0.0.1:*;">
  <title>Canvas Editor</title>
  <link rel="stylesheet" href="${webviewUri}/assets/index.css">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.documentUri = "${documentUri.toString()}";
  </script>
  <script nonce="${nonce}" type="module" src="${webviewUri}/assets/index.js"></script>
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

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        this.focusedWebviews.syncFocus(document.uri.toString());
        // Read file content and send to webview
        try {
          const fileData = await vscode.workspace.fs.readFile(document.uri);
          const content = Buffer.from(fileData).toString('utf-8');
          const result = content.trim() ? loadNkc(content) : null;
          const data = result?.data ?? null;
          if (result && !result.validation.valid) {
            logger.warn(
              'NKC validation errors:',
              result.validation.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
            );
          }
          if (data) {
            const canvasRecord = data as unknown as Record<string, unknown>;
            await this.normalizeCanvasPathsForLoad(
              canvasRecord,
              document.uri,
              webviewPanel.webview,
            );
            if (isProjectedCanvasData(data)) {
              await this.tryRegenerateProjectedCanvas(data, webviewPanel.webview, document);
            }
          }
          webviewPanel.webview.postMessage({ type: 'update', data });
          // Sync outline & status bar on initial load
          if (data) {
            const canvasRecord = data as unknown as Record<string, unknown>;
            this.rememberCanvasSnapshot(document, canvasRecord);
            if (this.isActiveCanvasDocument(document)) {
              this.syncOutline(document.uri.toString(), canvasRecord);
              this.syncStatusBar(canvasRecord);
            }
          }
          this.reportCanvasReady(document.uri, data as unknown as Record<string, unknown> | null);
        } catch {
          // File is empty or invalid JSON — send null to use defaults
          webviewPanel.webview.postMessage({ type: 'update', data: null });
          this.reportCanvasReady(document.uri, null);
        }
        break;
      }
      case 'webviewKeyboardFocus': {
        if (typeof message.focused !== 'boolean') {
          break;
        }
        this.focusedWebviews.markKeyboardFocused(document.uri.toString(), message.focused);
        if (message.focused && webviewPanel.visible) {
          this.setActiveCanvasEditor(webviewPanel, document);
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
      case 'canvasAction': {
        if (message.action === 'openExport') {
          await vscode.commands.executeCommand('neko.neko-canvas.slashCommand.export');
        } else if (message.action === 'openPackage') {
          const data =
            message.data && typeof message.data === 'object'
              ? (message.data as Record<string, unknown>)
              : undefined;
          if (data) {
            await this.normalizeCanvasPathsForSave(data, document.uri);
            this.rememberCanvasSnapshot(document, data);
          }
          await createProjectSnapshotPackage({
            packageId: 'neko-canvas',
            title: 'Package Canvas Project',
            sourceUri: document.uri,
            sourceBytes: data ? Buffer.from(JSON.stringify(data, null, 2), 'utf-8') : undefined,
            metadata: {
              kind: 'canvas',
              viewType: CanvasEditorProvider.viewType,
            },
          });
        }
        break;
      }
      case 'save': {
        // Save canvas data back to file, normalizing asset paths for portability
        try {
          const data = message.data as Record<string, unknown>;
          await this.normalizeCanvasPathsForSave(data, document.uri);
          const projectedCanvas = data as unknown as CanvasData;
          const targetUri = isProjectedCanvasData(projectedCanvas)
            ? this.getProjectionCacheUri(projectedCanvas.projectionSource)
            : document.uri;
          const content = JSON.stringify(data, null, 2);
          if (targetUri.toString() !== document.uri.toString()) {
            await vscode.workspace.fs.createDirectory(
              vscode.Uri.file(path.dirname(targetUri.fsPath)),
            );
          }
          await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf-8'));
          // Sync outline & status bar on every save
          this.rememberCanvasSnapshot(document, data);
          if (this.isActiveCanvasDocument(document)) {
            this.syncOutline(document.uri.toString(), data);
            this.syncStatusBar(data);
          }
        } catch (error) {
          logger.error(`Failed to save: ${error}`);
        }
        break;
      }
      case 'canvasStatus': {
        // Webview reports status update (selection change, viewport change, etc.)
        const data = message.data as Record<string, unknown>;
        this.rememberCanvasSnapshot(document, data);
        if (this.isActiveCanvasDocument(document)) {
          this.syncStatusBar(data);
          this.syncOutline(document.uri.toString(), data);
        }
        break;
      }
      case 'projection.writeBack': {
        const requestId = message._requestId as number | undefined;
        if (requestId === undefined) break;
        try {
          const source = message.source;
          const changes = Array.isArray(message.changes)
            ? (message.changes as ProjectionWriteBack[])
            : [];
          if (!isProjectedCanvasSource(source)) {
            throw new Error('Invalid projected Canvas source');
          }
          const result = await this.writeProjectionBack(source, changes);
          webviewPanel.webview.postMessage({ type: '_response', _requestId: requestId, result });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: '_response',
            _requestId: requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        break;
      }
      case 'openMediaPreview': {
        // Open media in neko-preview's customEditor.
        const assetPath = this.resolveDocumentResourceAssetPath(
          message.assetPath as string | undefined,
          message.documentResourceRef,
        );
        const mediaTypeHint = message.mediaType as string | undefined;
        if (!assetPath) break;

        try {
          // Resolve to filesystem path (handles webview URIs, absolute, and relative paths)
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          const fileUri = vscode.Uri.file(fsPath);

          const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
          const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
          const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
          const panoramicRoute = getPanoramicPreviewRoute({
            filePath: fsPath,
            mediaType: mediaTypeHint,
          });

          if (panoramicRoute) {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              fileUri,
              panoramicRoute.viewType,
            );
          } else if (videoExts.includes(ext) || mediaTypeHint === 'video') {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoPreview');
          } else if (audioExts.includes(ext) || mediaTypeHint === 'audio') {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.audioPreview');
          } else {
            await vscode.commands.executeCommand('vscode.open', fileUri);
          }
        } catch (error) {
          logger.error(`Failed to open media preview: ${error}`);
          void handleError(error instanceof Error ? error : new Error(String(error)), {
            showToUser: true,
          });
        }
        break;
      }
      case 'preview:resolveVariant': {
        const requestId = message.requestId as string | undefined;
        const assetPath = this.resolveDocumentResourceAssetPath(
          message.assetPath as string | undefined,
          message.documentResourceRef,
        );
        const role = message.role as 'thumbnail' | 'proxy' | 'fov-crop' | undefined;
        const mediaTypeHint = message.mediaType as string | undefined;
        if (!requestId || !assetPath) break;

        try {
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          const variantApi = await this.getPreviewVariantApi();
          if (variantApi) {
            const panoramicRoute = getPanoramicPreviewRoute({
              filePath: fsPath,
              mediaType: mediaTypeHint,
            });
            const manifest = await variantApi.registerPreviewAsset({
              source: fsPath,
              kind:
                panoramicRoute?.kind ??
                (mediaTypeHint === 'image' || mediaTypeHint === 'video' || mediaTypeHint === 'audio'
                  ? mediaTypeHint
                  : 'unknown'),
              expectedProjection: panoramicRoute ? 'equirectangular' : undefined,
            });
            const variant = await variantApi.requestPreviewVariant(manifest.assetId, {
              role: role ?? 'thumbnail',
              width: 640,
              height: 360,
            });
            webviewPanel.webview.postMessage({
              type: 'preview:variantResolved',
              requestId,
              url: variant.url ?? manifest.variants.find((item) => item.role === 'source')?.url,
            });
          } else {
            const uri = this.projectLocalResource(
              webviewPanel.webview,
              fsPath,
              'neko-canvas.preview-variant',
            );
            if (!uri) {
              throw new Error(
                'Media path is outside authorized Webview roots. Add its folder as a media library or move it into the workspace.',
              );
            }
            webviewPanel.webview.postMessage({
              type: 'preview:variantResolved',
              requestId,
              url: uri,
            });
          }
        } catch (error) {
          logger.warn(`Preview variant resolution failed: ${error}`);
          webviewPanel.webview.postMessage({
            type: 'preview:variantResolved',
            requestId,
            error: error instanceof Error ? error.message : 'Preview variant resolution failed',
          });
        }
        break;
      }
      case 'preview:delegateAction': {
        const action = message.action as
          | { target?: string; command?: string; route?: string }
          | undefined;
        const asset = message.asset as
          | { path?: string; uri?: string; mediaType?: string }
          | undefined;
        const assetPath = asset?.path ?? asset?.uri;

        if (action?.command) {
          await vscode.commands.executeCommand(action.command, assetPath);
          break;
        }

        if (!assetPath) break;

        if (action?.target === 'project') {
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          const fileUri = vscode.Uri.file(fsPath);
          const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
          const editorIdMap: Record<string, string> = {
            nkv: 'neko.nekocut.editor',
            nka: 'neko.nekocut.editor',
            nkm: 'neko.nekomodel.editor',
            nkp: 'neko.nekopuppet.editor',
          };
          const editorId = editorIdMap[ext];
          if (editorId) {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, editorId);
          } else {
            await vscode.commands.executeCommand('vscode.open', fileUri);
          }
        } else if (
          action?.target === 'preview' ||
          action?.target === 'model' ||
          action?.target === 'cut' ||
          action?.target === 'audio'
        ) {
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          const fileUri = vscode.Uri.file(fsPath);
          const panoramicRoute = getPanoramicPreviewRoute({
            filePath: fsPath,
            mediaType: asset?.mediaType,
          });
          if (panoramicRoute) {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              fileUri,
              panoramicRoute.viewType,
            );
          } else {
            await vscode.commands.executeCommand('vscode.open', fileUri);
          }
        } else {
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath));
        }
        break;
      }
      case 'pickMedia': {
        // Open file picker for media files
        const mediaType = message.mediaType as string;
        const filters: Record<string, string[]> = {};
        switch (mediaType) {
          case 'image':
            filters['Images'] = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
            break;
          case 'video':
            filters['Videos'] = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'];
            break;
          case 'audio':
            filters['Audio'] = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
            break;
        }
        filters['All Files'] = ['*'];

        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters,
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          await this.addFeatureRoot(webviewPanel.webview, path.dirname(uri.fsPath));
          // Convert to webview URI so the webview can access the file
          const webviewUri = this.projectLocalResource(
            webviewPanel.webview,
            uri.fsPath,
            'neko-canvas.pick-media',
          );
          if (!webviewUri) break;
          const name = uri.path.split('/').pop() || 'media';
          webviewPanel.webview.postMessage({
            type: 'addMedia',
            mediaType,
            uri: webviewUri,
            name,
          });
        }
        break;
      }

      case 'pickCanvasDocument': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            'Neko Canvas': ['nkc'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'canvas.nkc';
          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const title = fileName.replace(/\.[^.]+$/, '') || 'Canvas';
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'canvas',
                path: contractedPath,
                name: fileName,
                title,
              },
            ],
          });
        }
        break;
      }

      case 'pickMediaFile': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
            Videos: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
            Audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'media';
          const mediaType = inferCanvasMediaType(fileName);
          if (!mediaType) break;

          await this.addFeatureRoot(webviewPanel.webview, path.dirname(uri.fsPath));
          const webviewUri = this.projectLocalResource(
            webviewPanel.webview,
            uri.fsPath,
            'neko-canvas.pick-media-file',
          );
          if (webviewUri) {
            webviewPanel.webview.postMessage({
              type: 'dropAssets',
              assets: [{ kind: 'media', path: webviewUri, name: fileName, mediaType }],
            });
          }
        }
        break;
      }

      case 'pickProjectDocument': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            'Neko Projects': ['nkv', 'nka', 'nkm', 'nkp'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'project.nkv';
          const projectType = inferNkProjectType(fileName);
          if (!projectType) break;

          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const title = fileName.replace(/\.[^.]+$/, '') || 'Project';
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'project',
                path: contractedPath,
                name: fileName,
                title,
                projectType,
              },
            ],
          });
        }
        break;
      }

      case 'pickScriptDocument': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Scripts: ['fountain', 'nks', 'story'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'script.fountain';
          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const title = fileName.replace(/\.[^.]+$/, '') || 'Script';
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'script',
                path: contractedPath,
                name: fileName,
                title,
              },
            ],
          });
        }
        break;
      }

      case 'pickReferenceDocument': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Documents: ['pdf', 'docx', 'epub', 'cbz'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'document.pdf';
          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const title = fileName.replace(/\.[^.]+$/, '') || 'Document';
          const docType = inferCanvasDocumentType(fileName);
          if (!docType) break;
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'document',
                path: contractedPath,
                name: fileName,
                title,
                docType,
              },
            ],
          });
        }
        break;
      }

      case 'pickModelReference': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Models: ['safetensors', 'ckpt', 'pt', 'pth', 'bin'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'model.safetensors';
          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const modelName = fileName.replace(/\.[^.]+$/, '') || 'Model';
          const modelType = inferCanvasModelType(fileName);
          if (!modelType) break;
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'model',
                path: contractedPath,
                name: fileName,
                modelName,
                modelType,
                role: 'reference',
              },
            ],
          });
        }
        break;
      }

      case 'pickFile': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
            Videos: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
            Audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
            Scripts: ['fountain', 'nks', 'story'],
            Documents: ['pdf', 'docx', 'epub', 'cbz'],
            Models: ['safetensors', 'ckpt', 'pt', 'pth', 'bin'],
            'Neko Canvas': ['nkc'],
            'Neko Projects': ['nkv', 'nka', 'nkm', 'nkp'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'file';
          const assetKind = inferCanvasDroppedAssetKind(fileName);
          if (!assetKind) break;

          let asset: CanvasDroppedAsset | undefined;
          const baseName = fileName.replace(/\.[^.]+$/, '');

          if (assetKind === 'media') {
            const mediaType = inferCanvasMediaType(fileName);
            if (mediaType) {
              await this.addFeatureRoot(webviewPanel.webview, path.dirname(uri.fsPath));
              const webviewUri = this.projectLocalResource(
                webviewPanel.webview,
                uri.fsPath,
                'neko-canvas.pick-file',
              );
              if (webviewUri) {
                asset = { kind: 'media', path: webviewUri, name: fileName, mediaType };
              }
            }
          } else {
            const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);

            if (assetKind === 'script') {
              asset = {
                kind: 'script',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Script',
              };
            } else if (assetKind === 'document') {
              const docType = inferCanvasDocumentType(fileName);
              if (docType) {
                asset = {
                  kind: 'document',
                  path: contractedPath,
                  name: fileName,
                  title: baseName || 'Document',
                  docType,
                };
              }
            } else if (assetKind === 'model') {
              const modelType = inferCanvasModelType(fileName);
              if (modelType) {
                asset = {
                  kind: 'model',
                  path: contractedPath,
                  name: fileName,
                  modelName: baseName || 'Model',
                  modelType,
                  role: 'reference',
                };
              }
            } else if (assetKind === 'canvas') {
              asset = {
                kind: 'canvas',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Canvas',
              };
            } else if (assetKind === 'project') {
              const projectType = inferNkProjectType(fileName);
              if (projectType) {
                asset = {
                  kind: 'project',
                  path: contractedPath,
                  name: fileName,
                  title: baseName || 'Project',
                  projectType,
                };
              }
            }
          }

          if (asset) {
            webviewPanel.webview.postMessage({ type: 'dropAssets', assets: [asset] });
          }
        }
        break;
      }

      case 'canvasChanged':
        this._onDidChangeCanvas.fire({
          type: message.changeType as 'add' | 'update' | 'delete',
          shapeId: message.shapeId as string | undefined,
        });
        break;

      case 'operationApplied':
        // EditOperation sync from webview — fire dirty event
        this._onDidChangeCustomDocument.fire({
          document,
          undo: () => {},
          redo: () => {},
        });
        this._onDidChangeCanvas.fire(
          mapOperationToCanvasChangeEvent(
            message.operation as {
              type?: string;
              payload?: Record<string, unknown>;
            },
          ),
        );
        break;

      // =================================================================
      // Cross-extension drag-and-drop (ADR-5 P1)
      // =================================================================

      case 'dnd:drop': {
        try {
          const payload = await vscode.commands.executeCommand<{
            path: string;
            mediaType: 'image' | 'video' | 'audio';
            name: string;
          } | null>('neko.agent.getDndPayload');

          if (payload) {
            await this.postImportAsset({ path: payload.path, type: payload.mediaType });
            await vscode.commands.executeCommand('neko.agent.clearDndPayload');
            logger.info(`DnD drop accepted: ${payload.name}`);
          }
        } catch (error) {
          logger.warn(`DnD drop failed (agent extension may not be installed): ${error}`);
        }
        break;
      }

      // =================================================================
      // Media playback via MediaPlaybackService (direct engine)
      // =================================================================

      case 'media:probe': {
        const assetPath = this.resolveDocumentResourceAssetPath(
          message.assetPath as string | undefined,
          message.documentResourceRef,
        );
        const mediaType = readPlaybackMediaType(message.mediaType);
        if (!assetPath) break;
        try {
          const filePath = await this.resolveAssetPath(assetPath, document.uri);
          const playback = await this.getMediaPlayback();
          if (!playback) {
            webviewPanel.webview.postMessage({
              type: 'media:probeResult',
              nodeId: message.nodeId,
              error: 'Media engine not available',
            });
            break;
          }
          const mediaInfo = await playback.probeMedia(filePath, mediaType);
          webviewPanel.webview.postMessage({
            type: 'media:probeResult',
            nodeId: message.nodeId,
            mediaInfo,
            port: playback.port,
          });
        } catch (error) {
          logger.error(`Probe failed: ${error}`);
          webviewPanel.webview.postMessage({
            type: 'media:probeResult',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Probe failed',
          });
        }
        break;
      }

      case 'media:play': {
        const assetPath = this.resolveDocumentResourceAssetPath(
          message.assetPath as string | undefined,
          message.documentResourceRef,
        );
        const mediaInfo = message.mediaInfo as Record<string, unknown>;
        const startTime = (message.startTime as number) ?? 0;
        const speed = (message.speed as number) ?? 1.0;
        const mediaType = readPlaybackMediaType(message.mediaType);
        if (!assetPath || !mediaInfo) break;
        try {
          const filePath = await this.resolveAssetPath(assetPath, document.uri);
          const playback = await this.getMediaPlayback();
          if (!playback) {
            webviewPanel.webview.postMessage({
              type: 'media:streamReady',
              nodeId: message.nodeId,
              error: 'Media engine not available',
            });
            break;
          }
          const nodeId = (message.nodeId as string) ?? assetPath;
          let panelStreams = this._activeStreams.get(webviewPanel);
          if (!panelStreams) {
            panelStreams = new Map();
            this._activeStreams.set(webviewPanel, panelStreams);
          }
          const prev = panelStreams.get(nodeId);
          if (prev) {
            await playback.stopPlayback(prev).catch(() => {});
          }
          const hasAudio = (mediaInfo.hasAudio as boolean) ?? true;
          const handle = await playback.startPlayback(filePath, {
            hasAudio,
            mediaType,
            startTime,
            speed,
          });
          panelStreams.set(nodeId, handle);
          webviewPanel.webview.postMessage({
            type: 'media:streamReady',
            nodeId: message.nodeId,
            videoStreamUrl: handle.videoStreamUrl,
            audioStreamUrl: handle.audioStreamUrl,
            videoStreamId: handle.videoStreamId,
            audioStreamId: handle.audioStreamId,
            mediaInfo,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'media:streamReady',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Play failed',
          });
        }
        break;
      }

      case 'media:seek': {
        const seekNodeId = (message.nodeId as string) ?? '';
        const seekHandle = this._activeStreams.get(webviewPanel)?.get(seekNodeId);
        if (!seekHandle) break;
        const seekPlayback = await this.getMediaPlayback();
        await seekPlayback?.seekPlayback(seekHandle, message.time as number);
        break;
      }

      case 'media:pause': {
        const pauseNodeId = (message.nodeId as string) ?? '';
        const pauseHandle = this._activeStreams.get(webviewPanel)?.get(pauseNodeId);
        if (!pauseHandle) break;
        const pausePlayback = await this.getMediaPlayback();
        await pausePlayback?.pausePlayback(pauseHandle);
        break;
      }

      case 'media:resume': {
        const resumeNodeId = (message.nodeId as string) ?? '';
        const resumeHandle = this._activeStreams.get(webviewPanel)?.get(resumeNodeId);
        if (!resumeHandle) break;
        const resumePlayback = await this.getMediaPlayback();
        await resumePlayback?.resumePlayback(resumeHandle);
        break;
      }

      case 'media:stop': {
        const stopNodeId = (message.nodeId as string) ?? '';
        const stopPanelStreams = this._activeStreams.get(webviewPanel);
        const stopHandle = stopPanelStreams?.get(stopNodeId);
        if (!stopHandle) break;
        const stopPlayback = await this.getMediaPlayback();
        await stopPlayback?.stopPlayback(stopHandle);
        stopPanelStreams?.delete(stopNodeId);
        if (stopPanelStreams?.size === 0) {
          this._activeStreams.delete(webviewPanel);
        }
        break;
      }

      case 'media:captureFrame': {
        const assetPath = this.resolveDocumentResourceAssetPath(
          message.assetPath as string | undefined,
          message.documentResourceRef,
        );
        const time = (message.time as number) ?? 0;
        if (!assetPath) break;
        try {
          const filePath = await this.resolveAssetPath(assetPath, document.uri);
          const playback = await this.getMediaPlayback();
          if (!playback) {
            webviewPanel.webview.postMessage({
              type: 'media:captureFrameResult',
              nodeId: message.nodeId,
              error: 'Media engine not available',
            });
            break;
          }
          const dataUrl = await playback.captureFrame(filePath, time);
          webviewPanel.webview.postMessage({
            type: 'media:captureFrameResult',
            nodeId: message.nodeId,
            dataUrl,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'media:captureFrameResult',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Capture failed',
          });
        }
        break;
      }

      case 'media:requestPanoramicThumbnail': {
        const assetPath = message.assetPath as string;
        if (!assetPath) break;
        let assetId: string | null = null;
        try {
          const filePath = await this.resolveAssetPath(assetPath, document.uri);
          const route = getPanoramicPreviewRoute({
            filePath,
            mediaType: message.mediaType as string | undefined,
          });
          if (!route) break;
          const variantApi = await this.getPreviewVariantApi();
          if (!variantApi) {
            webviewPanel.webview.postMessage({
              type: 'media:panoramicThumbnailResult',
              nodeId: message.nodeId,
              error: 'Preview variant API not available',
            });
            break;
          }
          const manifest = await variantApi.registerPreviewAsset({
            source: filePath,
            kind: route.kind,
            expectedProjection: 'equirectangular',
          });
          assetId = manifest.assetId;
          const variant = await variantApi.requestPreviewVariant(manifest.assetId, {
            role: route.kind === 'image' ? 'proxy' : 'thumbnail',
            width: 640,
            height: 320,
          });
          webviewPanel.webview.postMessage({
            type: 'media:panoramicThumbnailResult',
            nodeId: message.nodeId,
            url: variant.url ?? manifest.variants.find((item) => item.role === 'source')?.url,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'media:panoramicThumbnailResult',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Panoramic thumbnail failed',
          });
        } finally {
          if (assetId) {
            const variantApi = await this.getPreviewVariantApi();
            await variantApi?.unregisterPreviewAsset(assetId).catch(() => {});
          }
        }
        break;
      }

      case 'project:resolveThumbnail': {
        const projectPath = message.projectPath as string;
        const projectType = message.projectType as string;
        const nodeId = message.nodeId as string;
        if (!projectPath || !nodeId) break;
        try {
          const filePath = await this.resolveAssetPath(projectPath, document.uri);
          const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
          const projectData = JSON.parse(Buffer.from(raw).toString('utf-8')) as Record<
            string,
            unknown
          >;

          let assetSrc: string | undefined;
          if (projectType === 'nkv') {
            const tracks = projectData['tracks'] as
              | Array<{ elements?: Array<{ src?: string }> }>
              | undefined;
            assetSrc = tracks?.[0]?.elements?.[0]?.src;
          } else if (projectType === 'nkm') {
            const model = projectData['model'] as { src?: string } | undefined;
            assetSrc = model?.src;
          } else if (projectType === 'nkp') {
            const puppet = projectData['puppet'] as { src?: string } | undefined;
            assetSrc = puppet?.src;
          }

          if (!assetSrc) {
            webviewPanel.webview.postMessage({
              type: 'project:thumbnailResult',
              nodeId,
              error: 'No primary asset found in project file',
            });
            break;
          }

          const projectDir = filePath.replace(/[/\\][^/\\]+$/, '');
          const resolvedAssetPath = assetSrc.startsWith('/')
            ? assetSrc
            : `${projectDir}/${assetSrc}`;

          const playback = await this.getMediaPlayback();
          if (!playback) {
            webviewPanel.webview.postMessage({
              type: 'project:thumbnailResult',
              nodeId,
              error: 'Media engine not available',
            });
            break;
          }

          const dataUrl = await playback.captureFrame(resolvedAssetPath, 1);
          webviewPanel.webview.postMessage({
            type: 'project:thumbnailResult',
            nodeId,
            dataUrl,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'project:thumbnailResult',
            nodeId,
            error: error instanceof Error ? error.message : 'Thumbnail generation failed',
          });
        }
        break;
      }

      case 'project:openInEditor': {
        const projectPath = message.projectPath as string;
        const projectType = message.projectType as string;
        if (!projectPath) break;
        try {
          const filePath = await this.resolveAssetPath(projectPath, document.uri);
          const uri = vscode.Uri.file(filePath);
          const editorIdMap: Record<string, string> = {
            nkv: 'neko.nekocut.editor',
            nka: 'neko.nekocut.editor',
            nkm: 'neko.nekomodel.editor',
            nkp: 'neko.nekopuppet.editor',
          };
          const editorId = editorIdMap[projectType];
          if (editorId) {
            await vscode.commands.executeCommand('vscode.openWith', uri, editorId);
          } else {
            await vscode.commands.executeCommand('vscode.open', uri);
          }
        } catch (error) {
          logger.warn(`Failed to open project: ${error}`);
        }
        break;
      }

      case 'resolveDroppedFiles': {
        // Webview dropped files from VSCode explorer - resolve them into node-ready asset DTOs.
        const droppedUris = message.uris as string[];
        const resolvedAssets: CanvasDroppedAsset[] = [];

        for (const uriStr of droppedUris) {
          try {
            const fileUri = vscode.Uri.parse(uriStr);
            const fileName = fileUri.path.split('/').pop() || 'file';
            const assetKind = inferCanvasDroppedAssetKind(fileName);
            if (!assetKind) continue;

            if (assetKind === 'media') {
              const mediaType = inferCanvasMediaType(fileName);
              if (!mediaType) continue;

              await this.addFeatureRoot(webviewPanel.webview, path.dirname(fileUri.fsPath));
              const webviewUri = this.projectLocalResource(
                webviewPanel.webview,
                fileUri.fsPath,
                'neko-canvas.drop-file',
              );
              if (!webviewUri) continue;
              resolvedAssets.push({
                kind: 'media',
                path: webviewUri,
                name: fileName,
                mediaType,
              });
              continue;
            }

            const contractedPath = await this.contractAssetPath(fileUri.fsPath, document.uri);
            const baseName = fileName.replace(/\.[^.]+$/, '');

            if (assetKind === 'script') {
              resolvedAssets.push({
                kind: 'script',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Script',
              });
              continue;
            }

            if (assetKind === 'document') {
              const docType = inferCanvasDocumentType(fileName);
              if (!docType) continue;
              resolvedAssets.push({
                kind: 'document',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Document',
                docType,
              });
              continue;
            }

            if (assetKind === 'canvas') {
              resolvedAssets.push({
                kind: 'canvas',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Canvas',
              });
              continue;
            }

            if (assetKind === 'project') {
              const projectType = inferNkProjectType(fileName);
              if (!projectType) continue;
              resolvedAssets.push({
                kind: 'project',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Project',
                projectType,
              });
              continue;
            }

            const modelType = inferCanvasModelType(fileName);
            if (!modelType) continue;
            resolvedAssets.push({
              kind: 'model',
              path: contractedPath,
              name: fileName,
              modelName: baseName || 'Model',
              modelType,
              role: 'reference',
            });
          } catch {
            // Skip invalid URIs
            logger.warn(`Failed to resolve dropped URI: ${uriStr}`);
          }
        }

        if (resolvedAssets.length > 0) {
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: resolvedAssets,
          });
        }
        break;
      }

      case 'generateForNode': {
        // Delegate image generation to BatchGenerationScheduler → neko-agent
        const nodeId = message.nodeId as string;
        const childNodeId = message.childNodeId as string | undefined;
        const rawParams = message.params as Record<string, unknown>;
        if (!nodeId || typeof rawParams['prompt'] !== 'string') break;
        const node = await this.getNode(nodeId);
        const lineage = node ? extractCanvasNodeGenerationLineage(node) : { sourceNodeId: nodeId };
        // Strip any nodeId/childNodeId injected by webview — use trusted scheduler params only
        const {
          nodeId: _nId,
          childNodeId: _cId,
          ...sanitized
        } = rawParams as Record<string, unknown> & { nodeId?: unknown; childNodeId?: unknown };
        const refsFromNode = node ? extractReferenceRefs(node) : undefined;
        const params = {
          ...sanitized,
          prompt: rawParams['prompt'],
          sourceNodeId:
            typeof rawParams['sourceNodeId'] === 'string'
              ? rawParams['sourceNodeId']
              : (lineage?.sourceNodeId ?? nodeId),
          characterIds: Array.isArray(rawParams['characterIds'])
            ? rawParams['characterIds'].filter(
                (value): value is string => typeof value === 'string' && value.length > 0,
              )
            : lineage?.characterIds
              ? [...lineage.characterIds]
              : undefined,
          referenceRefs: Array.isArray(rawParams['referenceRefs'])
            ? rawParams['referenceRefs'].filter(
                (value): value is string => typeof value === 'string' && value.length > 0,
              )
            : refsFromNode,
        };

        this.scheduler.enqueue({
          nodeId,
          childNodeId,
          params,
          onProgress: (status: string, dataUrl?: string) => {
            webviewPanel.webview.postMessage({
              type: 'generationProgress',
              nodeId,
              childNodeId,
              status,
              dataUrl,
            });
          },
        });
        break;
      }

      case 'buildPrompt': {
        // Delegate AutoPrompt to neko-agent's buildPrompt command
        const { nodeId, shotData } = message;
        try {
          const prompt = await vscode.commands.executeCommand<string>(
            'neko.agent.buildPrompt',
            shotData,
          );
          webviewPanel.webview.postMessage({
            type: 'buildPromptResult',
            nodeId,
            prompt: prompt ?? '',
          });
        } catch {
          webviewPanel.webview.postMessage({
            type: 'buildPromptResult',
            nodeId,
            prompt: '',
            error: 'neko-agent not available',
          });
        }
        break;
      }

      case 'getScriptIndex': {
        // Fetch scene TOC from neko-story
        const scriptPath = message.scriptPath as string;
        const requestNodeId = message.nodeId as string;
        const storyExt = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');

        if (!storyExt) {
          webviewPanel.webview.postMessage({
            type: 'scriptIndexResult',
            nodeId: requestNodeId,
            scenes: null,
            error: 'neko-story not available',
          });
          break;
        }

        try {
          const storyApi = storyExt.isActive
            ? storyExt.exports
            : ((await storyExt.activate()) as NekoStoryAPI);
          const resolvedScriptPath = await this.resolveAssetPath(scriptPath, document.uri);
          const index = storyApi.getScriptIndex(resolvedScriptPath);

          webviewPanel.webview.postMessage({
            type: 'scriptIndexResult',
            nodeId: requestNodeId,
            scenes: mapStoryScriptIndexToCanvasScenes(index),
            error: index ? undefined : 'script index unavailable',
          });
        } catch {
          webviewPanel.webview.postMessage({
            type: 'scriptIndexResult',
            nodeId: requestNodeId,
            scenes: null,
            error: 'neko-story not available',
          });
        }
        break;
      }

      case 'openDocument': {
        // Open a document file using VSCode's default handler
        const docPath = message.docPath as string;
        if (!docPath) break;
        try {
          const fsPath = await this.resolveAssetPath(docPath, document.uri);
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath));
        } catch (error) {
          logger.error(`Failed to open document: ${error}`);
          void handleError(error instanceof Error ? error : new Error(String(error)), {
            showToUser: true,
          });
        }
        break;
      }

      case 'checkModelInstalled': {
        // Query neko-market for model installation status
        const modelPath = message.modelPath as string;
        const modelNodeId = message.nodeId as string;
        try {
          const installed = await vscode.commands.executeCommand<boolean>(
            'neko.market.isInstalled',
            modelPath,
          );
          // Webview expects installedVersion: string | null
          // neko.market.isInstalled returns boolean; convert to version string or null
          webviewPanel.webview.postMessage({
            type: 'modelInstalledResult',
            nodeId: modelNodeId,
            installedVersion: installed ? 'installed' : null,
          });
        } catch {
          webviewPanel.webview.postMessage({
            type: 'modelInstalledResult',
            nodeId: modelNodeId,
            installedVersion: null,
          });
        }
        break;
      }

      case 'importToTimeline': {
        // Forward storyboard shots to neko-cut for timeline import
        const { projectName, shots } = message as unknown as {
          projectName: string;
          shots: unknown[];
        };
        try {
          await vscode.commands.executeCommand('neko.cut.importStoryboard', {
            projectName,
            shots,
          });
          const shotIds = shots
            .map((shot) =>
              typeof shot === 'object' &&
              shot !== null &&
              typeof (shot as { id?: unknown }).id === 'string'
                ? (shot as { id: string }).id
                : null,
            )
            .filter((shotId): shotId is string => shotId !== null);
          const importedAt = Date.now();
          const payload: CanvasTimelineSyncPayload = buildStoryboardImportTimelineSyncPayload(
            shotIds,
            projectName,
            importedAt,
          );
          webviewPanel.webview.postMessage({
            type: 'timelineSync',
            payload,
          });
          this._onDidChangeCanvas.fire({
            type: 'update',
            nodeIds: shotIds,
            entityType: 'import',
            reason: 'importToTimeline',
            operationType: 'timeline.import',
          });
        } catch {
          void handleError(
            new Error(
              'neko-cut is not available. Install neko-cut to import storyboard to timeline.',
            ),
            { showToUser: true, severity: 'warning' },
          );
        }
        break;
      }

      case 'exportArtboard': {
        const artboardData = message.data as Record<string, unknown>;
        const artboardName = (artboardData.name as string) || 'Untitled Artboard';
        const safeName = artboardName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
        const format = (artboardData.format as string) || 'png';
        const imageData = artboardData.data as string | undefined;

        // 如果 webview 报告导出错误
        if (artboardData.error) {
          void handleError(new Error('Failed to capture artboard'), { showToUser: true });
          break;
        }

        if (!imageData) {
          void handleError(new Error('No image data received'), { showToUser: true });
          break;
        }

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.joinPath(
            vscode.Uri.file(document.uri.fsPath).with({
              path: document.uri.fsPath.replace(/[^/\\]+$/, ''),
            }),
            `${safeName}.${format}`,
          ),
          filters: {
            [format.toUpperCase()]: [format],
            'All Files': ['*'],
          },
        });

        if (saveUri) {
          try {
            const buffer = Buffer.from(imageData, 'base64');
            await vscode.workspace.fs.writeFile(saveUri, buffer);
            vscode.window.showInformationMessage(`Artboard exported: ${saveUri.fsPath}`);
          } catch (error) {
            logger.error(`Failed to export artboard: ${error}`);
            void handleError(error instanceof Error ? error : new Error(String(error)), {
              showToUser: true,
            });
          }
        }
        break;
      }
      case 'sendToAgent':
      case 'sendNodeToAgent': {
        const nodeIds = (message.nodeIds ?? []) as string[];
        const action = message.action as string;
        const intent = (message.intent as string | undefined) ?? undefined;

        if (action === 'generate') {
          // Generate image for the first selected ShotNode via Agent
          const nodeId = nodeIds[0];
          if (nodeId) await this.generateImageForNode(nodeId);
        } else if (action === 'batch') {
          // Batch-generate all selected ShotNodes
          await this.generateBatchForNodes(nodeIds);
        } else {
          // Send selected node as context to the Agent panel
          const nodeId = nodeIds[0];
          if (!nodeId) break;
          const node = await this.getNode(nodeId);
          if (!node) {
            logger.warn(`sendToAgent: node ${nodeId} not found`);
            void handleError(new Error('Cannot send to Agent: node not found'), {
              showToUser: true,
              severity: 'warning',
            });
            break;
          }
          const d = node.data as Record<string, unknown>;
          const payload = {
            type: 'canvas-node' as const,
            id: node.id,
            label:
              node.type === 'shot'
                ? `Shot #${String(d.shotNumber ?? '?').padStart(3, '0')}`
                : ((d.characterName as string | undefined) ?? node.type),
            summary: String(d.visualDescription ?? d.sceneTitle ?? ''),
            data: { nodes: nodeIds },
            intent,
          };
          try {
            await vscode.commands.executeCommand('neko.agent.sendContext', payload);
          } catch (err) {
            logger.error(`sendToAgent failed: ${err}`);
            void handleError(err instanceof Error ? err : new Error(String(err)), {
              showToUser: true,
              severity: 'warning',
            });
          }
        }
        break;
      }

      case 'editInSketch': {
        // Open the ShotNode's generated image in neko-sketch for round-trip editing
        const nodeId = message.nodeId as string;
        const imageDataFromWebview = (message.imageData as string | undefined) ?? null;

        const node = await this.getNode(nodeId);
        if (!node) break;

        const d = node.data as Record<string, unknown>;
        // Prefer the image provided by the webview; fall back to the stored generatedImage
        const raw = imageDataFromWebview ?? (d['generatedImage'] as string | undefined) ?? null;
        if (!raw) {
          void handleError(new Error('No generated image found for this shot node'), {
            showToUser: true,
            severity: 'warning',
          });
          break;
        }
        // Strip data URL prefix if present
        const base64 = raw.startsWith('data:') ? (raw.split(',')[1] ?? raw) : raw;
        const name = `Shot-${String(d['shotNumber'] ?? '').padStart(3, '0')}.png`;

        try {
          await vscode.commands.executeCommand('neko.sketch.editImage', {
            base64,
            name,
            context: {
              source: 'canvas',
              sourceNodeId: nodeId,
              metadata: {
                shotNumber: d['shotNumber'],
                childNodeId: d['childNodeId'],
              },
            },
          });
        } catch {
          void handleError(
            new Error('Failed to open image in Sketch — is neko-sketch installed?'),
            { showToUser: true },
          );
        }
        break;
      }

      case 'selectionChange': {
        const nodes = (message.nodes ?? []) as CanvasNode[];
        if (this.isActiveCanvasDocument(document)) {
          this._onSelectionChange.fire(nodes);
          this._onDidChangeCanvas.fire({
            type: 'update',
            entityType: 'selection',
            reason: 'selectionChange',
            nodeIds: nodes.map((node) => node.id),
            documentUri: document.uri.toString(),
          });
        }
        break;
      }

      case '_response': {
        // Resolve a pending sendRequest() promise from the webview
        const id = message._requestId as number;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.resolve(message);
        }
        break;
      }
    }
  }

  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  /** Resolve asset path (PathVariable, webview URI, relative, or absolute) to absolute filesystem path */
  private async resolveAssetPath(assetPath: string, documentUri: vscode.Uri): Promise<string> {
    // PathVariable: ${VAR}/rest → absolute
    if (assetPath.startsWith('${')) {
      try {
        const resolved = await vscode.commands.executeCommand<string>(
          'neko.assets.resolvePath',
          assetPath,
        );
        if (resolved) return resolved;
      } catch {
        // neko-assets not active
      }
      return assetPath;
    }
    // Handle webview URIs (https:/file+.vscode-resource.vscode-cdn.net/path/to/file)
    const vscodeResourceMatch = assetPath.match(/vscode-resource\.vscode-cdn\.net(\/.*)/);
    if (vscodeResourceMatch) {
      return decodeURIComponent(vscodeResourceMatch[1]!);
    }
    // Absolute filesystem path
    if (assetPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(assetPath)) {
      return assetPath;
    }
    // Relative path — resolve against document's directory
    const docDir = vscode.Uri.joinPath(documentUri, '..');
    return vscode.Uri.joinPath(docDir, assetPath).fsPath;
  }

  private resolveDocumentResourceAssetPath(
    assetPath: string | undefined,
    documentResourceRef: unknown,
  ): string | undefined {
    if (assetPath) {
      return assetPath;
    }
    return isDocumentArchiveResourceRef(documentResourceRef)
      ? documentResourceRef.cachePath
      : undefined;
  }

  /** Convert stored asset paths to webview URIs so the webview can display them */
  private async normalizeCanvasPathsForLoad(
    data: Record<string, unknown>,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<void> {
    const nodes = data['nodes'] as Array<Record<string, unknown>> | undefined;
    if (!nodes) return;

    for (const node of nodes) {
      if (node['type'] !== 'media') continue;
      const nodeData = node['data'] as Record<string, unknown> | undefined;
      if (!nodeData) continue;

      for (const key of ['assetPath', 'thumbnailPath'] as const) {
        const value = nodeData[key];
        if (typeof value !== 'string' || !value) continue;
        try {
          const fsPath = await this.resolveAssetPath(value, documentUri);
          const uri = this.projectLocalResource(webview, fsPath, 'neko-canvas.load-node-media');
          if (uri) nodeData[key] = uri;
        } catch {
          // leave as-is if resolution fails
        }
      }
      await this.materializeDocumentResourcePreview(nodeData, webview);
    }
  }

  private projectLocalResource(
    webview: vscode.Webview,
    source: string,
    caller: string,
  ): string | undefined {
    return this.localResourceAccess.createSyncProjector(
      webview,
      webview.options.localResourceRoots ?? [],
      { caller },
    )(source);
  }

  private async authorizeDocumentResourceRoot(
    webview: vscode.Webview,
    value: { readonly documentResourceRef?: DocumentArchiveResourceRef },
  ): Promise<void> {
    const cachePath = value.documentResourceRef?.cachePath;
    if (!cachePath) {
      return;
    }
    const root = this.resolveDocumentResourceCacheRoot(cachePath);
    if (root) {
      await this.addFeatureRoot(webview, root.fsPath);
    }
  }

  private async addFeatureRoot(webview: vscode.Webview, rootPath: string): Promise<void> {
    await this.localResourceAccess.configureWebview(webview, {
      enableScripts: true,
      extraRoots: [...(webview.options.localResourceRoots ?? []), vscode.Uri.file(rootPath)],
    });
  }

  private async materializeDocumentResourcePreview(
    nodeData: Record<string, unknown>,
    webview: vscode.Webview,
  ): Promise<void> {
    const resourceRef = nodeData['documentResourceRef'];
    if (!isDocumentArchiveResourceRef(resourceRef) || !resourceRef.cachePath) {
      return;
    }

    const cacheRoot = this.resolveDocumentResourceCacheRoot(resourceRef.cachePath);
    if (!cacheRoot) {
      this.markDocumentResourceUnavailable(nodeData, 'unauthorized-cache-root');
      return;
    }
    if (!fs.existsSync(resourceRef.cachePath)) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
      return;
    }

    await this.addFeatureRoot(webview, cacheRoot.fsPath);
    const runtimePath = this.projectLocalResource(
      webview,
      resourceRef.cachePath,
      'neko-canvas.document-resource-preview',
    );
    if (runtimePath) {
      nodeData['runtimeAssetPath'] = runtimePath;
      delete nodeData['documentResourceStatus'];
    } else {
      this.markDocumentResourceUnavailable(nodeData, 'projection-failed');
    }
  }

  private resolveDocumentResourceCacheRoot(cachePath: string): vscode.Uri | undefined {
    const localPath = normalizeLocalFilePath(cachePath);
    if (!localPath) {
      return undefined;
    }
    return this.documentResourceCacheRoots.find((root) => isPathInsideRoot(localPath, root.fsPath));
  }

  private markDocumentResourceUnavailable(
    nodeData: Record<string, unknown>,
    reason: DocumentResourceStatusReason,
  ): void {
    if (!isDocumentResourceStatusReason(reason)) {
      return;
    }
    delete nodeData['runtimeAssetPath'];
    delete nodeData['runtimeThumbnailPath'];
    nodeData['documentResourceStatus'] = {
      state: 'unavailable',
      reason,
      message:
        reason === 'cache-missing'
          ? 'Document cache expired. Reopen the source document to regenerate the preview.'
          : 'Document cache is outside the allowed project or VS Code cache roots.',
    };
  }

  /** Normalize all media node asset paths in canvas data for portable storage */
  private async normalizeCanvasPathsForSave(
    data: Record<string, unknown>,
    documentUri: vscode.Uri,
  ): Promise<void> {
    const nodes = data['nodes'] as Array<Record<string, unknown>> | undefined;
    if (!nodes) return;

    for (const node of nodes) {
      if (node['type'] !== 'media') continue;
      const nodeData = node['data'] as Record<string, unknown> | undefined;
      if (!nodeData) continue;

      delete nodeData['runtimeAssetPath'];
      delete nodeData['runtimeThumbnailPath'];
      delete nodeData['documentResourceStatus'];
      if (isDocumentArchiveResourceRef(nodeData['documentResourceRef'])) {
        continue;
      }
      if (typeof nodeData['assetPath'] !== 'string') continue;

      const assetPath = nodeData['assetPath'] as string;
      // Resolve to absolute first (handle webview URIs, relative, etc.)
      const absolutePath = await this.resolveAssetPath(assetPath, documentUri);
      // Contract to portable path
      nodeData['assetPath'] = await this.contractAssetPath(absolutePath, documentUri);
    }
  }

  /** Contract absolute path to portable path for storage */
  private async contractAssetPath(absolutePath: string, documentUri: vscode.Uri): Promise<string> {
    // Try PathVariable first (for external paths)
    try {
      const contracted = await vscode.commands.executeCommand<string>(
        'neko.assets.contractPath',
        absolutePath,
      );
      if (contracted && contracted.startsWith('${')) return contracted;
    } catch {
      // neko-assets not active
    }

    // Fallback: relative to document directory
    const docDir = path.dirname(documentUri.fsPath);
    return path.relative(docDir, absolutePath).split(path.sep).join('/');
  }

  // ===========================================================================
  // Data sync helpers for VSCode integration (outline, timeline, status bar)
  // ===========================================================================

  /** Extract outline data from raw canvas JSON and push to outline provider */
  private syncOutline(documentUri: string, canvasData: Record<string, unknown>): void {
    if (!this.outlineProvider) return;

    const nodes = (canvasData.nodes ?? []) as Array<Record<string, unknown>>;
    const connections = (canvasData.connections ?? []) as Array<Record<string, unknown>>;

    // Build node label lookup for connection display
    const nodeLabelMap = new Map<string, string>();
    const outlineNodes = nodes.map((n) => {
      const data = (n.data ?? {}) as Record<string, unknown>;
      const type = String(n.type ?? 'unknown');
      let label = 'Untitled';
      let detail: string | undefined;

      switch (type) {
        case 'media': {
          const path = String(data.assetPath ?? '');
          label = path.split('/').pop() || 'Media';
          detail = String(data.mediaType ?? 'media');
          break;
        }
        case 'storyboard':
          label = String(data.title || 'Scene');
          detail = data.description ? String(data.description).slice(0, 40) : undefined;
          break;
        case 'annotation':
          label = String(data.content || 'Note').slice(0, 30) || 'Note';
          detail = 'annotation';
          break;
        case 'group':
          label = String(data.label || 'Group');
          break;
        case 'text':
          label = String(data.content || 'Text').slice(0, 30) || 'Text';
          detail = 'text';
          break;
        case 'artboard':
          label = String(data.title || data.name || 'Artboard');
          detail = data.preset ? String(data.preset) : undefined;
          break;
        case 'shot': {
          const num = String(data.shotNumber ?? '?');
          const scale = data.shotScale ? ` [${String(data.shotScale)}]` : '';
          label = `#${num.padStart(3, '0')}${scale}`;
          detail = data.visualDescription ? String(data.visualDescription).slice(0, 40) : undefined;
          break;
        }
        case 'scene':
          label = String(data.sceneTitle || 'Scene');
          detail = data.location
            ? `${String(data.location)} · ${String(data.timeOfDay ?? '')}`
            : undefined;
          break;
        case 'gallery':
          label = String(data.characterName || '角色画廊');
          detail = data.preset ? String(data.preset) : undefined;
          break;
        case 'script':
          label = String(data.scriptTitle ?? 'Script');
          detail = data.scriptPath ? String(data.scriptPath).split('/').pop() : undefined;
          break;
        case 'document':
          label = String(data.title ?? 'Document');
          detail = data.docType ? String(data.docType).toUpperCase() : undefined;
          break;
        case 'model':
          label = String(data.modelName ?? 'Model');
          detail = data.modelType ? String(data.modelType) : undefined;
          break;
        case 'canvas-embed':
          label = String(data.canvasTitle ?? 'Canvas');
          detail = 'embed';
          break;
      }

      const id = String(n.id ?? '');
      nodeLabelMap.set(id, label);

      return {
        id,
        type,
        label,
        detail,
        locked: Boolean(n.locked),
        ...(type === 'scene' ? { childIds: readCanvasNodeContainerChildIds(n) } : {}),
      };
    });

    const outlineConnections = connections.map((c) => ({
      id: String(c.id ?? ''),
      sourceLabel: nodeLabelMap.get(String(c.sourceId ?? '')) ?? '?',
      targetLabel: nodeLabelMap.get(String(c.targetId ?? '')) ?? '?',
      label: c.label ? String(c.label) : undefined,
    }));

    const outlineData: CanvasOutlineData = {
      documentUri,
      name: String(canvasData.name ?? 'Canvas'),
      nodes: outlineNodes,
      connections: outlineConnections,
    };

    this.outlineProvider.updateData(outlineData);
  }

  /** Update VSCode status bar with canvas info */
  private syncStatusBar(canvasData: Record<string, unknown>): void {
    if (!this.statusBar) return;

    const nodes = (canvasData.nodes ?? []) as unknown[];
    const connections = (canvasData.connections ?? []) as unknown[];
    const viewport = (canvasData.viewport ?? { zoom: 1 }) as Record<string, unknown>;
    const selection = (canvasData._selection ?? {}) as Record<string, unknown>;
    const selectedNodeIds = (selection.nodeIds ?? []) as unknown[];
    const subsystemSummary = readCanvasSubsystemSummary(canvasData, nodes);
    const projectionSummary = readCanvasProjectionSummary(canvasData);

    this.statusBar.update({
      nodeCount: nodes.length,
      connectionCount: connections.length,
      zoom: Number(viewport.zoom ?? 1),
      selectedCount: selectedNodeIds.length,
      subsystemSummary,
      projectionSummary,
    });
  }

  private sendRequest<T>(type: string, data?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.activeWebviewPanel) {
        reject(new Error('No active webview'));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          if (
            typeof value === 'object' &&
            value !== null &&
            typeof (value as { error?: unknown }).error === 'string'
          ) {
            reject(new Error((value as { error: string }).error));
            return;
          }
          resolve(value as T);
        },
        reject,
      });

      this.activeWebviewPanel.webview.postMessage({
        type,
        _requestId: id,
        ...(data as Record<string, unknown>),
      });

      setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.reject(new Error(`Request timeout: ${type}`));
        }
      }, 30000);
    });
  }
}
