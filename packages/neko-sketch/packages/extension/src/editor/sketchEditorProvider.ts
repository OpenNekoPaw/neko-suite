/**
 * Sketch Editor Provider - Custom editor for .nks files
 *
 * Implements VSCode CustomEditorProvider to open .nks sketch documents
 * in the WebGL-based drawing canvas.
 */
import * as vscode from 'vscode';
import {
  createDefaultProjectFormatCodecRegistry,
  handleProjectSourceAddHostRequest,
  handleProjectSourceAddRequest,
  ingestProjectSourceAddRequest,
  nksSourcePathPolicy,
  ProjectFileStore,
  type ProjectSourceAddRequest,
  type ProjectSourceAddResult,
  type ProjectFileSaveReason,
} from '@neko/shared';
import {
  createProjectSnapshotPackage,
  createFocusedWebviewRegistry,
  createVSCodeProjectSourceAddRequest,
  createVSCodeProjectFileIoAdapter,
  formatProjectFileDiagnostics,
  injectLocaleAttribute,
  normalizeVSCodeProjectSourceAddRequest,
  ProjectFileSaveSession,
  requestWebviewProjectSnapshot,
  type IFocusedWebviewRegistry,
} from '@neko/shared/vscode/extension';
import type { LayerOutlineProvider } from '../views/layerOutlineProvider';
import type { SketchStatusBar } from '../views/sketchStatusBar';
import type { NksDocument, LayerOutlineData, SketchStatusInfo } from '../types';
import type {
  PsdImportIssue,
  PsdImportPayloadWire,
  PsdLayerNodeWire,
  PsdImportIssueCode,
  SketchImportContext,
  SketchSelectionData,
  SketchAIAssetRef,
  SketchAIContextSnapshot,
  SketchAIContextSnapshotRequest,
  SketchAICancelMessage,
  SketchAIErrorMessage,
  SketchAIImageResultRequest,
  SketchAIOperationType,
  SketchAIOperationParams,
  SketchAIProgressMessage,
  SketchAIResult,
  SketchAIResultApplyMessage,
  SketchRuntimeFeatureFlags,
} from '@neko/shared';
import { getLogger } from '../utils/logger';
import { parsePsdToWire, PsdImportError } from '../psd/psd-ag-adapter';

const logger = getLogger('SketchEditorProvider');

/** Image file extensions supported for import */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const PSD_EXTENSIONS = new Set(['psd']);
const PSD_IMPORT_OUTPUT_CHANNEL = 'Neko Sketch PSD Import';
const FILE_IMPORT_RESULT_TYPE = 'file:importResult';
const AI_RESULT_CACHE_DIR = 'sketch-ai';
type ImportFailureCode =
  | 'kill-switch-disabled'
  | 'import-failed'
  | Extract<PsdImportIssueCode, 'parser-unavailable' | 'parse-failed'>;

/** Check if a URI points to an importable image file */
function isImageUri(uri: vscode.Uri): boolean {
  const ext = uri.path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

function isPsdUri(uri: vscode.Uri): boolean {
  const ext = uri.path.split('.').pop()?.toLowerCase() ?? '';
  return PSD_EXTENSIONS.has(ext);
}

function isSketchImportFileName(fileName: string): boolean {
  const ext = fileName.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext) || PSD_EXTENSIONS.has(ext);
}

function readSketchSourceAddFileName(request: ProjectSourceAddRequest): string {
  const metadataName = request.metadata?.['name'];
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName;
  }
  const source = request.browserFile?.name ?? request.sourcePath ?? request.sourceUri ?? 'imported';
  const normalized = source.split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? source;
  const name = normalized.split('/').pop();
  return name && name.length > 0 ? decodeURIComponentSafe(name) : 'imported';
}

function readSketchSourceAddDisplayName(request: ProjectSourceAddRequest): string {
  const displayName = request.metadata?.['displayName'];
  return typeof displayName === 'string' && displayName.trim().length > 0
    ? displayName.trim()
    : readSketchSourceAddFileName(request);
}

function resolveSketchDurablePath(documentUri: vscode.Uri, durablePath: string): string {
  if (durablePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(durablePath)) {
    return durablePath;
  }
  const documentDir = documentUri.fsPath.replace(/[\\/][^\\/]*$/, '');
  return `${documentDir}/${durablePath}`.replace(/\\/g, '/');
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPsdImportEnabled(): boolean {
  return vscode.workspace.getConfiguration('neko.sketch').get('psdImport.enabled', false);
}

const AI_OPERATION_CONFIG_KEYS: Readonly<Partial<Record<SketchAIOperationType, string>>> = {
  generate: 'generate',
  'smart-selection': 'smartSelection',
  inpaint: 'inpaint',
  'style-transfer': 'styleTransfer',
  upscale: 'upscale',
  'auto-layer': 'autoLayer',
  'lineart-colorize': 'lineartColorize',
};

function getSketchRuntimeFeatureFlags(): SketchRuntimeFeatureFlags {
  const config = vscode.workspace.getConfiguration('neko.sketch');
  const operations: Partial<Record<SketchAIOperationType, boolean>> = {};
  for (const [operation, key] of Object.entries(AI_OPERATION_CONFIG_KEYS) as Array<
    [SketchAIOperationType, string]
  >) {
    operations[operation] = config.get(`aiOps.${key}.enabled`, true);
  }

  return {
    psdImportEnabled: config.get('psdImport.enabled', false),
    aiOps: {
      enabled: config.get('aiOps.enabled', false),
      operations,
    },
  };
}

/** Pending promise entry for Extension → Webview request/response round-trips */
interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingFileImport {
  readonly uri: vscode.Uri;
  readonly name?: string;
}

export class SketchEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'neko.sketchEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private activeDocument: vscode.CustomDocument | undefined;
  private readonly projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  private readonly projectFileStore = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: this.projectFileAdapter.fileOps,
    logger,
  });
  private readonly projectFileSession = new ProjectFileSaveSession<NksDocument>({
    formatId: 'nks',
    store: this.projectFileStore,
    sourcePolicy: nksSourcePathPolicy,
    createSourcePolicyOptions: (uri) => ({
      context: this.projectFileAdapter.createWorkspaceMediaPathContext({ documentUri: uri }),
    }),
    logger,
  });

  // External providers for VSCode integration
  private outlineProvider: LayerOutlineProvider | undefined;
  private statusBar: SketchStatusBar | undefined;

  // Phase 2: import context for round-trip workflow
  private importContext: SketchImportContext | undefined;
  private pendingImport: { base64: string; name: string; context: SketchImportContext } | undefined;
  private pendingFileImport: PendingFileImport | undefined;

  // Phase 2/3: pending Extension → Webview request/response round-trips
  // Key: requestId, Value: pending promise
  private readonly pendingRequests = new Map<string, PendingRequest<unknown>>();
  private readonly pendingAIResultRuns = new Set<string>();
  private readonly cancellableAIRuns = new Map<string, () => Promise<void>>();

  private readonly psdImportOutput = vscode.window.createOutputChannel(PSD_IMPORT_OUTPUT_CHANNEL);
  private readonly focusedWebviews: IFocusedWebviewRegistry;

  constructor(
    private readonly context: vscode.ExtensionContext,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
  ) {
    this.focusedWebviews = focusedWebviews;
    this.context.subscriptions.push(this.psdImportOutput);
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('neko.sketch.aiOps') ||
          event.affectsConfiguration('neko.sketch.psdImport.enabled')
        ) {
          void this.postFeatureFlags();
        }
      }),
    );
  }

  /** Wire up external providers after construction */
  setProviders(opts: { outline?: LayerOutlineProvider; statusBar?: SketchStatusBar }): void {
    this.outlineProvider = opts.outline;
    this.statusBar = opts.statusBar;
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
    this.activeWebviewPanel = webviewPanel;
    this.activeDocument = document;
    const documentUri = document.uri.toString();
    const focusedRegistration = this.focusedWebviews.register({
      id: documentUri,
      viewType: SketchEditorProvider.viewType,
      documentUri,
      panel: webviewPanel,
      visible: webviewPanel.visible,
      active: webviewPanel.active,
    });
    this.context.subscriptions.push(focusedRegistration);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        this.getAIResultCacheRoot(),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidChangeViewState(
      (event) => {
        const panelId = document.uri.toString();
        this.focusedWebviews.markVisible(panelId, event.webviewPanel.visible);
        if (event.webviewPanel.active) {
          this.focusedWebviews.markActive(panelId);
          this.activeWebviewPanel = event.webviewPanel;
          this.activeDocument = document;
        } else {
          this.focusedWebviews.markInactive(panelId);
        }
      },
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(() => {
      focusedRegistration.dispose();
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
        this.activeDocument = undefined;
        this.importContext = undefined;
        this.outlineProvider?.updateData(null);
        this.statusBar?.hide();
        // Reject any pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Sketch editor closed'));
          this.pendingRequests.delete(id);
        }
        for (const runId of this.pendingAIResultRuns) {
          void this.cleanupAIArtifacts(runId);
        }
        this.pendingAIResultRuns.clear();
        for (const runId of Array.from(this.cancellableAIRuns.keys())) {
          void this.cancelAIRun(runId);
        }
      }
    });

    this.statusBar?.show();
  }

  async saveCustomDocument(
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const webviewPanel = this.getWebviewPanelForDocument(document);
    if (!webviewPanel) return;
    const data = await requestWebviewProjectSnapshot<NksDocument>(webviewPanel.webview, {
      formatId: 'nks',
      saveReason: 'vscode-save',
    });
    await this.saveSketchProject(document.uri, data, 'vscode-save');
    this.syncOutline(data);
  }

  async saveCustomDocumentAs(
    document: vscode.CustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const webviewPanel = this.getWebviewPanelForDocument(document);
    if (!webviewPanel) return;
    const data = await requestWebviewProjectSnapshot<NksDocument>(webviewPanel.webview, {
      formatId: 'nks',
      saveReason: 'save-as',
    });
    await this.saveSketchProject(destination, data, 'save-as');
    this.syncOutline(data);
  }

  async revertCustomDocument(
    _document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({ type: 'document:revert' });
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

  /** Forward keyboard actions to webview */
  async postKeyboardAction(action: string, documentUri?: vscode.Uri): Promise<boolean> {
    return this.focusedWebviews.postKeyboardAction(action, {
      viewType: SketchEditorProvider.viewType,
      documentUri: documentUri?.toString(),
      allowRecentVisibleFallback: false,
      allowSingleVisibleFallback: true,
    });
  }

  private getWebviewPanelForDocument(
    document: vscode.CustomDocument,
  ): vscode.WebviewPanel | undefined {
    if (this.activeDocument?.uri.toString() !== document.uri.toString()) {
      return undefined;
    }
    return this.activeWebviewPanel;
  }

  /** Inject a base64-encoded image into the active webview as a new layer */
  postImageData(base64: string, name: string): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'file:imported',
      name,
      data: base64,
      path: '',
    });
  }

  /** Queue a file import until the next sketch editor reports ready. */
  queueFileImport(uri: vscode.Uri, options?: { readonly name?: string }): void {
    this.pendingFileImport = options?.name ? { uri, name: options.name } : { uri };
  }

  /** Clear a queued file import if opening the target sketch document fails. */
  clearQueuedFileImport(): void {
    this.pendingFileImport = undefined;
  }

  /** Import a local image/PSD file into the active sketch editor, or queue it for the next one. */
  async importFileAsset(uri: vscode.Uri, options?: { readonly name?: string }): Promise<boolean> {
    const webviewPanel = this.activeWebviewPanel;
    if (!webviewPanel) {
      this.queueFileImport(uri, options);
      return true;
    }

    const document = this.activeDocument;
    if (!document) {
      this.queueFileImport(uri, options);
      return true;
    }
    await this.importFileUriThroughAddSource(uri, document.uri, webviewPanel, {
      caller: 'neko-sketch.external-import',
      ...(options?.name ? { name: options.name } : {}),
    });
    return true;
  }

  private async postFeatureFlags(webviewPanel = this.activeWebviewPanel): Promise<void> {
    await webviewPanel?.webview.postMessage({
      type: 'featureFlags:update',
      flags: getSketchRuntimeFeatureFlags(),
    });
  }

  async applyAIImageResult(request: SketchAIImageResultRequest): Promise<boolean> {
    const webviewPanel = this.activeWebviewPanel;
    if (!webviewPanel) {
      return false;
    }

    const runId = request.runId ?? createAIResultRunId(request.operation);
    try {
      await this.postAIProgress(webviewPanel, runId, request.operation, 5, 'Downloading AI result');
      const asset = await this.downloadAIResultAsset(request, runId, webviewPanel.webview);
      await this.postAIProgress(webviewPanel, runId, request.operation, 90, 'Applying AI result');
      const result = createSketchAIImageResult(request, asset);
      const message: SketchAIResultApplyMessage = {
        type: 'ai:resultApply',
        runId,
        operation: request.operation,
        result,
      };
      const posted = await webviewPanel.webview.postMessage(message);
      if (posted) {
        this.pendingAIResultRuns.add(runId);
      } else {
        await this.cleanupAIArtifacts(runId);
      }
      return posted;
    } catch (error) {
      await this.cleanupAIArtifacts(runId);
      const message: SketchAIErrorMessage = {
        type: 'ai:error',
        runId,
        message: error instanceof Error ? error.message : String(error),
      };
      await webviewPanel.webview.postMessage(message);
      return false;
    }
  }

  async cleanupAIArtifacts(runId: string): Promise<void> {
    const safeRunId = sanitizePathSegment(runId);
    if (!safeRunId) {
      return;
    }

    const runDir = vscode.Uri.joinPath(this.getAIResultCacheRoot(), safeRunId);
    try {
      await vscode.workspace.fs.delete(runDir, { recursive: true, useTrash: false });
    } catch {
      // Missing cache directories are expected on repeated cleanup paths.
    } finally {
      this.pendingAIResultRuns.delete(runId);
    }
  }

  async reportAIProgress(message: Omit<SketchAIProgressMessage, 'type'>): Promise<boolean> {
    const webviewPanel = this.activeWebviewPanel;
    if (!webviewPanel) {
      return false;
    }
    await this.postAIProgress(
      webviewPanel,
      message.runId,
      message.operation,
      message.percent,
      message.stage,
    );
    return true;
  }

  registerAIRun(runId: string, cancel: () => Promise<void>): void {
    if (!runId) {
      return;
    }
    this.cancellableAIRuns.set(runId, cancel);
  }

  unregisterAIRun(runId: string): void {
    this.cancellableAIRuns.delete(runId);
  }

  async cancelAIRun(runId: string): Promise<boolean> {
    const cancel = this.cancellableAIRuns.get(runId);
    if (!cancel) {
      return false;
    }

    try {
      await cancel();
      this.cancellableAIRuns.delete(runId);
      await this.cleanupAIArtifacts(runId);
      return true;
    } catch (error) {
      logger.error(`Failed to cancel AI run ${runId}: ${error}`);
      return false;
    }
  }

  // ===========================================================================
  // Phase 2: Workflow API
  // ===========================================================================

  /** Whether a sketch editor is currently open and active */
  isActive(): boolean {
    return this.activeWebviewPanel !== undefined;
  }

  /** Return the current import context (source for round-trip "send back" actions) */
  getImportContext(): SketchImportContext | undefined {
    return this.importContext;
  }

  /**
   * Import an image with source context.
   * If an editor is open, injects immediately; otherwise stores as pending
   * and injects once the next editor sends its `ready` message.
   */
  importImageWithContext(base64: string, name: string, context: SketchImportContext): void {
    this.importContext = context;
    this.statusBar?.updateContext(context);
    if (this.activeWebviewPanel) {
      this.postImageData(base64, name);
    } else {
      this.pendingImport = { base64, name, context };
    }
  }

  /**
   * Request the webview to export the current canvas composite as base64 PNG.
   * Returns null if no editor is open or the request times out.
   */
  async requestExport(timeoutMs = 10_000): Promise<string | null> {
    if (!this.activeWebviewPanel) return null;
    try {
      const data = await this.sendRequestToWebview<string | null>(
        'request:exportCanvas',
        {},
        timeoutMs,
      );
      return data;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Phase 3: AI Data-Read API
  // ===========================================================================

  async getCanvasImageData(timeoutMs = 10_000): Promise<string | null> {
    if (!this.activeWebviewPanel) return null;
    try {
      return await this.sendRequestToWebview<string | null>(
        'request:canvasImageData',
        {},
        timeoutMs,
      );
    } catch {
      return null;
    }
  }

  async getLayerImageData(layerId?: string, timeoutMs = 10_000): Promise<string | null> {
    if (!this.activeWebviewPanel) return null;
    try {
      return await this.sendRequestToWebview<string | null>(
        'request:layerImageData',
        { layerId },
        timeoutMs,
      );
    } catch {
      return null;
    }
  }

  async getSelectionMask(timeoutMs = 10_000): Promise<SketchSelectionData | null> {
    if (!this.activeWebviewPanel) return null;
    try {
      // Response has same shape as SketchSelectionData
      return await this.sendRequestToWebview<SketchSelectionData | null>(
        'request:selectionMask',
        {},
        timeoutMs,
      );
    } catch {
      return null;
    }
  }

  async createAIContextSnapshot(
    request: SketchAIContextSnapshotRequest,
    timeoutMs = 10_000,
  ): Promise<SketchAIContextSnapshot | null> {
    if (!this.activeWebviewPanel) return null;

    const scope = request.scope ?? 'canvas';
    const runId = request.runId ?? createAIResultRunId(request.operation ?? 'context');
    const imageData =
      scope === 'layer'
        ? await this.getLayerImageData(request.layerId, timeoutMs)
        : await this.getCanvasImageData(timeoutMs);

    if (!imageData) {
      return null;
    }

    const primaryAsset = await this.cacheAIContextBase64Asset({
      runId,
      name: scope === 'layer' ? 'layer.png' : 'composite.png',
      base64Data: imageData,
    });

    const selection = request.includeSelection ? await this.getSelectionMask(timeoutMs) : null;
    const maskImage = selection
      ? await this.cacheAIContextBase64Asset({
          runId,
          name: 'selection-mask.png',
          base64Data: selection.mask,
        })
      : undefined;

    return {
      runId,
      operation: request.operation,
      scope,
      [scope === 'layer' ? 'layerImage' : 'compositeImage']: primaryAsset,
      maskImage,
      selectionBounds: selection
        ? {
            x: selection.x,
            y: selection.y,
            width: selection.width,
            height: selection.height,
          }
        : undefined,
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Send a typed request to the webview and await the matching response.
   * Responses must arrive as `{ type: 'response:*', requestId, data }`.
   */
  private sendRequestToWebview<T>(
    requestType: string,
    extra: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const requestId = `${requestType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestType} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.activeWebviewPanel?.webview.postMessage({ type: requestType, requestId, ...extra });
    });
  }

  /** Resolve a pending request from a webview response message */
  private resolveRequest(requestId: string, data: unknown): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
      pending.resolve(data);
    }
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource};">
  <title>Sketch Editor</title>
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

  private getAIResultCacheRoot(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, AI_RESULT_CACHE_DIR);
  }

  private async postAIProgress(
    webviewPanel: vscode.WebviewPanel,
    runId: string,
    operation: SketchAIProgressMessage['operation'],
    percent: number,
    stage?: string,
  ): Promise<void> {
    const message: SketchAIProgressMessage = {
      type: 'ai:progress',
      runId,
      operation,
      percent,
      stage,
    };
    await webviewPanel.webview.postMessage(message);
  }

  private async downloadAIResultAsset(
    request: SketchAIImageResultRequest,
    runId: string,
    webview: vscode.Webview,
  ): Promise<SketchAIAssetRef> {
    const source = await readAIResultSource(request);
    const runDir = vscode.Uri.joinPath(this.getAIResultCacheRoot(), sanitizePathSegment(runId));
    await vscode.workspace.fs.createDirectory(runDir);

    const fileName = createAIResultFileName(request.name ?? request.operation, source.mimeType);
    const fileUri = vscode.Uri.joinPath(runDir, fileName);
    await vscode.workspace.fs.writeFile(fileUri, source.bytes);

    return {
      kind: 'webviewUri',
      ref: webview.asWebviewUri(fileUri).toString(),
      mimeType: source.mimeType,
    };
  }

  private async cacheAIContextBase64Asset(params: {
    readonly runId: string;
    readonly name: string;
    readonly base64Data: string;
    readonly mimeType?: string;
  }): Promise<SketchAIAssetRef> {
    const mimeType = params.mimeType ?? 'image/png';
    const runDir = vscode.Uri.joinPath(
      this.getAIResultCacheRoot(),
      sanitizePathSegment(params.runId),
      'context',
    );
    await vscode.workspace.fs.createDirectory(runDir);

    const fileUri = vscode.Uri.joinPath(runDir, createAIResultFileName(params.name, mimeType));
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(params.base64Data, 'base64'));

    return {
      kind: 'fileUri',
      ref: fileUri.toString(),
      mimeType,
    };
  }

  private async loadSketchProject(uri: vscode.Uri): Promise<{
    readonly ok: boolean;
    readonly data: NksDocument | null;
    readonly diagnostics: readonly { readonly message: string }[];
  }> {
    const result = await this.projectFileStore.load<NksDocument>({
      filePath: uri.fsPath,
      formatId: 'nks',
      sourcePolicy: nksSourcePathPolicy,
      sourcePolicyOptions: {
        context: this.projectFileAdapter.createWorkspaceMediaPathContext({ documentUri: uri }),
      },
    });
    return {
      ok: result.ok,
      data: result.document ?? null,
      diagnostics: result.diagnostics,
    };
  }

  private async saveSketchProject(
    uri: vscode.Uri,
    data: NksDocument,
    saveReason: ProjectFileSaveReason = 'manual',
  ): Promise<void> {
    await this.projectFileSession.save({
      targetUri: uri,
      document: data,
      saveReason,
      fallbackMessage: 'Failed to save NKS',
    });
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        this.focusedWebviews.syncFocus(document.uri.toString());
        await this.postFeatureFlags(webviewPanel);
        try {
          const result = await this.loadSketchProject(document.uri);
          const data = result.data;
          if (!result.ok && result.diagnostics.length > 0) {
            logger.warn(
              'NKS validation errors:',
              result.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
            );
          }
          webviewPanel.webview.postMessage({ type: 'document:load', data });
          if (data) {
            this.syncOutline(data);
          }
        } catch {
          webviewPanel.webview.postMessage({ type: 'document:load', data: null });
        }
        // Phase 2: inject any pending import after document is loaded
        if (this.pendingImport) {
          const { base64, name } = this.pendingImport;
          this.pendingImport = undefined;
          webviewPanel.webview.postMessage({
            type: 'file:imported',
            name,
            data: base64,
            path: '',
          });
        }
        if (this.pendingFileImport) {
          const pending = this.pendingFileImport;
          this.pendingFileImport = undefined;
          await this.importFileUriThroughAddSource(pending.uri, document.uri, webviewPanel, {
            caller: 'neko-sketch.queued-import',
            ...(pending.name ? { name: pending.name } : {}),
          });
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
          this.statusBar?.show();
        }
        break;
      }
      case 'document:save': {
        try {
          const data = message.data as NksDocument;
          await this.saveSketchProject(document.uri, data, 'vscode-save');
          if (data) {
            this.syncOutline(data as unknown as NksDocument);
          }
        } catch (error) {
          logger.error(`Failed to save: ${error}`);
        }
        break;
      }
      case 'status:update': {
        const info = message.data as SketchStatusInfo;
        this.statusBar?.update(info);
        break;
      }
      case 'layer:outline': {
        const outlineData = message.data as LayerOutlineData;
        this.outlineProvider?.updateData(outlineData);
        break;
      }
      case 'operationApplied': {
        // EditOperation sync from webview — fire dirty event
        this._onDidChangeCustomDocument.fire({
          document,
          undo: () => {},
          redo: () => {},
        });
        break;
      }
      case 'ai:resultApplied': {
        const runId = typeof message.runId === 'string' ? message.runId : '';
        if (runId) {
          await this.cleanupAIArtifacts(runId);
        }
        break;
      }
      case 'ai:cancel': {
        const runId = typeof message.runId === 'string' ? message.runId : '';
        if (!runId) {
          break;
        }

        const cancelled = await this.cancelAIRun(runId);
        if (cancelled) {
          const cancelMessage: SketchAICancelMessage = { type: 'ai:cancel', runId };
          await webviewPanel.webview.postMessage(cancelMessage);
        } else {
          const errorMessage: SketchAIErrorMessage = {
            type: 'ai:error',
            runId,
            message: `No cancellable AI run is registered for ${runId}.`,
          };
          await webviewPanel.webview.postMessage(errorMessage);
        }
        break;
      }
      case 'ai:openAgent': {
        await this.openAgentForSketch(message, document);
        break;
      }
      case 'stamp:import': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
          },
        });
        const uri = uris?.[0];
        if (!uri) {
          break;
        }

        try {
          const fileData = await vscode.workspace.fs.readFile(uri);
          const name = uri.path.split('/').pop() || 'stamp';
          await webviewPanel.webview.postMessage({
            type: 'stamp:imported',
            name,
            data: Buffer.from(fileData).toString('base64'),
            mimeType: mimeTypeFromFileName(uri.path) ?? 'image/png',
          });
        } catch (error) {
          logger.error(`Failed to import stamp asset: ${error}`);
          void vscode.window.showErrorMessage(
            error instanceof Error ? error.message : vscode.l10n.t('neko.sketch.import.failed'),
          );
        }
        break;
      }
      case 'project:addSource': {
        await this.handleSketchProjectAddSource(
          (message as { request?: ProjectSourceAddRequest }).request,
          document.uri,
          webviewPanel,
        );
        break;
      }
      case 'file:export': {
        const exportData = message.data as { format: string; data: string };
        const ext = exportData.format || 'png';
        const saveUri = await vscode.window.showSaveDialog({
          filters: { [ext.toUpperCase()]: [ext] },
        });
        if (saveUri) {
          try {
            const buffer = Buffer.from(exportData.data, 'base64');
            await vscode.workspace.fs.writeFile(saveUri, buffer);
            webviewPanel.webview.postMessage({
              type: 'file:exportResult',
              success: true,
              path: saveUri.fsPath,
            });
          } catch (error) {
            logger.error(`Failed to export: ${error}`);
            webviewPanel.webview.postMessage({
              type: 'file:exportResult',
              success: false,
              error: error instanceof Error ? error.message : 'Export failed',
            });
          }
        }
        break;
      }
      case 'project:package': {
        await createProjectSnapshotPackage({
          packageId: 'neko-sketch',
          title: 'Package Sketch Project',
          sourceUri: document.uri,
          metadata: {
            kind: 'sketch',
            viewType: SketchEditorProvider.viewType,
          },
        });
        break;
      }

      // ─── Phase 2/3: webview response messages ───
      case 'response:exportCanvas': {
        this.resolveRequest(message.requestId as string, message.data);
        break;
      }
      case 'response:canvasImageData': {
        this.resolveRequest(message.requestId as string, message.data);
        break;
      }
      case 'response:layerImageData': {
        this.resolveRequest(message.requestId as string, message.data);
        break;
      }
      case 'response:selectionMask': {
        this.resolveRequest(message.requestId as string, message.data);
        break;
      }
    }
  }

  private syncOutline(data: NksDocument): void {
    if (!this.outlineProvider) return;

    const layers = data.layers ?? [];
    const mapLayers = (items: NksDocument['layers']): LayerOutlineData['layers'] =>
      items.map((l: NksDocument['layers'][number]) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        visible: l.visible,
        locked: l.locked,
        children: mapLayers(l.children ?? []),
      }));

    this.outlineProvider.updateData({
      name: 'Sketch',
      layers: mapLayers(layers),
    });
  }

  private async importFileUri(
    uri: vscode.Uri,
    webviewPanel: vscode.WebviewPanel,
    options?: { readonly name?: string },
  ): Promise<void> {
    try {
      if (isPsdUri(uri)) {
        if (!isPsdImportEnabled()) {
          const message = vscode.l10n.t('neko.sketch.psdImport.disabled');
          void vscode.window.showWarningMessage(message);
          await this.postImportFailure(webviewPanel, 'kill-switch-disabled', message, uri);
          return;
        }

        const fileData = await vscode.workspace.fs.readFile(uri);
        const name = uri.path.split('/').pop() || 'imported.psd';
        const payload = await parsePsdToWire(name, fileData);
        const shouldImport = await this.confirmPsdImportIfNeeded(payload);
        if (!shouldImport) {
          return;
        }

        await webviewPanel.webview.postMessage({
          type: 'file:importedPsdTree',
          payload,
        });
        await this.showPsdImportIssues(payload);
        return;
      }

      const fileData = await vscode.workspace.fs.readFile(uri);
      const base64 = Buffer.from(fileData).toString('base64');
      const name = options?.name?.trim() || uri.path.split('/').pop() || 'imported';
      await webviewPanel.webview.postMessage({
        type: 'file:imported',
        name,
        data: base64,
        path: uri.fsPath,
      });
    } catch (error) {
      logger.error(`Failed to import file: ${error}`);
      const message =
        error instanceof Error ? error.message : vscode.l10n.t('neko.sketch.import.failed');
      void vscode.window.showErrorMessage(message);
      await this.postImportFailure(webviewPanel, getImportFailureCode(error), message, uri);
    }
  }

  private async importFileUriThroughAddSource(
    uri: vscode.Uri,
    documentUri: vscode.Uri,
    webviewPanel: vscode.WebviewPanel,
    options: { readonly caller: string; readonly name?: string },
  ): Promise<void> {
    await this.handleSketchProjectAddSource(
      this.createSketchFilePickerSourceAddRequest(uri, documentUri, options),
      documentUri,
      webviewPanel,
    );
  }

  private async handleSketchProjectAddSource(
    request: ProjectSourceAddRequest | undefined,
    documentUri: vscode.Uri,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    if (!request) return;
    if (this.isSketchFilePickerSourceAddRequest(request)) {
      await this.handleSketchFilePickerSourceAdd(request, documentUri, webviewPanel);
      return;
    }
    const result = await handleProjectSourceAddHostRequest(request, {
      addSource: (sourceRequest) =>
        this.addSketchProjectSource(
          normalizeVSCodeProjectSourceAddRequest(sourceRequest),
          documentUri,
        ),
      postMessage: (message) => webviewPanel.webview.postMessage(message),
      logger,
    });
    if (!result.ok || !result.durablePath) return;

    const fileName = readSketchSourceAddDisplayName(request);
    const importPath =
      result.ingest?.outputPath ?? resolveSketchDurablePath(documentUri, result.durablePath);
    await this.importFileUri(vscode.Uri.file(importPath), webviewPanel, { name: fileName });
  }

  private isSketchFilePickerSourceAddRequest(request: ProjectSourceAddRequest): boolean {
    return (
      request.kind === 'file-picker' &&
      request.formatId === 'nks' &&
      !request.sourcePath &&
      !request.sourceUri &&
      !request.bytes &&
      !request.generatedAssetId
    );
  }

  private async handleSketchFilePickerSourceAdd(
    request: ProjectSourceAddRequest,
    documentUri: vscode.Uri,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const filters: Record<string, string[]> = {
      Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
      'All Files': ['*'],
    };
    if (isPsdImportEnabled()) {
      filters['Photoshop Documents'] = ['psd'];
    }
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters,
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
              message: 'Sketch source selection was cancelled.',
              recoverability: 'none',
            },
          ],
        }),
        postMessage: (message) => webviewPanel.webview.postMessage(message),
        logger,
      });
      return;
    }

    await this.handleSketchProjectAddSource(
      this.createSketchFilePickerSourceAddRequest(uri, documentUri, {
        caller: request.caller ?? 'neko-sketch.project-add-source',
        requestId: request.requestId,
        metadata: request.metadata,
      }),
      documentUri,
      webviewPanel,
    );
  }

  private createSketchFilePickerSourceAddRequest(
    uri: vscode.Uri,
    documentUri: vscode.Uri,
    options: {
      readonly caller: string;
      readonly name?: string;
      readonly requestId?: string;
      readonly metadata?: Record<string, unknown>;
    },
  ): ProjectSourceAddRequest {
    const fileName = uri.path.split('/').pop() || 'imported';
    const displayName = options.name?.trim();
    return createVSCodeProjectSourceAddRequest({
      requestId:
        options.requestId ??
        `sketch-picker-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      kind: 'file-picker',
      formatId: 'nks',
      sourceUri: uri,
      role: 'image',
      destination: { kind: 'project', directory: 'imports', copyMode: 'link' },
      caller: options.caller,
      metadata: {
        ...(options.metadata ?? {}),
        sketchImport: true,
        name: fileName,
        ...(displayName ? { displayName } : {}),
        documentUri: documentUri.toString(),
      },
    });
  }

  private async addSketchProjectSource(
    request: ProjectSourceAddRequest,
    documentUri: vscode.Uri,
  ): Promise<ProjectSourceAddResult> {
    const fileName = readSketchSourceAddFileName(request);
    if (!isSketchImportFileName(fileName)) {
      return {
        requestId: request.requestId,
        ok: false,
        diagnostics: [
          {
            code: 'invalid-document',
            severity: 'error',
            message: `Unsupported Sketch import source: ${fileName}`,
            recoverability: 'manual',
          },
        ],
      };
    }

    const result = await handleProjectSourceAddRequest(
      {
        ...request,
        caller: request.caller ?? 'neko-sketch.project-add-source',
        target: request.target ?? { role: 'image' },
        destination: {
          kind: 'project',
          directory: request.destination.directory ?? 'imports',
          copyMode: request.destination.copyMode ?? (request.bytes ? 'copy' : 'link'),
        },
        metadata: {
          ...(request.metadata ?? {}),
          sketchImport: true,
          name: fileName,
        },
      },
      {
        ingest: (ingestRequest) =>
          ingestProjectSourceAddRequest(ingestRequest, {
            documentPath: documentUri.fsPath,
            assetDirectory: request.destination.directory ?? 'imports',
            workspaceContext: this.projectFileAdapter.createWorkspaceMediaPathContext({
              documentUri,
            }).context,
            fileOps: {
              createDirectory: async (dirPath) =>
                vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
              fileExists: async (filePath) => {
                try {
                  await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
                  return true;
                } catch {
                  return false;
                }
              },
              writeFile: async (filePath, bytes) =>
                vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes),
            },
            fileNameFallback: fileName,
            unmanagedSourceMessage:
              'Sketch import source must be moved into the project, asset library, or a configured media root before importing.',
          }),
      },
    );

    return result;
  }

  private async postImportFailure(
    webviewPanel: vscode.WebviewPanel,
    code: ImportFailureCode,
    error: string,
    uri: vscode.Uri,
  ): Promise<void> {
    await webviewPanel.webview.postMessage({
      type: FILE_IMPORT_RESULT_TYPE,
      success: false,
      code,
      error,
      name: uri.path.split('/').pop() ?? uri.path,
    });
  }

  private async confirmPsdImportIfNeeded(payload: PsdImportPayloadWire): Promise<boolean> {
    const layerCountIssue = payload.issues.find((issue) => issue.code === 'layer-count-exceeded');
    if (!layerCountIssue) {
      return true;
    }

    this.writePsdImportReport(payload);
    const importAnywayAction = vscode.l10n.t('neko.sketch.psdImport.importAnyway');
    const showDetailsAction = vscode.l10n.t('neko.sketch.psdImport.showDetails');
    const message = vscode.l10n.t('neko.sketch.psdImport.layerCountConfirm', {
      message: layerCountIssue.message,
    });
    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      importAnywayAction,
      showDetailsAction,
    );
    if (choice === showDetailsAction) {
      this.psdImportOutput.show(true);
      const retry = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        importAnywayAction,
      );
      return retry === importAnywayAction;
    }
    return choice === importAnywayAction;
  }

  private async showPsdImportIssues(payload: PsdImportPayloadWire): Promise<void> {
    if (payload.issues.length === 0) {
      return;
    }

    this.writePsdImportReport(payload);
    const showDetailsAction = vscode.l10n.t('neko.sketch.psdImport.showDetails');
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t('neko.sketch.psdImport.warningSummary', {
        count: payload.issues.length,
      }),
      showDetailsAction,
    );
    if (choice === showDetailsAction) {
      this.psdImportOutput.show(true);
    }
  }

  private writePsdImportReport(payload: PsdImportPayloadWire): void {
    this.psdImportOutput.clear();
    this.psdImportOutput.appendLine(
      vscode.l10n.t('neko.sketch.psdImport.reportTitle', { name: payload.name }),
    );
    this.psdImportOutput.appendLine(
      vscode.l10n.t('neko.sketch.psdImport.reportCanvas', {
        width: payload.tree.canvas.width,
        height: payload.tree.canvas.height,
        layers: this.countPsdLayers(payload.tree.layers),
      }),
    );
    this.psdImportOutput.appendLine(
      vscode.l10n.t('neko.sketch.psdImport.reportIssues', { count: payload.issues.length }),
    );
    this.psdImportOutput.appendLine(formatPsdImportIssueSummary(payload.issues));
    this.psdImportOutput.appendLine('');
    for (const [index, issue] of payload.issues.entries()) {
      this.psdImportOutput.appendLine(formatPsdImportIssue(issue, index + 1));
    }
  }

  private countPsdLayers(layers: readonly PsdLayerNodeWire[]): number {
    return layers.reduce((sum, layer) => sum + 1 + this.countPsdLayers(layer.children ?? []), 0);
  }

  private async openAgentForSketch(
    message: { type: string; [key: string]: unknown },
    document: vscode.CustomDocument,
  ): Promise<void> {
    const operation = typeof message.operation === 'string' ? message.operation : 'generate';
    const prompt = typeof message.prompt === 'string' ? message.prompt.trim() : '';
    const params = normalizeSketchAIOperationParams(message.params);
    const label = document.uri.path.split('/').pop() || 'Neko Sketch';
    try {
      await vscode.commands.executeCommand('neko.agent.sendContext', {
        type: 'sketch-layer',
        id: document.uri.toString(),
        label,
        summary: createSketchAgentSummary(label, operation, params),
        data: {
          documentUri: document.uri.toString(),
          operation,
          params,
        },
        intent: createSketchAgentIntent(operation, prompt, params),
      });
    } catch (error) {
      logger.warn(`Failed to open Neko Agent for sketch AI: ${error}`);
      void vscode.window.showWarningMessage(vscode.l10n.t('neko.sketch.ai.openAgent.failed'));
    }
  }
}

function getImportFailureCode(error: unknown): ImportFailureCode {
  return error instanceof PsdImportError ? error.code : 'import-failed';
}

function createSketchAIImageResult(
  request: SketchAIImageResultRequest,
  asset: SketchAIAssetRef,
): SketchAIResult {
  if (request.target === 'selection') {
    return {
      kind: 'selection',
      data: asset,
      metadata: request.metadata,
    };
  }

  return {
    kind: 'layer',
    data: asset,
    name: request.name,
    width: request.width,
    height: request.height,
    offsetX: request.offsetX,
    offsetY: request.offsetY,
    opacity: request.opacity,
    blendMode: request.blendMode,
    metadata: request.metadata,
  };
}

function createAIResultRunId(operation: string): string {
  return `${sanitizePathSegment(operation)}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createAIResultFileName(name: string, mimeType: string): string {
  const ext = extensionForMimeType(mimeType);
  const base = sanitizePathSegment(stripKnownImageExtension(name)) || 'ai-result';
  return `${base}.${ext}`;
}

async function readAIResultSource(request: SketchAIImageResultRequest): Promise<{
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}> {
  const localUri = parseLocalSourceUri(request.sourceUrl);
  if (localUri) {
    return {
      bytes: await vscode.workspace.fs.readFile(localUri),
      mimeType: request.mimeType ?? mimeTypeFromFileName(localUri.path) ?? 'image/png',
    };
  }

  const response = await fetch(request.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download AI result: HTTP ${response.status}`);
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType:
      request.mimeType ??
      normalizeMimeType(response.headers.get('content-type')) ??
      mimeTypeFromFileName(request.sourceUrl) ??
      'image/png',
  };
}

function parseLocalSourceUri(sourceUrl: string): vscode.Uri | null {
  if (sourceUrl.startsWith('file:')) {
    return vscode.Uri.parse(sourceUrl);
  }
  if (sourceUrl.startsWith('/')) {
    return vscode.Uri.file(sourceUrl);
  }
  return null;
}

function stripKnownImageExtension(name: string): string {
  return name.replace(/\.(png|jpe?g|webp|gif|bmp)$/i, '');
}

function normalizeMimeType(value: string | null): string | undefined {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase();
  return mimeType || undefined;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/bmp':
      return 'bmp';
    case 'image/svg+xml':
      return 'svg';
    case 'image/png':
    default:
      return 'png';
  }
}

function mimeTypeFromFileName(path: string): string | undefined {
  const ext = path.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    default:
      return undefined;
  }
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeSketchAIOperationParams(value: unknown): SketchAIOperationParams {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const source = value as Record<string, unknown>;
  const params: Record<string, unknown> = {};

  if (source.scope === 'canvas' || source.scope === 'layer') {
    params.scope = source.scope;
  }
  if (typeof source.negativePrompt === 'string' && source.negativePrompt.trim()) {
    params.negativePrompt = source.negativePrompt.trim();
  }
  if (typeof source.strength === 'number' && Number.isFinite(source.strength)) {
    params.strength = Math.max(0, Math.min(1, source.strength));
  }
  if (source.scale === 2 || source.scale === 4) {
    params.scale = source.scale;
  }
  if (typeof source.style === 'string' && source.style.trim()) {
    params.style = source.style.trim();
  }
  if (typeof source.layerName === 'string' && source.layerName.trim()) {
    params.layerName = source.layerName.trim();
  }
  if (Array.isArray(source.palette)) {
    const palette = source.palette.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    if (palette.length > 0) {
      params.palette = palette.map((item) => item.trim());
    }
  }
  if (Array.isArray(source.autoLayerTargets)) {
    const targets = source.autoLayerTargets.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    if (targets.length > 0) {
      params.autoLayerTargets = targets.map((item) => item.trim());
    }
  }

  return params as SketchAIOperationParams;
}

function createSketchAgentSummary(
  label: string,
  operation: string,
  params: SketchAIOperationParams,
): string {
  const suffix = formatSketchAIParams(params);
  return suffix
    ? `Neko Sketch document: ${label}. Requested AI operation: ${operation}. Parameters: ${suffix}.`
    : `Neko Sketch document: ${label}. Requested AI operation: ${operation}.`;
}

function createSketchAgentIntent(
  operation: string,
  prompt: string,
  params: SketchAIOperationParams = {},
): string {
  const operationText = operation.replace(/-/g, ' ');
  const parts = [`Use Neko Sketch ${operationText} on the active sketch.`];
  if (prompt) {
    parts.push(`Prompt: ${prompt}`);
  }
  const formattedParams = formatSketchAIParams(params);
  if (formattedParams) {
    parts.push(`Parameters: ${formattedParams}`);
  }
  return parts.join(' ');
}

function formatSketchAIParams(params: SketchAIOperationParams): string {
  const items: string[] = [];
  if (params.scope) items.push(`scope=${params.scope}`);
  if (params.negativePrompt) items.push(`negativePrompt=${params.negativePrompt}`);
  if (params.strength !== undefined) items.push(`strength=${params.strength}`);
  if (params.scale !== undefined) items.push(`scale=${params.scale}x`);
  if (params.style) items.push(`style=${params.style}`);
  if (params.layerName) items.push(`layerName=${params.layerName}`);
  if (params.palette?.length) items.push(`palette=${params.palette.join(', ')}`);
  if (params.autoLayerTargets?.length) {
    items.push(`autoLayerTargets=${params.autoLayerTargets.join(', ')}`);
  }
  return items.join('; ');
}

export interface PsdImportIssueSummaryEntry {
  readonly code: PsdImportIssue['code'];
  readonly severity: PsdImportIssue['severity'];
  readonly count: number;
  readonly sampleLayerPaths: readonly string[];
}

export function summarizePsdImportIssues(
  issues: readonly PsdImportIssue[],
): readonly PsdImportIssueSummaryEntry[] {
  const entries = new Map<PsdImportIssue['code'], PsdImportIssueSummaryEntry>();
  for (const issue of issues) {
    const existing = entries.get(issue.code);
    const layerPath = formatPsdIssueLayerPath(issue);
    if (!existing) {
      entries.set(issue.code, {
        code: issue.code,
        severity: issue.severity,
        count: 1,
        sampleLayerPaths: [layerPath],
      });
      continue;
    }

    entries.set(issue.code, {
      ...existing,
      severity: mergeIssueSeverity(existing.severity, issue.severity),
      count: existing.count + 1,
      sampleLayerPaths: appendIssueSample(existing.sampleLayerPaths, layerPath),
    });
  }
  return [...entries.values()];
}

export function formatPsdImportIssueSummary(issues: readonly PsdImportIssue[]): string {
  const summary = summarizePsdImportIssues(issues);
  if (summary.length === 0) {
    return 'Summary by issue type: none';
  }

  return [
    'Summary by issue type:',
    ...summary.map((entry) => {
      const samples = entry.sampleLayerPaths.length
        ? ` (examples: ${entry.sampleLayerPaths.join('; ')})`
        : '';
      return `- [${entry.severity}] ${entry.code}: ${entry.count}${samples}`;
    }),
  ].join('\n');
}

function formatPsdImportIssue(issue: PsdImportIssue, index: number): string {
  const layerPath = formatPsdIssueLayerPath(issue);
  return [
    `${index}. [${issue.severity}] ${issue.code}`,
    `   Layer: ${layerPath}`,
    `   ${issue.message}`,
    '',
  ].join('\n');
}

function formatPsdIssueLayerPath(issue: PsdImportIssue): string {
  const layerPath = issue.layerPath?.length ? issue.layerPath.join(' > ') : '(document)';
  return layerPath;
}

function mergeIssueSeverity(
  left: PsdImportIssue['severity'],
  right: PsdImportIssue['severity'],
): PsdImportIssue['severity'] {
  return left === 'error' || right === 'error' ? 'error' : 'warning';
}

function appendIssueSample(samples: readonly string[], layerPath: string): readonly string[] {
  if (samples.includes(layerPath)) {
    return samples;
  }
  if (samples.length >= 3) {
    return samples;
  }
  return [...samples, layerPath];
}
