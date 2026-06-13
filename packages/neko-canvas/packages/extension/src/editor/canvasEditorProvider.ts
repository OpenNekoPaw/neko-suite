/**
 * Canvas Editor Provider - Custom editor for .nkc files
 *
 * Supports inline media playback via MediaPlaybackService
 * from @neko/neko-client (direct engine connection).
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';
import {
  createDefaultLocalResourceAccessService,
  createDocumentResourceRefFromArchiveRef,
  createFocusedWebviewRegistry,
  DocumentResourceCacheProvider,
  GeneratedAssetResourceCacheProvider,
  HostContentAccessService,
  PreviewVariantResourceCacheProvider,
  ResourceCacheContentAccessProvider,
  ThumbnailResourceCacheProvider,
  createVSCodeWorkspaceMediaPathContext,
  createProjectSnapshotPackage,
  hasWebviewKeyboardEditableOwner,
  injectLocaleAttribute,
  normalizeLocalFilePath,
  updateWebviewKeyboardEditableOwner,
  VSCodeResourceCacheService,
  type IFocusedWebviewRegistry,
  type ContentAccessService,
  type LocalResourceAccessService,
  type PreviewVariantResourceApi,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import {
  buildStoryboardImportTimelineSyncPayload,
  createCanvasStoryboardExecutionSummary,
  extractCanvasNodeGenerationLineage,
  projectCanvasShotPrompt,
  getPanoramicPreviewRoute,
  inferCanvasDocumentType,
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasModelType,
  inferNkProjectType,
  isDocumentArchiveResourceRef,
  isResourceRef,
  isDocumentResourceStatusReason,
  isCanvasNodeType,
  isCreativeEntityRef,
  isProjectedCanvasData,
  isProjectedCanvasSource,
  loadNkc,
  createProjectionAdapterRegistry,
  NEKO_EXTENSION_IDS,
  normalizeNarrativePreviewFeatureToggles,
  PathResolver,
  contractWorkspaceMediaPath,
  createWorkspaceMediaPathCandidates,
  resolveWorkspaceMediaPath,
  summarizeCanvasSubsystems,
  resolveStorageLayout,
} from '@neko/shared';
import type {
  CanvasPlaybackPlan,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasDroppedAsset,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasData,
  CanvasNode,
  CanvasNodeType,
  ContentAccessRequest,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  CanvasTimelineSyncPayload,
  CreativeEntityChangedRef,
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
  NekoAssetsAPI,
  NekoStoryAPI,
  NekoStoryScriptIndex,
  NarrativePreviewFeatureToggles,
  ResourceRef,
  ResourceVariantRole,
  ScriptScene,
  NarrativeGraphSnapshot,
  PreviewToCanvasMessage,
} from '@neko/shared';
import type { CanvasChangeEvent, ShapeConfig } from '../api';
import type { CanvasOutlineProvider, CanvasOutlineData } from '../views/canvasOutlineProvider';
import type { CanvasStatusBar } from '../views/canvasStatusBar';
import { EngineClient, MediaPlaybackService } from '@neko/neko-client';
import type { PlaybackHandle, PlaybackMediaType } from '@neko/neko-client';
import { getLogger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';
import { BatchGenerationScheduler } from '../services/batchGenerationScheduler';
import { createCanvasDocumentEntryReader } from '../services/documentEntryReader';
import {
  createCanvasPlaybackPlanFromCanvasData,
  createNarrativeGraphSnapshotFromCanvasData,
  NarrativePreviewBridge,
} from './narrativePreviewBridge';
import { handleCanvasEntityRoute, isCanvasEntityRouteMessage } from './canvasEntityRoutes';
import {
  applyCandidateEntityBackfill,
  mergePendingCandidateEntityBackfill,
  type CanvasEntityBackfillDiagnostic,
  type CanvasEntityPendingBackfill,
} from './canvasEntityBackfill';

const logger = getLogger('CanvasEditorProvider');
const CANVAS_KEYBOARD_OWNER_PREFIX = 'neko.canvasEditor:';
const CONTENT_ACCESS_WEBVIEW_RESOLVER_TOKEN_METADATA_KEY = 'webviewResolverToken';
const PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS = 4500;
const CANVAS_PREVIEW_SEMANTIC_FINGERPRINT_KEYS = [
  'name',
  'nodes',
  'connections',
  'narrative',
  'projectionStatus',
] as const;
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

type CanvasPlaybackPreviewSourceKind =
  | 'generated-image'
  | 'generated-media'
  | 'reference-image'
  | 'source-media'
  | 'media-asset';

interface CanvasPlaybackPreviewSourceProjection {
  readonly url: string;
  readonly kind: CanvasPlaybackPreviewSourceKind;
  readonly label?: string;
  readonly mediaType?: string;
  readonly refId?: string;
  readonly source?: CanvasPlaybackPreviewSourceCandidate;
  readonly playableAssetPath?: string;
}

interface CanvasPlaybackPreviewSourceCandidate {
  readonly source?: string;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
}

interface CanvasPlaybackPreviewSourceResolution {
  readonly url: string;
  readonly source: CanvasPlaybackPreviewSourceCandidate;
  readonly playableAssetPath?: string;
}

interface PreviewResourceVariantRequestContext {
  readonly requestId?: string;
  readonly sourceId?: string;
}

function isCanvasEditorLevelKeyboardAction(action: string): boolean {
  return CANVAS_EDITOR_LEVEL_KEYBOARD_ACTIONS.has(action);
}

function readPlaybackMediaType(value: unknown): PlaybackMediaType {
  return value === 'video' || value === 'audio' ? value : 'auto';
}

function isWorkspaceScopedVariablePath(value: string): boolean {
  return (
    value === '${WORKSPACE}' ||
    value.startsWith('${WORKSPACE}/') ||
    value === '${PROJECT}' ||
    value.startsWith('${PROJECT}/')
  );
}

function createWorkspacePathResolver(workspaceRoot: string): PathResolver {
  return new PathResolver(
    new Map([
      ['WORKSPACE', workspaceRoot],
      ['PROJECT', workspaceRoot],
    ]),
  );
}

function assertCanvasNodeType(type: CanvasNodeType | undefined): void {
  if (type !== undefined && !isCanvasNodeType(type)) {
    throw new Error(`Unsupported Canvas node type "${type}"`);
  }
}

function readCreativeEntityChangedRefs(event: unknown): CreativeEntityChangedRef[] {
  if (!isPlainRecord(event) || !Array.isArray(event['changedRefs'])) return [];
  return event['changedRefs'].filter((ref): ref is CreativeEntityChangedRef => {
    if (!isPlainRecord(ref)) return false;
    return (
      ref['kind'] === 'candidate' &&
      typeof ref['id'] === 'string' &&
      isCreativeEntityRef(ref['entityRef'])
    );
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createCanvasPreviewSemanticFingerprint(canvasData: Record<string, unknown>): string {
  const previewState: Record<string, unknown> = {};
  for (const key of CANVAS_PREVIEW_SEMANTIC_FINGERPRINT_KEYS) {
    previewState[key] = canvasData[key];
  }
  return stableCanvasPreviewStringify(previewState);
}

function stableCanvasPreviewStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableCanvasPreviewStringify(item)).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, entryValue]) => `${JSON.stringify(key)}:${stableCanvasPreviewStringify(entryValue)}`,
    )
    .join(',')}}`;
}

function resolveCanvasPreviewVariantRole(
  resourceRef: ResourceRef,
  preferredRole: ResourceVariantRole | undefined,
): ResourceVariantRole {
  if (resourceRef.kind === 'document' || resourceRef.source.kind === 'document') {
    return 'document-entry';
  }
  if (resourceRef.kind === 'generated' || resourceRef.source.kind === 'generated-asset') {
    return preferredRole === 'thumbnail' || preferredRole === 'preview' ? preferredRole : 'preview';
  }
  if (resourceRef.kind === 'media') {
    return preferredRole === 'thumbnail' ||
      preferredRole === 'proxy' ||
      preferredRole === 'fov-crop'
      ? preferredRole
      : 'thumbnail';
  }
  if (resourceRef.kind === 'preview') {
    return preferredRole === 'thumbnail' ||
      preferredRole === 'preview' ||
      preferredRole === 'proxy' ||
      preferredRole === 'fov-crop'
      ? preferredRole
      : 'preview';
  }
  return preferredRole ?? 'thumbnail';
}

function isWebviewOrRemoteUri(value: string): boolean {
  return /^(vscode-webview-resource:|vscode-resource:|webview:|https?:|data:|blob:)/i.test(value);
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
  return projectCanvasShotPrompt(node);
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
  }): ReturnType<PreviewVariantResourceApi['registerPreviewAsset']>;
  requestPreviewVariant(
    assetId: string,
    request: {
      role: 'thumbnail' | 'proxy' | 'fov-crop';
      width?: number;
      height?: number;
      format?: 'jpeg' | 'png' | 'webp';
    },
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
  private readonly canvasRevisionsByDocumentUri = new Map<string, number>();
  private readonly canvasPreviewFingerprintsByDocumentUri = new Map<string, string>();
  private readonly canvasDataReadyDocumentUris = new Set<string>();
  private pendingEntityBackfills: CanvasEntityPendingBackfill[] = [];
  private readonly narrativePreviewBridge: NarrativePreviewBridge;

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
  private readonly resourceCache: ResourceCacheService | undefined;
  private readonly contentAccess: ContentAccessService | undefined;
  private readonly contentAccessWebviewsByToken = new Map<string, vscode.Webview>();
  private contentAccessWebviewResolverSequence = 0;
  private readonly projectionAdapters: ProjectionAdapterRegistry =
    createProjectionAdapterRegistry();
  private readonly projectionSubscriptions = new Map<string, ProjectionDisposable>();
  private readonly focusedWebviews: IFocusedWebviewRegistry;
  private entityChangeSubscription: vscode.Disposable | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
    getNarrativePreviewFeatureToggles: () => NarrativePreviewFeatureToggles = () =>
      normalizeNarrativePreviewFeatureToggles(undefined),
  ) {
    this.focusedWebviews = focusedWebviews;
    this.narrativePreviewBridge = new NarrativePreviewBridge(this, {
      getFeatureToggles: getNarrativePreviewFeatureToggles,
      getMediaRuntimeScriptUri: () =>
        vscode.Uri.joinPath(
          this.context.extensionUri,
          'dist',
          'webview',
          'assets',
          'narrative-preview-media-runtime.js',
        ),
      getWebviewOptions: (sourceCanvasUri?: string) => ({
        localResourceRoots: [...this.getNarrativePreviewLocalResourceRoots(sourceCanvasUri)],
      }),
    });
    this.localResourceAccess = createDefaultLocalResourceAccessService({
      extensionUri: context.extensionUri,
      context,
      logger,
    });
    this.resourceCache = this.createProjectResourceCacheService();
    this.contentAccess = this.createContentAccessService();
    this.subscribeToEntityChangeEvents();
  }

  dispose(): void {
    this.entityChangeSubscription?.dispose();
    this.narrativePreviewBridge.dispose();
    this.scheduler.dispose();
    for (const subscription of this.projectionSubscriptions.values()) {
      subscription.dispose();
    }
    this.projectionSubscriptions.clear();
    this._onSelectionChange.dispose();
    this._onDidChangeCanvas.dispose();
    this._onDidChangeCustomDocument.dispose();
  }

  private createProjectResourceCacheService(): ResourceCacheService | undefined {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return undefined;
    }
    const layout = resolveStorageLayout(workspaceRoot, os.homedir() || workspaceRoot);
    return new VSCodeResourceCacheService({
      cacheRoot: layout.project.local.cache.resources,
      manifestPath: layout.project.local.cache.resourceManifest,
      projectRoot: workspaceRoot,
      localResourceAccess: this.localResourceAccess,
      providers: [
        new GeneratedAssetResourceCacheProvider({
          pathResolver: createWorkspacePathResolver(workspaceRoot),
          projectRoot: workspaceRoot,
        }),
        new ThumbnailResourceCacheProvider({
          generator: {
            generate: async (filePath, options) => {
              const api = await this.getNekoAssetsApi();
              const visual = await api?.getThumbnailVisual?.(filePath, {
                role: 'thumbnail',
                width: options.maxWidth,
                height: options.maxHeight,
                mimeType: 'image/jpeg',
              });
              const thumbnailPath =
                visual?.projectedUri && !isWebviewOrRemoteUri(visual.projectedUri)
                  ? visual.projectedUri
                  : await api?.getThumbnailPath(filePath);
              return thumbnailPath
                ? {
                    path: thumbnailPath,
                    width: options.maxWidth,
                    height: options.maxHeight,
                    mimeType: 'image/jpeg',
                  }
                : null;
            },
          },
        }),
        new PreviewVariantResourceCacheProvider({
          preview: this.createLazyPreviewVariantResourceApi(),
        }),
        new DocumentResourceCacheProvider({
          reader: {
            readRange: async () => {
              throw new Error('Canvas document range reader is unavailable.');
            },
          },
          entryReader: createCanvasDocumentEntryReader(workspaceRoot),
          enableRangeFallback: false,
        }),
      ],
      logger,
    });
  }

  private createContentAccessService(): ContentAccessService | undefined {
    if (!this.resourceCache) {
      return undefined;
    }
    return new HostContentAccessService({
      providers: [
        new ResourceCacheContentAccessProvider({
          resourceCache: this.resourceCache,
          webviewResolver: (request) => this.resolveContentAccessWebview(request),
        }),
      ],
      logger,
    });
  }

  private resolveContentAccessWebview(request: ContentAccessRequest): vscode.Webview | undefined {
    const token = request.metadata?.[CONTENT_ACCESS_WEBVIEW_RESOLVER_TOKEN_METADATA_KEY];
    return typeof token === 'string'
      ? this.contentAccessWebviewsByToken.get(token)
      : this.activeWebviewPanel?.webview;
  }

  private async withContentAccessWebview<T>(
    webview: vscode.Webview,
    operation: (webviewResolverToken: string) => Promise<T>,
  ): Promise<T> {
    this.contentAccessWebviewResolverSequence += 1;
    const webviewResolverToken = `neko-canvas-webview:${Date.now()}:${this.contentAccessWebviewResolverSequence}`;
    this.contentAccessWebviewsByToken.set(webviewResolverToken, webview);
    try {
      return await operation(webviewResolverToken);
    } finally {
      this.contentAccessWebviewsByToken.delete(webviewResolverToken);
    }
  }

  private async getNekoAssetsApi(): Promise<NekoAssetsAPI | null> {
    try {
      const ext = vscode.extensions.getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS);
      if (!ext) return null;
      if (!ext.isActive) await ext.activate();
      return ext.exports;
    } catch {
      return null;
    }
  }

  private createLazyPreviewVariantResourceApi(): PreviewVariantResourceApi {
    return {
      registerPreviewAsset: async (request) => {
        const api = await this.getPreviewVariantApi();
        if (!api) throw new Error('Preview variant API not available');
        return api.registerPreviewAsset(request);
      },
      requestPreviewVariant: async (assetId, request) => {
        const api = await this.getPreviewVariantApi();
        if (!api) throw new Error('Preview variant API not available');
        const variant = await api.requestPreviewVariant(assetId, request);
        return {
          id: `${assetId}:${request.role}`,
          assetId,
          role: request.role,
          ...variant,
        };
      },
      unregisterPreviewAsset: async (assetIdOrToken) => {
        const api = await this.getPreviewVariantApi();
        await api?.unregisterPreviewAsset(assetIdOrToken);
      },
    };
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

  private async disposeMediaPlaybackPanel(webviewPanel: vscode.WebviewPanel): Promise<void> {
    const panelStreams = this._activeStreams.get(webviewPanel);
    if (!panelStreams || panelStreams.size === 0) return;
    const playback = await this.getMediaPlayback();
    for (const handle of panelStreams.values()) {
      await playback?.stopPlayback(handle).catch(() => {});
    }
    this._activeStreams.delete(webviewPanel);
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

  hasActiveCanvasEditorReady(): boolean {
    const documentUri = this.activeDocument?.uri.toString();
    return documentUri !== undefined && this.canvasDataReadyDocumentUris.has(documentUri);
  }

  revealAnyCanvasEditor(): boolean {
    const nextPanel = this.webviewPanelsByDocumentUri.values().next();
    if (nextPanel.done) {
      return false;
    }
    nextPanel.value.reveal();
    return true;
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
    this.updateRememberedCanvasSnapshot(document.uri.toString(), canvasData);
    this.retryPendingEntityBackfills();
  }

  private updateRememberedCanvasSnapshot(
    documentUri: string,
    canvasData: Record<string, unknown>,
  ): void {
    const previousPreviewFingerprint = this.canvasPreviewFingerprintsByDocumentUri.get(documentUri);
    const nextPreviewFingerprint = createCanvasPreviewSemanticFingerprint(canvasData);
    this.canvasSnapshotsByDocumentUri.set(documentUri, canvasData);
    this.canvasRevisionsByDocumentUri.set(documentUri, this.getCanvasRevision(documentUri) + 1);
    this.canvasPreviewFingerprintsByDocumentUri.set(documentUri, nextPreviewFingerprint);
    if (
      previousPreviewFingerprint !== undefined &&
      previousPreviewFingerprint !== nextPreviewFingerprint
    ) {
      this.refreshNarrativePreview(documentUri);
    }
  }

  private getCanvasRevision(documentUri: string): number {
    return this.canvasRevisionsByDocumentUri.get(documentUri) ?? 0;
  }

  applyEntityCandidateBackfill(changedRefs: readonly CreativeEntityChangedRef[]): {
    updated: number;
    pending: boolean;
    diagnostics: readonly CanvasEntityBackfillDiagnostic[];
  } {
    const diagnostics: CanvasEntityBackfillDiagnostic[] = [];
    let updated = 0;

    for (const [documentUri, canvasData] of this.canvasSnapshotsByDocumentUri.entries()) {
      const result = applyCandidateEntityBackfill(canvasData, changedRefs);
      diagnostics.push(...result.diagnostics);
      if (!result.updated) continue;
      updated += result.matchedCount;
      this.updateRememberedCanvasSnapshot(documentUri, result.data);
      const webview = this.webviewPanelsByDocumentUri.get(documentUri)?.webview;
      webview?.postMessage({ type: 'update', data: result.data });
      this.syncOutline(documentUri, result.data);
      this.syncStatusBar(result.data);
    }

    if (updated === 0) {
      const mergeResult = mergePendingCandidateEntityBackfill(this.pendingEntityBackfills, {
        changedRefs: [...changedRefs],
        diagnostics,
      });
      this.pendingEntityBackfills = [...mergeResult.pending];
      return { updated, pending: mergeResult.queued, diagnostics };
    }

    return { updated, pending: false, diagnostics };
  }

  private retryPendingEntityBackfills(): void {
    if (this.pendingEntityBackfills.length === 0) return;
    const pending = this.pendingEntityBackfills.splice(0, this.pendingEntityBackfills.length);
    for (const entry of pending) {
      const result = this.applyEntityCandidateBackfill(entry.changedRefs);
      if (result.pending) {
        continue;
      }
    }
  }

  private subscribeToEntityChangeEvents(): void {
    const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!projectRoot) return;
    void vscode.commands
      .executeCommand<{
        onDidChangeEntity?: (listener: (event: unknown) => void) => vscode.Disposable;
      }>('neko.entity.getDashboardCreativeEntitySource', { projectRoot })
      .then((source) => {
        if (!source || typeof source.onDidChangeEntity !== 'function') return;
        this.entityChangeSubscription = source.onDidChangeEntity((event) => {
          const changedRefs = readCreativeEntityChangedRefs(event);
          if (changedRefs.length > 0) {
            this.applyEntityCandidateBackfill(changedRefs);
          }
        });
        this.context.subscriptions.push(this.entityChangeSubscription);
      })
      .then(undefined, (error) => {
        logger.debug('Canvas entity change subscription unavailable', error);
      });
  }

  openNarrativePreview(): Promise<boolean> {
    return this.narrativePreviewBridge.open();
  }

  refreshNarrativePreview(sourceCanvasUri?: string): boolean {
    return this.narrativePreviewBridge.refresh(sourceCanvasUri);
  }

  jumpNarrativePreviewToNode(nodeId: string): boolean {
    return this.narrativePreviewBridge.jumpTo(nodeId);
  }

  setNarrativePreviewVariables(variables: Readonly<Record<string, unknown>>): boolean {
    return this.narrativePreviewBridge.setVariables(variables);
  }

  extractNarrativeGraphSnapshot(): NarrativeGraphSnapshot | undefined {
    const document = this.activeDocument;
    if (!document) return undefined;
    return this.extractNarrativeGraphSnapshotForSource(document.uri.toString());
  }

  extractNarrativeGraphSnapshotForSource(documentUri: string): NarrativeGraphSnapshot | undefined {
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) return undefined;
    return createNarrativeGraphSnapshotFromCanvasData(canvasData, {
      revision: this.getCanvasRevision(documentUri),
      sourceCanvasUri: documentUri,
    });
  }

  extractCanvasPlaybackPlan(sourceCanvasUri?: string): CanvasPlaybackPlan | undefined {
    const documentUri = sourceCanvasUri ?? this.activeDocument?.uri.toString();
    if (!documentUri) return undefined;
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) return undefined;
    return createCanvasPlaybackPlanFromCanvasData(canvasData, {
      selectedNodeId: this.readCanvasPlaybackSelectedNodeId(canvasData),
    });
  }

  async extractCanvasPlaybackPlanForPreview(
    webview: vscode.Webview,
    sourceCanvasUri?: string,
  ): Promise<CanvasPlaybackPlan | undefined> {
    const documentUri = sourceCanvasUri ?? this.activeDocument?.uri.toString();
    if (!documentUri) return undefined;
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) return undefined;
    const parsedDocumentUri = vscode.Uri.parse(documentUri);
    const previewCanvasData = await this.prepareCanvasDataForPlaybackPreview(
      canvasData,
      parsedDocumentUri,
      webview,
    );
    const plan = createCanvasPlaybackPlanFromCanvasData(previewCanvasData, {
      selectedNodeId: this.readCanvasPlaybackSelectedNodeId(canvasData),
    });
    return this.enrichCanvasPlaybackPlanForPreview(
      plan,
      previewCanvasData,
      parsedDocumentUri,
      webview,
    );
  }

  private readCanvasPlaybackSelectedNodeId(
    canvasData: Record<string, unknown>,
  ): string | undefined {
    const selection = this.readNestedRecord(canvasData['_selection']);
    const nodeIds = selection?.['nodeIds'];
    if (!Array.isArray(nodeIds)) return undefined;
    return nodeIds.find((nodeId): nodeId is string => typeof nodeId === 'string');
  }

  private async prepareCanvasDataForPlaybackPreview(
    canvasData: Record<string, unknown>,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<Record<string, unknown>> {
    const previewCanvasData = this.cloneCanvasDataForPlaybackPreview(canvasData);
    await this.localResourceAccess.configureWebview(webview, {
      enableScripts: true,
      extraRoots: this.getCanvasLocalResourceRoots(documentUri),
    });
    return previewCanvasData;
  }

  private cloneCanvasDataForPlaybackPreview(
    canvasData: Record<string, unknown>,
  ): Record<string, unknown> {
    const parsed: unknown = JSON.parse(JSON.stringify(canvasData));
    const cloned = this.readNestedRecord(parsed);
    if (!cloned) {
      throw new Error('Preview canvas snapshot clone failed.');
    }
    return cloned;
  }

  postNarrativePreviewCanvasMessage(message: PreviewToCanvasMessage): boolean {
    switch (message.type) {
      case 'canvas:highlightNode':
        return this.postNarrativePreviewKeyboardAction(message, `selectNode:${message.nodeId}`);
      case 'canvas:highlightPath':
        return this.postNarrativeHighlightMessage(message);
      case 'canvas:choiceMade':
        return this.postNarrativeHighlightMessage(message);
    }
    return false;
  }

  async handleNarrativePreviewMediaMessage(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    sourceCanvasUri?: string,
  ): Promise<void> {
    const documentUri = sourceCanvasUri
      ? vscode.Uri.parse(sourceCanvasUri)
      : this.activeDocument?.uri;
    logger.debug(
      `Canvas Preview media host request: ${JSON.stringify({
        type: typeof message.type === 'string' ? message.type : undefined,
        nodeId: typeof message.nodeId === 'string' ? message.nodeId : undefined,
        assetPath: typeof message.assetPath === 'string' ? message.assetPath : undefined,
        sourceCanvasUri,
        documentUri: documentUri?.toString(),
      })}`,
    );
    if (!documentUri) {
      const response = {
        nodeId: message.nodeId,
        ...this.readNarrativePreviewSessionEnvelope(message),
      };
      if (message.type === 'media:probe') {
        await this.postMediaPlaybackResponse(webviewPanel, {
          type: 'media:probeResult',
          ...response,
          error: 'Preview media playback requires an active Canvas document or source Canvas URI.',
        });
        return;
      }
      if (message.type === 'media:play') {
        await this.postMediaPlaybackResponse(webviewPanel, {
          type: 'media:streamReady',
          ...response,
          error: 'Preview media playback requires an active Canvas document or source Canvas URI.',
        });
      }
      return;
    }
    await this.handleMediaPlaybackMessage(message, webviewPanel, documentUri);
  }

  async resolveNarrativePreviewVariant(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    sourceCanvasUri?: string,
  ): Promise<boolean> {
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    const documentUri = sourceCanvasUri
      ? vscode.Uri.parse(sourceCanvasUri)
      : this.activeDocument?.uri;
    if (!documentUri) {
      if (requestId) {
        return webviewPanel.webview.postMessage({
          type: 'preview:variantResolved',
          requestId,
          ...this.readNarrativePreviewSessionEnvelope(message),
          error:
            'Preview variant resolution requires an active Canvas document or source Canvas URI.',
        });
      }
      return false;
    }
    return this.handlePreviewVariantMessage(message, webviewPanel, documentUri);
  }

  private readNarrativePreviewSessionEnvelope(
    message: Record<string, unknown>,
  ): Record<string, string | number> {
    const sessionId = typeof message['sessionId'] === 'string' ? message['sessionId'] : undefined;
    const sourceCanvasUri =
      typeof message['sourceCanvasUri'] === 'string' ? message['sourceCanvasUri'] : undefined;
    const revision = typeof message['revision'] === 'number' ? message['revision'] : undefined;
    return {
      ...(sessionId ? { sessionId } : {}),
      ...(sourceCanvasUri ? { sourceCanvasUri } : {}),
      ...(revision !== undefined ? { revision } : {}),
    };
  }

  async disposeNarrativePreviewMediaPanel(webviewPanel: vscode.WebviewPanel): Promise<void> {
    await this.disposeMediaPlaybackPanel(webviewPanel);
  }

  private postNarrativeKeyboardAction(action: string): boolean {
    if (!this.activeWebviewPanel) return false;
    this.activeWebviewPanel.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
    return true;
  }

  private postNarrativeHighlightMessage(message: PreviewToCanvasMessage): boolean {
    const targetPanel = this.getNarrativePreviewTargetPanel(message);
    if (!targetPanel) return false;
    targetPanel.webview.postMessage({
      type: 'narrativePreviewCanvasMessage',
      message,
    });
    return true;
  }

  private postNarrativePreviewKeyboardAction(
    message: PreviewToCanvasMessage,
    action: string,
  ): boolean {
    const targetPanel = this.getNarrativePreviewTargetPanel(message);
    if (!targetPanel) return false;
    targetPanel.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
    return true;
  }

  private getNarrativePreviewTargetPanel(
    message: PreviewToCanvasMessage,
  ): vscode.WebviewPanel | undefined {
    return message.sourceCanvasUri
      ? (this.webviewPanelsByDocumentUri.get(message.sourceCanvasUri) ?? this.activeWebviewPanel)
      : this.activeWebviewPanel;
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
    this.canvasDataReadyDocumentUris.delete(documentUri);
    const focusedRegistration = this.focusedWebviews.register({
      id: documentUri,
      viewType: CanvasEditorProvider.viewType,
      documentUri,
      panel: webviewPanel,
      visible: webviewPanel.visible,
      active: webviewPanel.active,
    });
    this.context.subscriptions.push(focusedRegistration);

    await this.localResourceAccess.configureWebview(webviewPanel.webview, {
      enableScripts: true,
      extraRoots: this.getCanvasLocalResourceRoots(document.uri),
    });

    webviewPanel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

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
      this.canvasRevisionsByDocumentUri.delete(documentUri);
      this.canvasPreviewFingerprintsByDocumentUri.delete(documentUri);
      this.canvasDataReadyDocumentUris.delete(documentUri);
      this.narrativePreviewBridge.handleCanvasEditorClosed(documentUri);
      await this.disposeMediaPlaybackPanel(webviewPanel);
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
    resourceRef?: ResourceRef;
  }): Promise<boolean> {
    const activePanel = this.activeWebviewPanel;
    if (!activePanel) return false;
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
      resourceRef?: ResourceRef;
    },
  ): {
    path?: string;
    type?: string;
    name?: string;
    originalPath?: string;
    documentResourceRef?: DocumentArchiveResourceRef;
    resourceRef?: ResourceRef;
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
    const payload = await this.materializeCompositeRequestRuntimePaths(request);
    const result = await this.sendRequest<CanvasCreateCompositeResult>('nodes.createComposite', {
      payload,
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

  async createConnection(
    request: CanvasCreateConnectionRequest,
  ): Promise<CanvasCreateConnectionResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    const result = await this.sendRequest<CanvasCreateConnectionResult>('nodes.createConnection', {
      payload: request,
    });
    this._onDidChangeCanvas.fire({
      type: 'add',
      nodeId: request.sourceId,
      entityType: 'connection',
      reason: 'connectionCreated',
      operationType: 'nodes.createConnection',
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
   * Save a base64 data URL to workspace generated cache and return a GeneratedImage.
   * ADR-4: writes binary to disk, returns JSON reference only.
   */
  private saveGeneratedImage(
    workspaceDir: string,
    nodeId: string,
    dataUrl: string,
  ): { filePath: string; assetId: string } {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
    const generatedCacheDir = resolveStorageLayout(workspaceDir, os.homedir() || workspaceDir)
      .project.local.cache.generated;
    const dir = path.join(generatedCacheDir, 'image');
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
        this.canvasDataReadyDocumentUris.delete(document.uri.toString());
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
      case 'canvasDataReady': {
        const documentUri = document.uri.toString();
        this.canvasDataReadyDocumentUris.add(documentUri);
        if (webviewPanel.active) {
          this.setActiveCanvasEditor(webviewPanel, document);
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
        } else if (message.action === 'openNarrativePreview') {
          this.setActiveCanvasEditor(webviewPanel, document);
          await this.openNarrativePreview();
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
      case 'entity.summary':
      case 'entity.confirmCandidate':
      case 'entity.inspect': {
        const requestId = message._requestId as number | undefined;
        if (requestId === undefined) break;
        if (!isCanvasEntityRouteMessage(message)) {
          webviewPanel.webview.postMessage({
            type: '_response',
            _requestId: requestId,
            ok: false,
            message: vscode.l10n.t('Invalid Canvas entity route payload.'),
          });
          break;
        }
        const result = await handleCanvasEntityRoute(
          message,
          {
            projectRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            contextUri: document.uri.toString(),
          },
          {
            executeCommand: vscode.commands.executeCommand,
            translate: (text, ...args) => vscode.l10n.t(text, ...args),
          },
        );
        const backfill =
          message.type === 'entity.confirmCandidate' &&
          result.ok &&
          result.entityRef &&
          result.candidateId
            ? this.applyEntityCandidateBackfill([
                { kind: 'candidate', id: result.candidateId, entityRef: result.entityRef },
              ])
            : undefined;
        webviewPanel.webview.postMessage({
          type: '_response',
          _requestId: requestId,
          ...result,
          ...(backfill ? { backfill } : {}),
        });
        break;
      }
      case 'openMediaPreview': {
        // Open media in neko-preview's customEditor.
        const resourceRef = isResourceRef(message.resourceRef) ? message.resourceRef : undefined;
        const assetPath = this.resolveDocumentResourceAssetPath(
          message.assetPath as string | undefined,
          message.documentResourceRef,
          resourceRef,
        );
        const mediaTypeHint = message.mediaType as string | undefined;
        if (!assetPath && !resourceRef) break;

        try {
          const fsPath = resourceRef
            ? await this.resolveResourceRefLocalPreviewPath(
                resourceRef,
                'neko-canvas.open-media-preview',
              )
            : await this.resolveCanvasMediaLocalFilePath(
                assetPath!,
                document.uri,
                'neko-canvas.open-media-preview',
              );
          const fileUri = vscode.Uri.file(fsPath);

          const ext = fsPath.split('.').pop()?.toLowerCase() ?? '';
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
        await this.handlePreviewVariantMessage(message, webviewPanel, document.uri);
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
        const mediaType =
          message.mediaType === 'video' || message.mediaType === 'audio'
            ? message.mediaType
            : 'image';
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
          const fileName = uri.path.split('/').pop() || 'media';
          const mediaAsset = await this.createMediaDroppedAsset(
            webviewPanel.webview,
            uri.fsPath,
            'neko-canvas.pick-media',
            document.uri,
            fileName,
            mediaType,
          );
          if (!mediaAsset) break;
          webviewPanel.webview.postMessage({
            type: 'addMedia',
            mediaType,
            uri: mediaAsset.path,
            runtimeAssetPath: mediaAsset.runtimeAssetPath,
            originalPath: mediaAsset.originalPath,
            name: mediaAsset.name,
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

          const mediaAsset = await this.createMediaDroppedAsset(
            webviewPanel.webview,
            uri.fsPath,
            'neko-canvas.pick-media-file',
            document.uri,
            fileName,
            mediaType,
          );
          if (mediaAsset) {
            webviewPanel.webview.postMessage({
              type: 'dropAssets',
              assets: [mediaAsset],
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
              asset = await this.createMediaDroppedAsset(
                webviewPanel.webview,
                uri.fsPath,
                'neko-canvas.pick-file',
                document.uri,
                fileName,
                mediaType,
              );
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
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:play': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:seek': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:pause': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:resume': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:stop': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:captureFrame': {
        const resourceRef = isResourceRef(message.resourceRef) ? message.resourceRef : undefined;
        const assetPath = this.resolveDocumentResourceAssetPath(
          message.assetPath as string | undefined,
          message.documentResourceRef,
          resourceRef,
        );
        const time = (message.time as number) ?? 0;
        if (!assetPath && !resourceRef) break;
        try {
          const filePath = resourceRef
            ? await this.resolveResourceRefLocalPreviewPath(
                resourceRef,
                'neko-canvas.media-capture-frame',
              )
            : await this.resolveCanvasMediaLocalFilePath(
                assetPath!,
                document.uri,
                'neko-canvas.media-capture-frame',
              );
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
          const filePath = await this.resolveCanvasMediaLocalFilePath(
            assetPath,
            document.uri,
            'neko-canvas.media-panoramic-thumbnail',
          );
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

              const mediaAsset = await this.createMediaDroppedAsset(
                webviewPanel.webview,
                fileUri.fsPath,
                'neko-canvas.drop-file',
                document.uri,
                fileName,
                mediaType,
              );
              if (!mediaAsset) continue;
              resolvedAssets.push(mediaAsset);
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
    const source = assetPath.trim();
    // Handle webview URIs (https://file+.vscode-resource.vscode-cdn.net/path/to/file)
    const vscodeResourcePath = this.resolveVSCodeResourceUriPath(source);
    if (vscodeResourcePath) {
      return vscodeResourcePath;
    }
    try {
      const uri = vscode.Uri.parse(source);
      if (uri.scheme === 'file') {
        return uri.fsPath;
      }
      if (uri.scheme && !/^[A-Za-z]$/.test(uri.scheme)) {
        return source;
      }
    } catch {
      // Fall through to local path handling.
    }

    if (source.startsWith('${') && !isWorkspaceScopedVariablePath(source)) {
      try {
        const resolved = await vscode.commands.executeCommand<string>(
          'neko.assets.resolvePath',
          source,
        );
        if (resolved && !resolved.startsWith('${')) return resolved;
      } catch {
        // neko-assets not active
      }
    }

    const resolved = resolveWorkspaceMediaPath({
      source,
      context: this.createCanvasWorkspaceMediaPathContext(documentUri),
      fileExists: (filePath) => this.isExistingLocalFile(filePath),
    });
    if (resolved.status === 'resolved-local') {
      return resolved.path;
    }

    const planned = createWorkspaceMediaPathCandidates(
      source,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    );
    const candidate = planned.candidates[0]?.path;
    if (
      candidate &&
      (planned.classification.kind === 'variable' ||
        (planned.classification.kind === 'workspace-relative' &&
          !source.startsWith('../') &&
          source !== '..'))
    ) {
      return candidate;
    }
    if (planned.classification.kind === 'absolute-local') {
      return source;
    }
    // Legacy fallback: older Canvas files stored paths relative to the .nkc directory.
    const docDir = vscode.Uri.joinPath(documentUri, '..');
    return vscode.Uri.joinPath(docDir, source).fsPath;
  }

  private resolveWorkspaceVariableAssetPath(
    assetPath: string,
    documentUri: vscode.Uri,
  ): string | undefined {
    return this.resolveWorkspaceVariableAssetPathCandidates(assetPath, documentUri)[0];
  }

  private resolveWorkspaceVariableAssetPathCandidates(
    assetPath: string,
    documentUri: vscode.Uri,
  ): readonly string[] {
    if (!isWorkspaceScopedVariablePath(assetPath)) return [];
    return createWorkspaceMediaPathCandidates(
      assetPath,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    ).candidates.map((candidate) => candidate.path);
  }

  private resolveVSCodeResourceUriPath(value: string): string | undefined {
    const source = value.trim();
    try {
      const url = new URL(source);
      if (/vscode-resource\.vscode-cdn\.net$/i.test(url.hostname)) {
        return decodeURIComponent(url.pathname);
      }
    } catch {
      // Fall through to permissive parsing for VSCode's historical URI shapes.
    }

    const cdnMatch = source.match(/vscode-resource\.vscode-cdn\.net(\/[^?#]*)/i);
    if (cdnMatch?.[1]) {
      return decodeURIComponent(cdnMatch[1]);
    }

    try {
      const uri = vscode.Uri.parse(source);
      if (
        (uri.scheme === 'vscode-resource' || uri.scheme === 'vscode-webview-resource') &&
        uri.path
      ) {
        return uri.fsPath || uri.path;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private resolveDocumentResourceAssetPath(
    assetPath: string | undefined,
    documentResourceRef: unknown,
    resourceRef?: unknown,
  ): string | undefined {
    if (assetPath) {
      return assetPath;
    }
    return isDocumentArchiveResourceRef(documentResourceRef)
      ? documentResourceRef.cachePath
      : undefined;
  }

  private async handleMediaPlaybackMessage(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    documentUri: vscode.Uri,
  ): Promise<void> {
    switch (message.type) {
      case 'media:probe': {
        const mediaType = readPlaybackMediaType(message.mediaType);
        try {
          const filePath = await this.resolveMediaPlaybackFilePath(
            message,
            documentUri,
            'neko-canvas.media-probe',
          );
          if (!filePath) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:probeResult',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media source could not be resolved to a local file path.',
            });
            break;
          }
          const playback = await this.getMediaPlayback();
          if (!playback) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:probeResult',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media engine not available',
            });
            break;
          }
          const mediaInfo = await playback.probeMedia(filePath, mediaType);
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:probeResult',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            mediaInfo,
            port: playback.port,
          });
        } catch (error) {
          logger.error(`Probe failed: ${error}`);
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:probeResult',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            error: error instanceof Error ? error.message : 'Probe failed',
          });
        }
        break;
      }

      case 'media:play': {
        const mediaInfo = message.mediaInfo as Record<string, unknown> | undefined;
        const startTime = (message.startTime as number) ?? 0;
        const speed = (message.speed as number) ?? 1.0;
        const mediaType = readPlaybackMediaType(message.mediaType);
        if (!mediaInfo) {
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            error: 'Media playback requires probe metadata before stream creation.',
          });
          break;
        }
        try {
          const filePath = await this.resolveMediaPlaybackFilePath(
            message,
            documentUri,
            'neko-canvas.media-play',
          );
          if (!filePath) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:streamReady',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media source could not be resolved to a local file path.',
            });
            break;
          }
          const playback = await this.getMediaPlayback();
          if (!playback) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:streamReady',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media engine not available',
            });
            break;
          }
          const nodeId = (message.nodeId as string) ?? filePath;
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
          if (!handle.videoStreamUrl && !handle.audioStreamUrl) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:streamReady',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media stream could not be created for this source.',
            });
            break;
          }
          panelStreams.set(nodeId, handle);
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            videoStreamUrl: handle.videoStreamUrl,
            audioStreamUrl: handle.audioStreamUrl,
            videoStreamId: handle.videoStreamId,
            audioStreamId: handle.audioStreamId,
            mediaInfo,
          });
        } catch (error) {
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            error: error instanceof Error ? error.message : 'Play failed',
          });
        }
        break;
      }

      case 'media:seek': {
        const nodeId = (message.nodeId as string) ?? '';
        const handle = this._activeStreams.get(webviewPanel)?.get(nodeId);
        if (!handle) break;
        const playback = await this.getMediaPlayback();
        await playback?.seekPlayback(handle, message.time as number);
        break;
      }

      case 'media:pause': {
        const nodeId = (message.nodeId as string) ?? '';
        const handle = this._activeStreams.get(webviewPanel)?.get(nodeId);
        if (!handle) break;
        const playback = await this.getMediaPlayback();
        await playback?.pausePlayback(handle);
        break;
      }

      case 'media:resume': {
        const nodeId = (message.nodeId as string) ?? '';
        const handle = this._activeStreams.get(webviewPanel)?.get(nodeId);
        if (!handle) break;
        const playback = await this.getMediaPlayback();
        await playback?.resumePlayback(handle);
        break;
      }

      case 'media:stop': {
        const nodeId = (message.nodeId as string) ?? '';
        const panelStreams = this._activeStreams.get(webviewPanel);
        const handle = panelStreams?.get(nodeId);
        if (!handle) break;
        const playback = await this.getMediaPlayback();
        await playback?.stopPlayback(handle);
        panelStreams?.delete(nodeId);
        if (panelStreams?.size === 0) {
          this._activeStreams.delete(webviewPanel);
        }
        break;
      }
    }
  }

  private async postMediaPlaybackResponse(
    webviewPanel: vscode.WebviewPanel,
    message: Record<string, unknown>,
  ): Promise<void> {
    logger.debug(
      `Canvas Preview media host response: ${JSON.stringify({
        type: message.type,
        nodeId: message.nodeId,
        error: message.error,
        hasMediaInfo: Boolean(message.mediaInfo),
        hasVideoStreamUrl: Boolean(message.videoStreamUrl),
        hasAudioStreamUrl: Boolean(message.audioStreamUrl),
      })}`,
    );
    const delivered = await webviewPanel.webview.postMessage(message);
    if (!delivered) {
      throw new Error('Media playback response could not be delivered to the Preview webview.');
    }
  }

  private async resolveMediaPlaybackFilePath(
    message: Record<string, unknown>,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string | undefined> {
    const documentResourceRef = isDocumentArchiveResourceRef(message.documentResourceRef)
      ? message.documentResourceRef
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(message.resourceRef, documentResourceRef);
    const assetPath = this.resolveDocumentResourceAssetPath(
      message.assetPath as string | undefined,
      documentResourceRef,
      resourceRef,
    );
    if (!assetPath && !resourceRef) {
      return undefined;
    }
    if (resourceRef) {
      try {
        return await this.resolveResourceRefLocalPreviewPath(resourceRef, caller);
      } catch (error) {
        logger.warn(
          'Media playback resource local path resolution failed; falling back to asset path',
          {
            caller,
            resourceId: resourceRef.id,
            entryPath:
              resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    if (!assetPath || this.isReusableCanvasPlaybackPreviewSource(assetPath)) {
      return undefined;
    }
    const candidates = await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      assetPath,
      documentUri,
    );
    return candidates[0];
  }

  private async resolveCanvasMediaLocalFilePath(
    assetPath: string,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string> {
    const candidates = await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      assetPath,
      documentUri,
    );
    const existing = candidates[0];
    if (existing) {
      return existing;
    }

    throw new Error(
      `Media source could not be resolved to an existing local file for ${caller}: ${assetPath}`,
    );
  }

  private resolvePreviewResourceRef(
    resourceRef: unknown,
    documentResourceRef?: DocumentArchiveResourceRef,
  ): ResourceRef | undefined {
    if (isResourceRef(resourceRef)) {
      return resourceRef;
    }
    return documentResourceRef
      ? createDocumentResourceRefFromArchiveRef(documentResourceRef, 'project')
      : undefined;
  }

  private async handlePreviewVariantMessage(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    documentUri: vscode.Uri,
  ): Promise<boolean> {
    const requestId = message.requestId as string | undefined;
    const documentResourceRef = isDocumentArchiveResourceRef(message.documentResourceRef)
      ? message.documentResourceRef
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(message.resourceRef, documentResourceRef);
    const assetPath = this.resolveDocumentResourceAssetPath(
      message.assetPath as string | undefined,
      documentResourceRef,
      resourceRef,
    );
    const role = message.role as 'thumbnail' | 'proxy' | 'fov-crop' | undefined;
    const mediaTypeHint = message.mediaType as string | undefined;
    if (!requestId) return false;
    const context: PreviewResourceVariantRequestContext = {
      requestId,
      ...(typeof message.sourceId === 'string' ? { sourceId: message.sourceId } : {}),
    };
    if (!assetPath && !resourceRef) {
      return webviewPanel.webview.postMessage({
        type: 'preview:variantResolved',
        requestId,
        error: 'Preview variant request did not include a resolvable asset or resource reference.',
      });
    }

    try {
      const projectedDocumentResource = await this.projectDocumentResourcePreviewUrl({
        webview: webviewPanel.webview,
        resourceRef: assetPath ? undefined : resourceRef,
        documentResourceRef,
        documentUri,
        assetPath,
        caller: 'neko-canvas.document-resource-variant',
        role,
        requestContext: context,
      });
      if (projectedDocumentResource) {
        if (resourceRef) {
          this.logPreviewVariantResolved(
            resourceRef,
            'neko-canvas.document-resource-variant',
            context,
          );
        }
        return webviewPanel.webview.postMessage({
          type: 'preview:variantResolved',
          requestId,
          url: projectedDocumentResource,
        });
      }
      if (!assetPath) {
        throw new Error(
          'Resource cache variant could not be materialized for this document reference.',
        );
      }
      const fsPath = await this.resolvePreviewVariantAssetPath(assetPath, documentUri);
      if (!fsPath) {
        throw new Error('Preview variant source could not be resolved to a local file.');
      }
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
        return webviewPanel.webview.postMessage({
          type: 'preview:variantResolved',
          requestId,
          url: variant.url ?? manifest.variants.find((item) => item.role === 'source')?.url,
        });
      }

      throw new Error(
        'Media path is outside authorized Webview roots. Add its folder as a media library or move it into the workspace.',
      );
    } catch (error) {
      logger.warn('Preview variant resolution failed', {
        requestId,
        sourceId: context.sourceId,
        resourceId: resourceRef?.id,
        entryPath:
          resourceRef?.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      return webviewPanel.webview.postMessage({
        type: 'preview:variantResolved',
        requestId,
        error: error instanceof Error ? error.message : 'Preview variant resolution failed',
      });
    }
  }

  private async materializeCompositeRequestRuntimePaths(
    request: CanvasCreateCompositeRequest,
  ): Promise<CanvasCreateCompositeRequest> {
    const webview = this.activeWebviewPanel?.webview;
    const documentUri = this.activeDocument?.uri;
    if (!webview) return request;

    const children = await Promise.all(
      request.children.map(async (child) => {
        if (child.type !== 'shot' || !child.data) {
          return child;
        }
        const data = { ...child.data };
        if (documentUri) {
          await this.materializeShotReferencePreview(data, webview, documentUri);
        }
        return { ...child, data };
      }),
    );

    return {
      ...request,
      children,
    };
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
      const nodeData = node['data'] as Record<string, unknown> | undefined;
      if (!nodeData) continue;

      if (node['type'] === 'shot') {
        await this.materializeShotReferencePreview(nodeData, webview, documentUri);
        continue;
      }

      if (node['type'] !== 'media') continue;

      for (const [key, runtimeKey] of [
        ['assetPath', 'runtimeAssetPath'],
        ['thumbnailPath', 'runtimeThumbnailPath'],
      ] as const) {
        const value = nodeData[key];
        if (typeof value !== 'string' || !value) continue;
        try {
          const uri = await this.projectCanvasMediaLocalFile(
            webview,
            value,
            documentUri,
            'neko-canvas.load-node-media',
          );
          if (uri) {
            nodeData[runtimeKey] = uri;
          }
        } catch {
          // leave as-is if resolution fails
        }
      }
      await this.materializeDocumentResourcePreview(nodeData, webview, documentUri);
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

  private async projectCanvasMediaLocalFile(
    webview: vscode.Webview,
    source: string,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string | undefined> {
    for (const fsPath of await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      source,
      documentUri,
    )) {
      const projection = await this.localResourceAccess.toWebviewUri(webview, fsPath, {
        caller,
        extraRoots: [
          ...(webview.options.localResourceRoots ?? []),
          ...this.getCanvasLocalResourceRoots(documentUri),
          vscode.Uri.file(path.dirname(fsPath)),
        ],
      });
      if (projection.ok) {
        return projection.uri;
      }
    }
    return undefined;
  }

  private async createMediaDroppedAsset(
    webview: vscode.Webview,
    fsPath: string,
    caller: string,
    documentUri: vscode.Uri,
    fileName: string,
    mediaType: 'image' | 'video' | 'audio',
  ): Promise<Extract<CanvasDroppedAsset, { kind: 'media' }> | undefined> {
    await this.addFeatureRoot(webview, path.dirname(fsPath));
    const runtimeAssetPath = this.projectLocalResource(webview, fsPath, caller);
    if (!runtimeAssetPath) {
      return undefined;
    }
    return {
      kind: 'media',
      path: await this.contractAssetPath(fsPath, documentUri),
      originalPath: fsPath,
      runtimeAssetPath,
      name: fileName,
      mediaType,
    };
  }

  private async addFeatureRoot(webview: vscode.Webview, rootPath: string): Promise<void> {
    await this.localResourceAccess.configureWebview(webview, {
      enableScripts: true,
      extraRoots: [...(webview.options.localResourceRoots ?? []), vscode.Uri.file(rootPath)],
    });
  }

  private async projectDocumentResourcePreviewUrl(input: {
    readonly webview: vscode.Webview;
    readonly resourceRef?: ResourceRef;
    readonly documentResourceRef?: DocumentArchiveResourceRef;
    readonly documentUri?: vscode.Uri;
    readonly assetPath?: string;
    readonly caller: string;
    readonly role?: ResourceVariantRole;
    readonly requestContext?: PreviewResourceVariantRequestContext;
  }): Promise<string | undefined> {
    if (input.resourceRef) {
      try {
        const projected = await this.projectResourceCacheVariant(
          input.webview,
          input.resourceRef,
          input.caller,
          input.role,
          input.requestContext,
        );
        if (projected) {
          return projected;
        }
      } catch (error) {
        logger.warn(
          'Document resource cache Preview projection failed; falling back to asset path',
          {
            caller: input.caller,
            requestId: input.requestContext?.requestId,
            sourceId: input.requestContext?.sourceId,
            resourceId: input.resourceRef.id,
            entryPath:
              input.resourceRef.locator?.kind === 'document'
                ? input.resourceRef.locator.entryPath
                : undefined,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    const fallbackPath = this.resolveDocumentResourceAssetPath(
      input.assetPath,
      input.documentResourceRef,
      input.resourceRef,
    );
    if (!fallbackPath) {
      return undefined;
    }
    try {
      const fsPaths = input.documentUri
        ? await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
            fallbackPath,
            input.documentUri,
          )
        : this.isExistingLocalFile(fallbackPath)
          ? [fallbackPath]
          : [];
      for (const fsPath of fsPaths) {
        const projection = await this.localResourceAccess.toWebviewUri(input.webview, fsPath, {
          caller: input.caller,
          extraRoots: input.documentUri
            ? [
                ...(input.webview.options.localResourceRoots ?? []),
                ...this.getCanvasLocalResourceRoots(input.documentUri),
              ]
            : input.webview.options.localResourceRoots,
        });
        if (projection.ok) {
          return projection.uri;
        }
      }
    } catch (error) {
      logger.warn(`Document resource Preview fallback projection failed: ${error}`);
    }
    return undefined;
  }

  private async materializeDocumentResourcePreview(
    nodeData: Record<string, unknown>,
    webview: vscode.Webview,
    documentUri: vscode.Uri,
  ): Promise<void> {
    const documentResourceRef = isDocumentArchiveResourceRef(nodeData['documentResourceRef'])
      ? nodeData['documentResourceRef']
      : undefined;
    const unifiedResourceRef = this.resolvePreviewResourceRef(
      nodeData['resourceRef'],
      documentResourceRef,
    );
    const projected = await this.projectDocumentResourcePreviewUrl({
      webview,
      resourceRef: unifiedResourceRef,
      documentResourceRef,
      documentUri,
      caller: 'neko-canvas.document-resource-preview',
    });
    if (projected) {
      nodeData['runtimeAssetPath'] = projected;
      delete nodeData['documentResourceStatus'];
      return;
    }
    if (isResourceRef(unifiedResourceRef)) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
      return;
    }

    if (documentResourceRef?.cachePath) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
    }
  }

  private async materializeShotReferencePreview(
    nodeData: Record<string, unknown>,
    webview: vscode.Webview,
    documentUri: vscode.Uri,
  ): Promise<void> {
    const referenceImageResourceRef = isDocumentArchiveResourceRef(
      nodeData['referenceImageResourceRef'],
    )
      ? nodeData['referenceImageResourceRef']
      : undefined;
    const unifiedResourceRef = this.resolvePreviewResourceRef(
      nodeData['referenceResourceRef'],
      referenceImageResourceRef,
    );
    delete nodeData['runtimeReferenceImagePath'];
    delete nodeData['documentResourceStatus'];

    const projected = await this.projectDocumentResourcePreviewUrl({
      webview,
      resourceRef: unifiedResourceRef,
      documentResourceRef: referenceImageResourceRef,
      documentUri,
      caller: 'neko-canvas.shot-reference-preview',
    });
    if (projected) {
      nodeData['runtimeReferenceImagePath'] = projected;
      delete nodeData['documentResourceStatus'];
      return;
    }
    if (isResourceRef(unifiedResourceRef)) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
      return;
    }

    if (referenceImageResourceRef?.cachePath) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
    }
  }

  private async enrichCanvasPlaybackPlanForPreview(
    plan: CanvasPlaybackPlan,
    canvasData: Record<string, unknown>,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasPlaybackPlan> {
    const nodeById = this.createCanvasNodeLookup(canvasData);
    const units = await Promise.all(
      plan.units.map(async (unit) => {
        const node = nodeById.get(unit.sourceNodeId);
        if (!node) return unit;
        const previewSource = await this.resolveCanvasPlaybackUnitPreviewSource(
          node,
          documentUri,
          webview,
        );
        if (!previewSource) return unit;
        return {
          ...unit,
          metadata: {
            ...(unit.metadata ?? {}),
            previewUrl: previewSource.url,
            previewSourceKind: previewSource.kind,
            ...(previewSource.label ? { previewSourceLabel: previewSource.label } : {}),
            ...(previewSource.mediaType ? { previewMediaType: previewSource.mediaType } : {}),
            ...(previewSource.refId ? { previewSourceRefId: previewSource.refId } : {}),
            ...(previewSource.playableAssetPath
              ? { previewPlayableAssetPath: previewSource.playableAssetPath }
              : {}),
            ...(previewSource.source?.source
              ? { previewSourceAssetPath: previewSource.source.source }
              : {}),
            ...(previewSource.source?.resourceRef
              ? { previewSourceResourceRef: previewSource.source.resourceRef }
              : {}),
            ...(previewSource.source?.documentResourceRef
              ? { previewSourceDocumentResourceRef: previewSource.source.documentResourceRef }
              : {}),
          },
        };
      }),
    );
    return { ...plan, units };
  }

  private createCanvasNodeLookup(canvasData: Record<string, unknown>): Map<string, CanvasNode> {
    const nodes = canvasData['nodes'];
    const lookup = new Map<string, CanvasNode>();
    if (!Array.isArray(nodes)) {
      return lookup;
    }
    for (const node of nodes) {
      if (
        node &&
        typeof node === 'object' &&
        !Array.isArray(node) &&
        typeof (node as { id?: unknown }).id === 'string'
      ) {
        const candidate = node as CanvasNode;
        lookup.set(candidate.id, candidate);
      }
    }
    return lookup;
  }

  private async resolveCanvasPlaybackUnitPreviewSource(
    node: CanvasNode,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasPlaybackPreviewSourceProjection | undefined> {
    if (node.type === 'shot') {
      return this.resolveShotPlaybackPreviewSource(node, documentUri, webview);
    }
    if (node.type === 'media') {
      return this.resolveMediaPlaybackPreviewSource(node, documentUri, webview);
    }
    return undefined;
  }

  private async resolveShotPlaybackPreviewSource(
    node: CanvasNode,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasPlaybackPreviewSourceProjection | undefined> {
    const data = node.data as Record<string, unknown>;
    const selectedGeneration = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readSelectedGenerationCandidatePreviewSource(data),
      documentUri,
      webview,
      'neko-canvas.preview-playback-selected-generation',
    );
    if (selectedGeneration) {
      return {
        url: selectedGeneration.url,
        kind: 'generated-image',
        mediaType: 'image',
        source: selectedGeneration.source,
        playableAssetPath: selectedGeneration.playableAssetPath,
      };
    }

    const generatedImage = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate(data['generatedImage']),
      documentUri,
      webview,
      'neko-canvas.preview-playback-generated-image',
    );
    if (generatedImage) {
      return {
        url: generatedImage.url,
        kind: 'generated-image',
        mediaType: 'image',
        source: generatedImage.source,
        playableAssetPath: generatedImage.playableAssetPath,
      };
    }
    const generatedAsset = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate(data['generatedAsset']),
      documentUri,
      webview,
      'neko-canvas.preview-playback-generated-asset',
    );
    if (generatedAsset) {
      return {
        url: generatedAsset.url,
        kind: 'generated-image',
        mediaType: 'image',
        source: generatedAsset.source,
        playableAssetPath: generatedAsset.playableAssetPath,
      };
    }

    const generatedMediaUrl = await this.resolveShotMediaRefsPlaybackPreviewSource(
      this.readStoryboardMediaRefArray(data['generatedMediaRefs']),
      documentUri,
      webview,
      'generated-media',
      'neko-canvas.preview-playback-shot-generated-media-ref',
    );
    if (generatedMediaUrl) {
      return generatedMediaUrl;
    }

    const prepOutputMediaUrl = await this.resolveShotMediaRefsPlaybackPreviewSource(
      this.readStoryboardMediaRefArray(
        this.readNestedRecord(data['shotImagePrepPlan'])?.['outputMediaRefs'],
      ),
      documentUri,
      webview,
      'generated-media',
      'neko-canvas.preview-playback-shot-prep-output-media-ref',
    );
    if (prepOutputMediaUrl) {
      return prepOutputMediaUrl;
    }

    const runtimeReferenceImage = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate(data['runtimeReferenceImagePath']),
      documentUri,
      webview,
      'neko-canvas.preview-playback-runtime-reference',
    );
    if (runtimeReferenceImage) {
      return {
        url: runtimeReferenceImage.url,
        kind: 'reference-image',
        mediaType: 'image',
        source: runtimeReferenceImage.source,
        playableAssetPath: runtimeReferenceImage.playableAssetPath,
      };
    }

    const referenceImageResourceRef = isDocumentArchiveResourceRef(
      data['referenceImageResourceRef'],
    )
      ? data['referenceImageResourceRef']
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(
      data['referenceResourceRef'],
      referenceImageResourceRef,
    );
    const projected = await this.projectDocumentResourcePreviewUrl({
      resourceRef,
      documentResourceRef: referenceImageResourceRef,
      webview,
      documentUri,
      caller: 'neko-canvas.preview-playback-shot-reference',
    });
    if (projected) {
      const referenceImagePath = this.readPreviewSourceString(data['referenceImagePath']);
      const playableAssetPath = await this.resolveCanvasPlaybackPreviewPlayableAssetPath(
        {
          ...(referenceImagePath ? { source: referenceImagePath } : {}),
          ...(referenceImageResourceRef ? { documentResourceRef: referenceImageResourceRef } : {}),
          ...(resourceRef ? { resourceRef } : {}),
        },
        resourceRef,
        documentUri,
        'neko-canvas.preview-playback-shot-reference',
      );
      return {
        url: projected,
        kind: 'reference-image',
        mediaType: 'image',
        source: {
          ...(resourceRef ? { resourceRef } : {}),
          ...(referenceImageResourceRef ? { documentResourceRef: referenceImageResourceRef } : {}),
        },
        playableAssetPath,
      };
    }

    const referenceImage = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate(data['referenceImagePath']),
      documentUri,
      webview,
      'neko-canvas.preview-playback-shot-reference-path',
    );
    if (referenceImage) {
      return {
        url: referenceImage.url,
        kind: 'reference-image',
        mediaType: 'image',
        source: referenceImage.source,
        playableAssetPath: referenceImage.playableAssetPath,
      };
    }

    return this.resolveShotMediaRefsPlaybackPreviewSource(
      [
        ...this.readStoryboardMediaRefArray(data['sourceMediaRefs']),
        ...this.readStoryboardMediaRefArray(data['mediaRefs']),
      ],
      documentUri,
      webview,
      'source-media',
      'neko-canvas.preview-playback-shot-media-ref',
    );
  }

  private async resolveShotMediaRefsPlaybackPreviewSource(
    mediaRefs: readonly Record<string, unknown>[],
    documentUri: vscode.Uri,
    webview: vscode.Webview,
    sourceKind: CanvasPlaybackPreviewSourceKind,
    caller: string,
  ): Promise<CanvasPlaybackPreviewSourceProjection | undefined> {
    for (const mediaRef of this.sortStoryboardPreviewMediaRefs(mediaRefs)) {
      const candidate = this.readStoryboardMediaRefPreviewSource(mediaRef);
      const projected = await this.resolveCanvasPlaybackPreviewSourceCandidate(
        candidate,
        documentUri,
        webview,
        caller,
      );
      if (projected) {
        return {
          url: projected.url,
          kind: sourceKind,
          label: this.readPreviewSourceString(mediaRef['label']),
          mediaType: this.resolveStoryboardMediaRefMediaType(mediaRef, projected.url),
          refId: this.readPreviewSourceString(mediaRef['refId']),
          source: projected.source,
          playableAssetPath: projected.playableAssetPath,
        };
      }
    }
    return undefined;
  }

  private sortStoryboardPreviewMediaRefs(
    mediaRefs: readonly Record<string, unknown>[],
  ): readonly Record<string, unknown>[] {
    const refs = mediaRefs.filter((ref) =>
      this.hasCanvasPlaybackPreviewSourceCandidate(this.readStoryboardMediaRefPreviewSource(ref)),
    );
    const imageRefs = refs.filter((ref) => this.isStoryboardImageMediaRef(ref));
    return imageRefs.length > 0 ? imageRefs : refs;
  }

  private readStoryboardMediaRefArray(value: unknown): readonly Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
  }

  private isStoryboardImageMediaRef(ref: Record<string, unknown>): boolean {
    const mimeType = this.readPreviewSourceString(ref['mimeType']);
    if (mimeType?.toLowerCase().startsWith('image/')) {
      return true;
    }
    const pathValue = this.readStoryboardMediaRefPreviewSource(ref);
    const source = pathValue?.source;
    return Boolean(
      source && /\.(avif|gif|jpe?g|png|webp)$/i.test(source.split(/[?#]/)[0] ?? source),
    );
  }

  private readStoryboardMediaRefPreviewSource(
    ref: Record<string, unknown>,
  ): CanvasPlaybackPreviewSourceCandidate | undefined {
    const directCandidate = this.readPreviewSourceCandidate(ref);
    if (this.hasCanvasPlaybackPreviewSourceCandidate(directCandidate)) {
      return directCandidate;
    }

    const locator = this.readNestedRecord(ref['locator']);
    if (!locator) {
      return undefined;
    }
    return this.readPreviewSourceCandidate(locator);
  }

  private resolveStoryboardMediaRefMediaType(
    mediaRef: Record<string, unknown>,
    source: string,
  ): string | undefined {
    const mimeType = this.readPreviewSourceString(mediaRef['mimeType']);
    if (mimeType?.startsWith('image/')) return 'image';
    if (mimeType?.startsWith('video/')) return 'video';
    if (mimeType?.startsWith('audio/')) return 'audio';
    const clean = source.split(/[?#]/)[0]?.toLowerCase() ?? source.toLowerCase();
    if (/\.(avif|gif|jpe?g|png|webp)$/.test(clean)) return 'image';
    if (/\.(m4v|mkv|mov|mp4|webm)$/.test(clean)) return 'video';
    if (/\.(aac|flac|m4a|mp3|ogg|wav)$/.test(clean)) return 'audio';
    return undefined;
  }

  private async resolveMediaPlaybackPreviewSource(
    node: CanvasNode,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasPlaybackPreviewSourceProjection | undefined> {
    const data = node.data as Record<string, unknown>;
    const documentResourceRef = isDocumentArchiveResourceRef(data['documentResourceRef'])
      ? data['documentResourceRef']
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(data['resourceRef'], documentResourceRef);
    const projected = await this.projectDocumentResourcePreviewUrl({
      resourceRef,
      documentResourceRef,
      webview,
      documentUri,
      caller: 'neko-canvas.preview-playback-media-resource',
    });
    if (projected) {
      const mediaAssetPath = this.readPreviewSourceString(data['assetPath']);
      const playableAssetPath = await this.resolveCanvasPlaybackPreviewPlayableAssetPath(
        {
          ...(mediaAssetPath ? { source: mediaAssetPath } : {}),
          ...(documentResourceRef ? { documentResourceRef } : {}),
          ...(resourceRef ? { resourceRef } : {}),
        },
        resourceRef,
        documentUri,
        'neko-canvas.preview-playback-media-resource',
      );
      return {
        url: projected,
        kind: 'media-asset',
        mediaType: this.readPreviewSourceString(data['mediaType']),
        source: {
          ...(resourceRef ? { resourceRef } : {}),
          ...(documentResourceRef ? { documentResourceRef } : {}),
        },
        playableAssetPath,
      };
    }
    const asset = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate({
        assetPath: this.resolveDocumentResourceAssetPath(
          this.readPreviewSourceString(data['assetPath']),
          documentResourceRef,
          resourceRef,
        ),
      }),
      documentUri,
      webview,
      'neko-canvas.preview-playback-media-path',
    );
    return asset
      ? {
          url: asset.url,
          kind: 'media-asset',
          mediaType: this.readPreviewSourceString(data['mediaType']),
          source: asset.source,
          playableAssetPath: asset.playableAssetPath,
        }
      : undefined;
  }

  private readSelectedGenerationCandidatePreviewSource(
    data: Record<string, unknown>,
  ): CanvasPlaybackPreviewSourceCandidate | undefined {
    const history = data['generationHistory'];
    if (!Array.isArray(history)) {
      return undefined;
    }
    const selected = history.find(
      (candidate): candidate is Record<string, unknown> =>
        Boolean(candidate) &&
        typeof candidate === 'object' &&
        !Array.isArray(candidate) &&
        candidate['selected'] === true,
    );
    if (!selected) {
      return undefined;
    }
    return this.readPreviewSourceCandidate(selected);
  }

  private async resolveCanvasPlaybackPreviewSourceCandidate(
    candidate: CanvasPlaybackPreviewSourceCandidate | undefined,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
    caller: string,
  ): Promise<CanvasPlaybackPreviewSourceResolution | undefined> {
    if (!this.hasCanvasPlaybackPreviewSourceCandidate(candidate)) {
      return undefined;
    }
    const resourceRef = this.resolvePreviewResourceRef(
      candidate.resourceRef,
      candidate.documentResourceRef,
    );

    if (!resourceRef && !candidate.documentResourceRef) {
      const localSource = await this.resolveCanvasPlaybackLocalPreviewSource(
        candidate.source,
        documentUri,
        webview,
        caller,
      );
      return localSource
        ? { url: localSource.url, source: candidate, playableAssetPath: localSource.fsPath }
        : undefined;
    }

    const projectedResource = await this.projectDocumentResourcePreviewUrl({
      webview,
      resourceRef,
      documentResourceRef: candidate.documentResourceRef,
      documentUri,
      assetPath: candidate.source,
      caller,
    });
    const playableAssetPath = await this.resolveCanvasPlaybackPreviewPlayableAssetPath(
      candidate,
      resourceRef,
      documentUri,
      caller,
    );
    if (projectedResource) {
      return { url: projectedResource, source: candidate, playableAssetPath };
    }
    const localSource = await this.resolveCanvasPlaybackLocalPreviewSource(
      this.resolveDocumentResourceAssetPath(
        candidate.source,
        candidate.documentResourceRef,
        resourceRef,
      ),
      documentUri,
      webview,
      caller,
    );
    return localSource
      ? { url: localSource.url, source: candidate, playableAssetPath: localSource.fsPath }
      : undefined;
  }

  private async resolveCanvasPlaybackLocalPreviewSource(
    value: string | undefined,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
    caller: string,
  ): Promise<{ readonly url: string; readonly fsPath?: string } | undefined> {
    const source = this.readPreviewSourceString(value);
    if (!source) return undefined;
    if (this.isReusableCanvasPlaybackPreviewSource(source)) {
      return { url: source };
    }
    for (const fsPath of await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      source,
      documentUri,
    )) {
      const projected = await this.localResourceAccess.toWebviewUri(webview, fsPath, {
        caller,
        extraRoots: [
          ...(webview.options.localResourceRoots ?? []),
          ...this.getCanvasLocalResourceRoots(documentUri),
        ],
      });
      if (projected.ok) {
        return { url: projected.uri, fsPath };
      }
    }
    return undefined;
  }

  private async resolveCanvasPlaybackPreviewPlayableAssetPath(
    candidate: CanvasPlaybackPreviewSourceCandidate,
    resourceRef: ResourceRef | undefined,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string | undefined> {
    const assetPath = this.resolveDocumentResourceAssetPath(
      candidate.source,
      candidate.documentResourceRef,
      resourceRef,
    );
    if (assetPath && !this.isReusableCanvasPlaybackPreviewSource(assetPath)) {
      const localCandidates = await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
        assetPath,
        documentUri,
      );
      for (const fsPath of localCandidates) {
        if (
          await this.localResourceAccess.isAuthorizedPath(fsPath, {
            extraRoots: this.getCanvasLocalResourceRoots(documentUri),
          })
        ) {
          return fsPath;
        }
      }
    }

    if (!resourceRef) {
      return undefined;
    }
    try {
      return await this.resolveResourceRefLocalPreviewPath(resourceRef, caller);
    } catch (error) {
      logger.warn('Preview playback resource local path resolution failed', {
        caller,
        resourceId: resourceRef.id,
        entryPath:
          resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private async resolveCanvasPlaybackLocalPreviewPathCandidates(
    source: string,
    documentUri: vscode.Uri,
  ): Promise<readonly string[]> {
    const candidates: string[] = [];
    for (const resolved of this.resolveWorkspaceMediaPathExistingCandidates(source, documentUri)) {
      this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
    }
    try {
      this.appendExistingCanvasPlaybackPreviewPathCandidate(
        candidates,
        await this.resolveAssetPath(source, documentUri),
      );
    } catch (error) {
      logger.warn(`Preview playback source path resolution failed: ${error}`);
    }
    const workspaceRelativePath = this.readWorkspaceRelativeCanvasAssetPath(source);
    if (workspaceRelativePath) {
      for (const resolved of this.resolveRootRelativeCanvasAssetPathCandidates(
        workspaceRelativePath,
        documentUri,
      )) {
        this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
      }
    }
    const projectRelativePath = this.readRootRelativeCanvasAssetPath(source);
    if (projectRelativePath) {
      for (const resolved of this.resolveRootRelativeCanvasAssetPathCandidates(
        projectRelativePath,
        documentUri,
      )) {
        this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
      }
      const normalizedProjectRelativePath =
        this.normalizeWorkspaceRelativeCanvasAssetPath(projectRelativePath);
      if (normalizedProjectRelativePath && normalizedProjectRelativePath !== projectRelativePath) {
        for (const resolved of this.resolveRootRelativeCanvasAssetPathCandidates(
          normalizedProjectRelativePath,
          documentUri,
        )) {
          this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
        }
      }
    }
    const documentRelativePath = this.readSlashPrefixedDocumentRelativeCanvasAssetPath(source);
    if (documentRelativePath) {
      for (const resolved of this.resolveDocumentRelativeCanvasAssetPathCandidates(
        documentRelativePath,
        documentUri,
      )) {
        this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
      }
    }
    return candidates;
  }

  private async resolvePreviewVariantAssetPath(
    assetPath: string,
    documentUri: vscode.Uri,
  ): Promise<string | undefined> {
    if (this.isReusableCanvasPlaybackPreviewSource(assetPath)) {
      return undefined;
    }
    const candidates = await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      assetPath,
      documentUri,
    );
    return candidates[0];
  }

  private resolveRootRelativeCanvasAssetPathCandidates(
    projectRelativePath: string,
    documentUri: vscode.Uri,
  ): readonly string[] {
    return createWorkspaceMediaPathCandidates(
      projectRelativePath,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    ).candidates.map((candidate) => candidate.path);
  }

  private resolveDocumentRelativeCanvasAssetPathCandidates(
    documentRelativePath: string,
    documentUri: vscode.Uri,
  ): readonly string[] {
    if (documentUri.scheme !== 'file') {
      return [];
    }
    return [path.normalize(path.join(path.dirname(documentUri.fsPath), documentRelativePath))];
  }

  private createCanvasWorkspaceMediaPathContext(documentUri: vscode.Uri) {
    return createVSCodeWorkspaceMediaPathContext({
      documentUri,
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
      allowedRoots: this.getCanvasLocalResourceRoots(documentUri).map((root) => root.fsPath),
    });
  }

  private resolveWorkspaceMediaPathExistingCandidates(
    source: string,
    documentUri: vscode.Uri,
  ): readonly string[] {
    const planned = createWorkspaceMediaPathCandidates(
      source,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    );
    return planned.candidates
      .map((candidate) => candidate.path)
      .filter((candidate) => this.isExistingLocalFile(candidate));
  }

  private appendExistingCanvasPlaybackPreviewPathCandidate(
    candidates: string[],
    fsPath: string,
  ): void {
    if (!this.isExistingLocalFile(fsPath) || candidates.includes(fsPath)) {
      return;
    }
    candidates.push(fsPath);
  }

  private isExistingLocalFile(fsPath: string): boolean {
    try {
      return fs.statSync(fsPath).isFile();
    } catch {
      return false;
    }
  }

  private readRootRelativeCanvasAssetPath(source: string): string | undefined {
    if (!source.startsWith('/') || source.startsWith('//')) {
      return undefined;
    }
    if (fs.existsSync(source)) {
      return undefined;
    }
    const trimmed = source.replace(/^\/+/, '');
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readSlashPrefixedDocumentRelativeCanvasAssetPath(source: string): string | undefined {
    if (!source.startsWith('/') || source.startsWith('//') || fs.existsSync(source)) {
      return undefined;
    }
    const trimmed = source.replace(/^\/+/, '');
    return trimmed.startsWith('../') || trimmed === '..' ? trimmed : undefined;
  }

  private getDocumentLocalResourceRoots(documentUri: vscode.Uri): readonly vscode.Uri[] {
    return documentUri.scheme === 'file' ? [vscode.Uri.file(path.dirname(documentUri.fsPath))] : [];
  }

  private getCanvasLocalResourceRoots(documentUri: vscode.Uri): readonly vscode.Uri[] {
    const roots: vscode.Uri[] = [];
    for (const root of this.getCanvasWorkspaceRoots(documentUri)) {
      roots.push(root);
    }
    for (const root of this.getDocumentLocalResourceRoots(documentUri)) {
      if (!roots.some((item) => item.fsPath === root.fsPath)) {
        roots.push(root);
      }
    }
    return roots;
  }

  private getCanvasWorkspaceRoots(documentUri: vscode.Uri): readonly vscode.Uri[] {
    const roots: vscode.Uri[] = [];
    const append = (root: vscode.Uri | undefined): void => {
      if (!root || root.scheme !== 'file') return;
      if (!roots.some((item) => item.fsPath === root.fsPath)) {
        roots.push(root);
      }
    };

    append(this.getOwningCanvasWorkspaceRoot(documentUri));
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      append(folder.uri);
    }
    return roots;
  }

  private getOwningCanvasWorkspaceRoot(documentUri: vscode.Uri): vscode.Uri | undefined {
    return vscode.workspace.getWorkspaceFolder(documentUri)?.uri;
  }

  private getNarrativePreviewLocalResourceRoots(
    sourceCanvasUri: string | undefined,
  ): readonly vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')];
    if (sourceCanvasUri) {
      roots.push(...this.getCanvasLocalResourceRoots(vscode.Uri.parse(sourceCanvasUri)));
    }
    return roots;
  }

  private readPreviewSourceString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readPreviewSourceCandidate(
    value: unknown,
  ): CanvasPlaybackPreviewSourceCandidate | undefined {
    const direct = this.readPreviewSourceString(value);
    if (direct) {
      return { source: direct };
    }

    const record = this.readNestedRecord(value);
    if (!record) {
      return undefined;
    }

    const nestedAssetRef = this.readNestedRecord(record['assetRef']);
    const nestedMetadata = this.readNestedRecord(record['metadata']);
    const resourceRef =
      this.readPreviewResourceRef(record) ??
      this.readPreviewResourceRef(nestedAssetRef) ??
      this.readPreviewResourceRef(nestedMetadata);
    const documentResourceRef =
      this.readPreviewDocumentResourceRef(record) ??
      this.readPreviewDocumentResourceRef(nestedAssetRef) ??
      this.readPreviewDocumentResourceRef(nestedMetadata);
    const source =
      this.readFirstPreviewSourceString(record, [
        'dataUrl',
        'sourcePath',
        'localPath',
        'path',
        'assetPath',
        'uri',
        'filePath',
        'previewUrl',
        'url',
        'src',
        'webviewUri',
        'webviewUrl',
      ]) ??
      this.readFirstPreviewSourceString(nestedAssetRef, [
        'dataUrl',
        'sourcePath',
        'localPath',
        'path',
        'assetPath',
        'uri',
        'filePath',
        'previewUrl',
        'url',
        'src',
        'webviewUri',
        'webviewUrl',
      ]);
    return this.hasCanvasPlaybackPreviewSourceCandidate({
      ...(source ? { source } : {}),
      ...(resourceRef ? { resourceRef } : {}),
      ...(documentResourceRef ? { documentResourceRef } : {}),
    })
      ? {
          ...(source ? { source } : {}),
          ...(resourceRef ? { resourceRef } : {}),
          ...(documentResourceRef ? { documentResourceRef } : {}),
        }
      : undefined;
  }

  private readPreviewResourceRef(
    record: Record<string, unknown> | undefined,
  ): ResourceRef | undefined {
    if (!record) {
      return undefined;
    }
    if (isResourceRef(record['resourceRef'])) {
      return record['resourceRef'];
    }
    if (isResourceRef(record['cacheResourceRef'])) {
      return record['cacheResourceRef'];
    }
    return undefined;
  }

  private readWorkspaceRelativeCanvasAssetPath(source: string): string | undefined {
    if (
      !source ||
      source.startsWith('/') ||
      source.startsWith('//') ||
      source.startsWith('${') ||
      /^[A-Za-z]:[\\/]/.test(source) ||
      /^[A-Za-z][A-Za-z\d+.-]*:/.test(source)
    ) {
      return undefined;
    }
    return this.normalizeWorkspaceRelativeCanvasAssetPath(source);
  }

  private normalizeWorkspaceRelativeCanvasAssetPath(source: string): string | undefined {
    const normalized = source.replace(/\\/g, '/').replace(/^\.\/+/, '');
    const workspaceRelative = normalized.replace(/^(?:\.\.\/)+/, '');
    return workspaceRelative.length > 0 ? workspaceRelative : undefined;
  }

  private readPreviewDocumentResourceRef(
    record: Record<string, unknown> | undefined,
  ): DocumentArchiveResourceRef | undefined {
    if (!record) {
      return undefined;
    }
    for (const key of ['documentResourceRef', 'referenceImageResourceRef', 'resourceRef']) {
      const value = record[key];
      if (isDocumentArchiveResourceRef(value)) {
        return value;
      }
    }
    return undefined;
  }

  private hasCanvasPlaybackPreviewSourceCandidate(
    candidate: CanvasPlaybackPreviewSourceCandidate | undefined,
  ): candidate is CanvasPlaybackPreviewSourceCandidate {
    return Boolean(candidate?.source || candidate?.resourceRef || candidate?.documentResourceRef);
  }

  private readFirstPreviewSourceString(
    record: Record<string, unknown> | undefined,
    fields: readonly string[],
  ): string | undefined {
    if (!record) {
      return undefined;
    }
    for (const field of fields) {
      const source = this.readPreviewSourceString(record[field]);
      if (source) {
        return source;
      }
    }
    return undefined;
  }

  private readNestedRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private isReusableCanvasPlaybackPreviewSource(value: string | undefined): value is string {
    if (!value) return false;
    if (/^data:/i.test(value)) {
      return true;
    }
    return /^https:/i.test(value) && !/vscode-resource\.vscode-cdn\.net/i.test(value);
  }

  private async projectResourceCacheVariant(
    webview: vscode.Webview,
    resourceRef: unknown,
    caller: string,
    preferredRole?: ResourceVariantRole,
    requestContext?: PreviewResourceVariantRequestContext,
  ): Promise<string | undefined> {
    const contentAccess = this.contentAccess;
    if (!contentAccess || !isResourceRef(resourceRef)) {
      return undefined;
    }
    const role = resolveCanvasPreviewVariantRole(resourceRef, preferredRole);
    const startedAtMs = Date.now();
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn('Preview resource variant resolution timed out', {
          caller,
          requestId: requestContext?.requestId,
          sourceId: requestContext?.sourceId,
          resourceId: resourceRef.id,
          entryPath:
            resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
          timeoutMs: PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS,
        });
        reject(
          new Error(
            `Preview resource variant resolution timed out after ${PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS}ms.`,
          ),
        );
      }, PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS);
    });
    const result = await Promise.race([
      this.withContentAccessWebview(webview, (webviewResolverToken) =>
        contentAccess.resolve({
          ref: resourceRef,
          intent: 'interactive-preview',
          target: 'webview-uri',
          variant: { role },
          materialization: 'if-missing',
          caller,
          signal: abortController.signal,
          metadata: { [CONTENT_ACCESS_WEBVIEW_RESOLVER_TOKEN_METADATA_KEY]: webviewResolverToken },
        }),
      ),
      timeout,
    ]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
    const elapsedMs = Date.now() - startedAtMs;
    if (abortController.signal.aborted) {
      logger.warn('Preview resource variant resolution aborted by timeout', {
        caller,
        requestId: requestContext?.requestId,
        sourceId: requestContext?.sourceId,
        resourceId: resourceRef.id,
        entryPath:
          resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        elapsedMs,
      });
    }
    if (result.status === 'ready' && result.uri) {
      logger.debug('Resource cache variant projected for Preview', {
        caller,
        requestId: requestContext?.requestId,
        sourceId: requestContext?.sourceId,
        resourceId: resourceRef.id,
        entryPath:
          resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        elapsedMs,
      });
      return result.uri;
    }
    this.logResourceCacheVariantMiss(
      resourceRef,
      caller,
      result.status,
      result.error,
      requestContext,
      elapsedMs,
    );
    if (result.status === 'missing-cache' || result.status === 'stale-source') {
      return undefined;
    }
    if (result.status === 'unauthorized') {
      logger.warn('Content access projection was unauthorized', {
        resourceId: resourceRef.id,
        caller,
        error: result.error,
        requestId: requestContext?.requestId,
        sourceId: requestContext?.sourceId,
        elapsedMs,
      });
    }
    return undefined;
  }

  private logResourceCacheVariantMiss(
    resourceRef: ResourceRef,
    caller: string,
    status: string,
    error: string | undefined,
    requestContext?: PreviewResourceVariantRequestContext,
    elapsedMs?: number,
  ): void {
    const entryPath =
      resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined;
    logger.warn('Resource cache variant resolution missed', {
      caller,
      status,
      error,
      provider: resourceRef.provider,
      resourceId: resourceRef.id,
      sourcePath: resourceRef.source.document?.filePath ?? resourceRef.source.filePath,
      entryPath,
      requestId: requestContext?.requestId,
      sourceId: requestContext?.sourceId,
      elapsedMs,
    });
  }

  private logPreviewVariantResolved(
    resourceRef: ResourceRef,
    caller: string,
    requestContext: PreviewResourceVariantRequestContext,
  ): void {
    logger.debug('Preview variant resolved', {
      caller,
      requestId: requestContext.requestId,
      sourceId: requestContext.sourceId,
      resourceId: resourceRef.id,
      entryPath:
        resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
    });
  }

  private async resolveResourceRefLocalPreviewPath(
    resourceRef: ResourceRef,
    caller: string,
    preferredRole?: ResourceVariantRole,
  ): Promise<string> {
    if (!this.contentAccess) {
      throw new Error('Resource cache is unavailable for this workspace.');
    }
    const role = resolveCanvasPreviewVariantRole(resourceRef, preferredRole);
    const result = await this.contentAccess.resolve({
      ref: resourceRef,
      intent: 'interactive-preview',
      target: 'local-path',
      variant: { role },
      materialization: 'if-missing',
      caller,
    });
    if (result.status === 'ready' && result.localPath) {
      return result.localPath;
    }
    throw new Error(
      result.error ??
        'Resource cache variant could not be materialized for this document reference.',
    );
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
    delete nodeData['runtimeReferenceImagePath'];
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
      const nodeData = node['data'] as Record<string, unknown> | undefined;
      if (!nodeData) continue;

      if (node['type'] === 'shot') {
        delete nodeData['runtimeReferenceImagePath'];
        delete nodeData['documentResourceStatus'];
        if (
          isResourceRef(nodeData['referenceResourceRef']) ||
          isDocumentArchiveResourceRef(nodeData['referenceImageResourceRef'])
        ) {
          delete nodeData['referenceImagePath'];
        }
        continue;
      }

      if (node['type'] !== 'media') continue;

      const assetPath = typeof nodeData['assetPath'] === 'string' ? nodeData['assetPath'] : '';
      const runtimeAssetPath =
        typeof nodeData['runtimeAssetPath'] === 'string' ? nodeData['runtimeAssetPath'] : '';
      delete nodeData['runtimeAssetPath'];
      delete nodeData['runtimeThumbnailPath'];
      delete nodeData['documentResourceStatus'];
      if (isDocumentArchiveResourceRef(nodeData['documentResourceRef'])) {
        continue;
      }

      if (!assetPath && !runtimeAssetPath) continue;
      if (this.isReusableCanvasPlaybackPreviewSource(assetPath)) continue;

      const absolutePath = await this.resolveCanvasMediaPathForSave(
        assetPath,
        runtimeAssetPath,
        documentUri,
      );
      if (!absolutePath) continue;
      // Contract to portable path
      nodeData['assetPath'] = await this.contractAssetPath(absolutePath, documentUri);
    }
  }

  private async resolveCanvasMediaPathForSave(
    assetPath: string,
    runtimeAssetPath: string,
    documentUri: vscode.Uri,
  ): Promise<string | undefined> {
    const assetCandidates = assetPath
      ? await this.resolveCanvasPlaybackLocalPreviewPathCandidates(assetPath, documentUri)
      : [];
    if (assetCandidates[0]) {
      return assetCandidates[0];
    }

    const runtimeCandidates = runtimeAssetPath
      ? await this.resolveCanvasPlaybackLocalPreviewPathCandidates(runtimeAssetPath, documentUri)
      : [];
    if (runtimeCandidates[0]) {
      return runtimeCandidates[0];
    }

    return assetPath ? this.resolveAssetPath(assetPath, documentUri) : undefined;
  }

  /** Contract absolute path to portable path for storage */
  private async contractAssetPath(absolutePath: string, documentUri: vscode.Uri): Promise<string> {
    const contractedWorkspacePath = contractWorkspaceMediaPath(
      absolutePath,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    );
    if (contractedWorkspacePath.format === 'workspace-relative') {
      return contractedWorkspacePath.path;
    }
    if (
      contractedWorkspacePath.format === 'variable' &&
      !isWorkspaceScopedVariablePath(contractedWorkspacePath.path)
    ) {
      return contractedWorkspacePath.path;
    }

    // Try PathVariable for external paths. WORKSPACE/PROJECT are document-scoped in Canvas,
    // so they are intentionally not persisted as global asset-library contractions.
    try {
      const contracted = await vscode.commands.executeCommand<string>(
        'neko.assets.contractPath',
        absolutePath,
      );
      if (contracted && contracted.startsWith('${') && !isWorkspaceScopedVariablePath(contracted)) {
        return contracted;
      }
    } catch {
      // neko-assets not active
    }

    // Fallback: relative to document directory
    const docDir = path.dirname(documentUri.fsPath);
    return path.relative(docDir, absolutePath).split(path.sep).join('/');
  }

  private contractWorkspaceAssetPath(
    absolutePath: string,
    documentUri: vscode.Uri,
  ): string | undefined {
    const owningRoot = this.getOwningCanvasWorkspaceRoot(documentUri);
    if (!owningRoot) {
      return undefined;
    }
    const rootPath = owningRoot.fsPath;
    if (absolutePath !== rootPath && !absolutePath.startsWith(`${rootPath}${path.sep}`)) {
      return undefined;
    }
    const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/');
    return relativePath || undefined;
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
