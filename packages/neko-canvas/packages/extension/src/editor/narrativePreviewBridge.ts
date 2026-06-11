import * as vscode from 'vscode';
import {
  createCanvasPlaybackPlan,
  createNarrativeRelativePathAssetRef,
  isNarrativeAssetRef,
  isResourceRef,
  NARRATIVE_RUNTIME_NODE_TYPES,
  normalizeNarrativePreviewFeatureToggles,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasPlaybackDiagnostic,
  type CanvasPlaybackPlan,
  type CanvasConnection,
  type CanvasData,
  type CanvasNode,
  type CanvasSerializableRecord,
  type CanvasSerializableValue,
  type CanvasToPreviewMessage,
  type NarrativeAssetRef,
  type NarrativeConnectionSnapshot,
  type NarrativeEndingMetadata,
  type NarrativeGraphSnapshot,
  type NarrativeMetadata,
  type NarrativeNodeSnapshot,
  type NarrativePreviewFeatureToggles,
  type NarrativeRuntimeNodeType,
  type NarrativeSceneMetadata,
  type PreviewToCanvasMessage,
  type StoryGenre,
  type VariableEffect,
} from '@neko/shared';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import { getLogger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';

const logger = getLogger('NarrativePreviewBridge');

const NARRATIVE_RUNTIME_NODE_TYPE_SET: ReadonlySet<string> = new Set(NARRATIVE_RUNTIME_NODE_TYPES);

const NARRATIVE_RUNTIME_CONNECTION_TYPES = new Set<string | undefined>([
  undefined,
  'default',
  'choice',
]);
const HOST_PREVIEW_VARIANT_RESPONSE_TIMEOUT_MS = 6500;
const PREVIEW_WEBVIEW_READY_GRACE_MS = 250;
const DEFAULT_PREVIEW_STALE_GRACE_MS = 30_000;

interface NarrativePreviewI18n {
  readonly title: string;
  readonly statusWaitingGraph: string;
  readonly ariaStage: string;
  readonly ariaStageOverlay: string;
  readonly ariaPlaybackDetails: string;
  readonly ariaDetails: string;
  readonly ariaControls: string;
  readonly ariaTimeline: string;
  readonly unitFallback: string;
  readonly planCanvasPlayback: string;
  readonly info: string;
  readonly route: string;
  readonly routeTitle: string;
  readonly missingRouteCandidates: string;
  readonly missingRouteEntry: string;
  readonly invalidRoute: string;
  readonly routeTruncated: string;
  readonly branches: string;
  readonly diagnostics: string;
  readonly staleSession: string;
  readonly staleSessionDescription: string;
  readonly noUnitSelected: string;
  readonly close: string;
  readonly stageZero: string;
  readonly previous: string;
  readonly previousShort: string;
  readonly play: string;
  readonly pause: string;
  readonly next: string;
  readonly summaryWaitingPlan: string;
  readonly statusLoadedZeroRuntime: string;
  readonly statusLoadedRuntime: string;
  readonly statusLoadedPlaybackPlan: string;
  readonly statusDiagnostics: string;
  readonly statusJumpRequest: string;
  readonly stagePosition: string;
  readonly noPlayableUnit: string;
  readonly noPlayableUnitDescription: string;
  readonly mediaUnavailable: string;
  readonly mediaUnavailableDescription: string;
  readonly mediaLoading: string;
  readonly mediaPreparing: string;
  readonly storyboardShot: string;
  readonly storyboardShotUnavailableDescription: string;
  readonly storyboardScene: string;
  readonly storyboardSceneDescription: string;
  readonly canvasNode: string;
  readonly canvasNodeDescription: string;
  readonly playbackPreviewAlt: string;
  readonly labelMode: string;
  readonly labelDuration: string;
  readonly labelAsset: string;
  readonly labelShot: string;
  readonly labelScale: string;
  readonly labelAction: string;
  readonly labelDialogue: string;
  readonly labelScene: string;
  readonly labelLocation: string;
  readonly labelTime: string;
  readonly labelMedia: string;
  readonly labelMime: string;
  readonly labelSourceNode: string;
  readonly labelRenderMode: string;
  readonly labelResource: string;
  readonly labelCamera: string;
  readonly labelAngle: string;
  readonly labelVoice: string;
  readonly labelSound: string;
  readonly labelStatus: string;
  readonly labelCharacters: string;
  readonly labelMediaRefs: string;
  readonly labelPreviewSource: string;
  readonly previewSourceGeneratedImage: string;
  readonly previewSourceGeneratedMedia: string;
  readonly previewSourceReferenceImage: string;
  readonly previewSourceSourceMedia: string;
  readonly previewSourceMediaAsset: string;
  readonly labelImageAsset: string;
  readonly labelVideoAsset: string;
  readonly labelScript: string;
  readonly labelMediaType: string;
  readonly labelAssetPath: string;
  readonly labelDocument: string;
  readonly labelProject: string;
  readonly labelScenes: string;
  readonly noBranches: string;
  readonly noDiagnostics: string;
  readonly planStoryboardPreview: string;
  readonly planMediaSequencePreview: string;
  readonly planNarrativePlaybackPlan: string;
  readonly shotTitle: string;
  readonly fallbackUnitTitle: string;
  readonly bodyShotFallback: string;
  readonly bodySceneFallback: string;
  readonly bodyMediaSource: string;
  readonly bodyMediaFallback: string;
  readonly bodyNarrativeFallback: string;
  readonly bodyContainerFallback: string;
  readonly bodyGenericFallback: string;
  readonly choiceContinueTo: string;
  readonly choiceContinue: string;
  readonly choiceTransition: string;
  readonly itemCountOne: string;
  readonly itemCountMany: string;
  readonly durationSeconds: string;
  readonly kindNode: string;
  readonly kindContainer: string;
  readonly kindMedia: string;
  readonly kindShot: string;
  readonly kindScene: string;
  readonly kindNarrative: string;
  readonly kindUnit: string;
  readonly disabledByConfiguration: string;
  readonly noActiveGraph: string;
}

export interface NarrativeCanvasSnapshotHost {
  extractNarrativeGraphSnapshot(): NarrativeGraphSnapshot | undefined;
  extractNarrativeGraphSnapshotForSource?(
    sourceCanvasUri: string,
  ): NarrativeGraphSnapshot | undefined;
  extractCanvasPlaybackPlan?(sourceCanvasUri?: string): CanvasPlaybackPlan | undefined;
  extractCanvasPlaybackPlanForPreview?(
    webview: vscode.Webview,
    sourceCanvasUri?: string,
  ): CanvasPlaybackPlan | Promise<CanvasPlaybackPlan | undefined> | undefined;
  resolveNarrativePreviewVariant?(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    sourceCanvasUri?: string,
  ): boolean | void | Promise<boolean | void>;
  handleNarrativePreviewMediaMessage?(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    sourceCanvasUri?: string,
  ): void | Promise<void>;
  disposeNarrativePreviewMediaPanel?(webviewPanel: vscode.WebviewPanel): void | Promise<void>;
  postNarrativePreviewCanvasMessage(message: PreviewToCanvasMessage): boolean;
}

export interface NarrativePreviewBridgeOptions {
  readonly panelFactory?: NarrativePreviewPanelFactory;
  readonly getFeatureToggles?: () => NarrativePreviewFeatureToggles;
  readonly getMediaRuntimeScriptUri?: (webview: vscode.Webview) => vscode.Uri;
  readonly getWebviewLocalResourceRoots?: (sourceCanvasUri?: string) => readonly vscode.Uri[];
  readonly staleSessionGraceMs?: number;
  readonly now?: () => number;
}

export interface NarrativePreviewPanelFactory {
  createWebviewPanel(
    viewType: string,
    title: string,
    showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
    options?: vscode.WebviewPanelOptions & vscode.WebviewOptions,
  ): vscode.WebviewPanel;
}

interface CanvasPreviewSession {
  readonly sessionId: string;
  readonly sourceCanvasUri: string;
  readonly panel: vscode.WebviewPanel;
  readonly createdAt: number;
  readonly revision: number;
  webviewReady: boolean;
  pendingMessages: CanvasToPreviewMessage[];
  staleSince?: number;
  staleTimeout?: ReturnType<typeof setTimeout>;
  activeRouteId?: string;
}

interface CanvasPreviewMessageEnvelope {
  readonly sessionId?: string;
  readonly sourceCanvasUri?: string;
  readonly revision?: number;
}

export class NarrativePreviewBridge implements vscode.Disposable {
  private disposed = false;
  private requestSequence = 0;
  private sessionSequence = 0;
  private activeSessionId: string | undefined;
  private readonly sessionsByCanvasUri = new Map<string, CanvasPreviewSession>();
  private readonly sessionsByPanel = new WeakMap<vscode.WebviewPanel, CanvasPreviewSession>();
  private readonly panelFactory: NarrativePreviewPanelFactory;
  private readonly getFeatureToggles: () => NarrativePreviewFeatureToggles;
  private readonly getMediaRuntimeScriptUri: ((webview: vscode.Webview) => vscode.Uri) | undefined;
  private readonly getWebviewLocalResourceRoots:
    | ((sourceCanvasUri?: string) => readonly vscode.Uri[])
    | undefined;
  private readonly staleSessionGraceMs: number;
  private readonly now: () => number;

  constructor(
    private readonly host: NarrativeCanvasSnapshotHost,
    private readonly options: NarrativePreviewBridgeOptions,
  ) {
    this.panelFactory = options.panelFactory ?? vscode.window;
    this.getFeatureToggles =
      options.getFeatureToggles ?? (() => normalizeNarrativePreviewFeatureToggles(undefined));
    this.getMediaRuntimeScriptUri = options.getMediaRuntimeScriptUri;
    this.getWebviewLocalResourceRoots = options.getWebviewLocalResourceRoots;
    this.staleSessionGraceMs = options.staleSessionGraceMs ?? DEFAULT_PREVIEW_STALE_GRACE_MS;
    this.now = options.now ?? Date.now;
  }

  async open(): Promise<boolean> {
    const i18n = createNarrativePreviewI18n();
    if (!this.getFeatureToggles().preview) {
      void handleError(new Error(i18n.disabledByConfiguration), {
        showToUser: true,
        severity: 'warning',
      });
      return false;
    }

    const snapshot = this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) {
      void handleError(new Error(i18n.noActiveGraph), {
        showToUser: true,
        severity: 'warning',
      });
      return false;
    }

    const sourceCanvasUri = snapshot.sourceCanvasUri ?? '';
    const existingSession = this.sessionsByCanvasUri.get(sourceCanvasUri);
    const session = this.ensureSession(sourceCanvasUri, snapshot.revision, {
      deferHtml: !existingSession,
    });
    this.activeSessionId = session.sessionId;
    const messages: CanvasToPreviewMessage[] = [
      this.createFeatureTogglesMessage(session, snapshot.revision),
      {
        type: 'preview:loadGraph',
        requestId: this.createRequestId('load'),
        snapshot,
        revision: snapshot.revision,
      },
    ].map((message) => this.withSessionEnvelope(message, session, snapshot.revision));
    if (!existingSession) {
      const previewPlan = await this.resolveInitialCanvasPlaybackPlanForPreview(
        session.panel.webview,
        snapshot.revision,
        sourceCanvasUri,
      );
      if (previewPlan) {
        messages.push(
          this.withSessionEnvelope(
            {
              type: 'preview:loadPlaybackPlan',
              requestId: this.createRequestId(
                previewPlan.source === 'preview' ? 'load-preview-plan' : 'load-plan',
              ),
              plan: previewPlan.plan,
              revision: snapshot.revision,
            },
            session,
            snapshot.revision,
          ),
        );
      }
      session.panel.webview.html = this.getPreviewHtml(session.panel.webview, messages, i18n);
      for (const message of messages) {
        this.recordPreviewMessageRevision(session, message);
      }
      return true;
    }

    this.postPreviewPlaybackPlan(session, snapshot.revision, 'load');
    for (const message of messages) {
      this.postToPreview(session, message);
    }
    return true;
  }

  private async resolveInitialCanvasPlaybackPlanForPreview(
    webview: vscode.Webview,
    revision: number,
    sourceCanvasUri: string | undefined,
  ): Promise<
    | {
        readonly source: 'base' | 'preview';
        readonly plan: CanvasPlaybackPlan;
      }
    | undefined
  > {
    if (this.host.extractCanvasPlaybackPlanForPreview) {
      try {
        const plan = await this.host.extractCanvasPlaybackPlanForPreview(webview, sourceCanvasUri);
        if (plan) {
          return { source: 'preview', plan: prepareCanvasPlaybackPlanForPreview(plan) };
        }
      } catch (error) {
        logger.warn('Failed to prepare initial Canvas playback plan for Preview', {
          revision,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const basePlan = this.host.extractCanvasPlaybackPlan?.(sourceCanvasUri);
    return basePlan
      ? { source: 'base', plan: prepareCanvasPlaybackPlanForPreview(basePlan) }
      : undefined;
  }

  refresh(sourceCanvasUri?: string): boolean {
    if (!this.getFeatureToggles().preview) return false;

    const snapshot = sourceCanvasUri
      ? this.host.extractNarrativeGraphSnapshotForSource?.(sourceCanvasUri)
      : this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) return false;
    const resolvedSourceCanvasUri = snapshot.sourceCanvasUri ?? sourceCanvasUri ?? '';
    if (sourceCanvasUri && resolvedSourceCanvasUri !== sourceCanvasUri) return false;
    const session = this.sessionsByCanvasUri.get(resolvedSourceCanvasUri);
    if (!session) return false;
    this.activeSessionId = session.sessionId;
    const acceptedSession = this.acceptRevision(session, snapshot.revision);
    this.postFeatureToggles(acceptedSession, snapshot.revision);
    this.postToPreview(acceptedSession, {
      type: 'preview:refresh',
      requestId: this.createRequestId('refresh'),
      snapshot,
      revision: snapshot.revision,
    });
    this.postPreviewPlaybackPlan(acceptedSession, snapshot.revision, 'refresh');
    return true;
  }

  jumpTo(nodeId: string): boolean {
    if (!this.getFeatureToggles().preview) return false;

    const snapshot = this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) return false;
    const sourceCanvasUri = snapshot.sourceCanvasUri ?? '';
    const session = this.ensureSession(sourceCanvasUri, snapshot.revision);
    this.activeSessionId = session.sessionId;
    const acceptedSession = this.acceptRevision(session, snapshot.revision);
    this.postFeatureToggles(acceptedSession, snapshot.revision);
    this.postToPreview(acceptedSession, {
      type: 'preview:jumpTo',
      requestId: this.createRequestId('jump'),
      nodeId,
      revision: snapshot.revision,
    });
    return true;
  }

  setVariables(variables: Readonly<Record<string, unknown>>): boolean {
    if (!this.getFeatureToggles().preview) return false;

    const snapshot = this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) return false;
    const sourceCanvasUri = snapshot.sourceCanvasUri ?? '';
    const session = this.sessionsByCanvasUri.get(sourceCanvasUri);
    if (!session) return false;
    this.activeSessionId = session.sessionId;
    const acceptedSession = this.acceptRevision(session, snapshot.revision);

    this.postFeatureToggles(acceptedSession, snapshot.revision);
    this.postToPreview(acceptedSession, {
      type: 'preview:setVariables',
      requestId: this.createRequestId('variables'),
      variables,
      revision: snapshot.revision,
    });
    return true;
  }

  handlePreviewMessage(message: PreviewToCanvasMessage): boolean {
    const session = this.resolveSessionForPreviewMessage(message);
    if (!session) {
      logger.debug('Dropped Preview-to-Canvas message without matching session', message);
      return false;
    }
    if (this.isStalePreviewMessage(session, message)) {
      logger.debug('Dropped stale Preview-to-Canvas message', message);
      return false;
    }
    return this.host.postNarrativePreviewCanvasMessage(message);
  }

  dispose(): void {
    this.disposed = true;
    const sessions = [...this.sessionsByCanvasUri.values()];
    this.sessionsByCanvasUri.clear();
    this.activeSessionId = undefined;
    for (const session of sessions) {
      this.disposeSession(session);
    }
  }

  handleCanvasEditorClosed(sourceCanvasUri: string): void {
    const session = this.sessionsByCanvasUri.get(sourceCanvasUri);
    if (!session) return;
    if (!session.panel.visible) {
      this.disposeSession(session);
      return;
    }
    this.markSessionStale(session);
  }

  private ensureSession(
    sourceCanvasUri: string,
    revision: number,
    options: { readonly deferHtml?: boolean } = {},
  ): CanvasPreviewSession {
    if (this.disposed) {
      throw new Error('NarrativePreviewBridge has been disposed.');
    }
    const existing = this.sessionsByCanvasUri.get(sourceCanvasUri);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      this.clearSessionStale(existing);
      return this.acceptRevision(existing, revision);
    }

    const i18n = createNarrativePreviewI18n();
    const panel = this.panelFactory.createWebviewPanel(
      'neko.canvasNarrativePreview',
      i18n.title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        ...(this.getWebviewLocalResourceRoots
          ? { localResourceRoots: [...this.getWebviewLocalResourceRoots(sourceCanvasUri)] }
          : {}),
      },
    );
    const session: CanvasPreviewSession = {
      sessionId: this.createSessionId(),
      sourceCanvasUri,
      panel,
      createdAt: this.now(),
      revision,
      webviewReady: false,
      pendingMessages: [],
    };
    this.sessionsByCanvasUri.set(sourceCanvasUri, session);
    this.sessionsByPanel.set(panel, session);
    panel.webview.onDidReceiveMessage(
      (message) => {
        const currentSession = this.findSessionById(session.sessionId);
        if (!currentSession) {
          logger.debug('Dropped Preview message for disposed session', message);
          return;
        }
        if (isPreviewWebviewReadyMessage(message)) {
          if (
            !this.isPreviewRuntimeMessageForSession(message, currentSession, {
              allowMissingIdentity: true,
            })
          ) {
            logger.debug('Dropped ready message for mismatched Preview session', message);
            return;
          }
          currentSession.webviewReady = true;
          this.flushPendingPreviewMessages(currentSession);
          return;
        }
        if (isNarrativePreviewMediaMessage(message)) {
          if (
            !this.isPreviewRuntimeMessageForSession(message, currentSession, {
              allowMissingIdentity: true,
            })
          ) {
            logger.debug('Dropped media message for mismatched Preview session', message);
            return;
          }
          void this.host.handleNarrativePreviewMediaMessage?.(
            message,
            panel,
            currentSession.sourceCanvasUri,
          );
          return;
        }
        if (isNarrativePreviewVariantMessage(message)) {
          if (
            !this.isPreviewRuntimeMessageForSession(message, currentSession, {
              allowMissingIdentity: true,
            })
          ) {
            logger.debug('Dropped variant message for mismatched Preview session', message);
            return;
          }
          this.handlePreviewVariantRequest(message, currentSession);
          return;
        }
        const previewMessage = parsePreviewToCanvasMessage(message);
        if (previewMessage) {
          this.handlePreviewMessage(previewMessage);
        }
      },
      undefined,
      [],
    );
    if (!options.deferHtml) {
      panel.webview.html = this.getPreviewHtml(panel.webview, [], i18n);
    }
    panel.onDidDispose(() => {
      void this.host.disposeNarrativePreviewMediaPanel?.(panel);
      const current = this.sessionsByPanel.get(panel);
      if (current) {
        this.clearSessionStale(current);
        current.pendingMessages = [];
        this.sessionsByCanvasUri.delete(current.sourceCanvasUri);
        if (this.activeSessionId === current.sessionId) {
          this.activeSessionId = undefined;
        }
      }
    });
    return session;
  }

  private markSessionStale(session: CanvasPreviewSession): void {
    if (session.staleSince !== undefined) {
      return;
    }
    session.staleSince = this.now();
    this.postToPreview(session, {
      type: 'preview:sessionStale',
      requestId: this.createRequestId('stale'),
      revision: session.revision,
    } as CanvasToPreviewMessage);
    session.staleTimeout = setTimeout(() => {
      const current = this.sessionsByCanvasUri.get(session.sourceCanvasUri);
      if (!current || current.sessionId !== session.sessionId || current.staleSince === undefined) {
        return;
      }
      this.disposeSession(current);
    }, this.staleSessionGraceMs);
  }

  private clearSessionStale(session: CanvasPreviewSession): void {
    if (session.staleTimeout) {
      clearTimeout(session.staleTimeout);
      session.staleTimeout = undefined;
    }
    session.staleSince = undefined;
  }

  private disposeSession(session: CanvasPreviewSession): void {
    this.clearSessionStale(session);
    session.pendingMessages = [];
    this.sessionsByCanvasUri.delete(session.sourceCanvasUri);
    if (this.activeSessionId === session.sessionId) {
      this.activeSessionId = undefined;
    }
    session.panel.dispose();
  }

  private acceptRevision(session: CanvasPreviewSession, revision: number): CanvasPreviewSession {
    if (revision < session.revision) {
      return session;
    }
    if (revision === session.revision) {
      return session;
    }
    const next: CanvasPreviewSession = {
      ...session,
      revision,
      pendingMessages: session.pendingMessages,
      webviewReady: session.webviewReady,
    };
    this.sessionsByCanvasUri.set(next.sourceCanvasUri, next);
    this.sessionsByPanel.set(next.panel, next);
    return next;
  }

  private postToPreview(session: CanvasPreviewSession, message: CanvasToPreviewMessage): void {
    this.recordPreviewMessageRevision(session, message);
    const enveloped = this.withSessionEnvelope(
      message,
      session,
      readCanvasMessageRevision(message),
    );
    if (!session.webviewReady) {
      session.pendingMessages.push(enveloped);
      this.schedulePendingPreviewMessageFallback(session, enveloped);
      return;
    }
    session.panel.webview.postMessage(enveloped);
  }

  private schedulePendingPreviewMessageFallback(
    session: CanvasPreviewSession,
    message: CanvasToPreviewMessage,
  ): void {
    setTimeout(() => {
      const current = this.sessionsByCanvasUri.get(session.sourceCanvasUri);
      if (!current || current.sessionId !== session.sessionId || current.webviewReady) {
        return;
      }
      if (!current.pendingMessages.includes(message)) {
        return;
      }
      void current.panel.webview.postMessage(message).then((delivered) => {
        const latest = this.sessionsByCanvasUri.get(session.sourceCanvasUri);
        if (
          !delivered ||
          !latest ||
          latest.webviewReady ||
          latest.sessionId !== session.sessionId
        ) {
          return;
        }
        const index = latest.pendingMessages.indexOf(message);
        if (index >= 0) {
          latest.pendingMessages.splice(index, 1);
        }
        latest.webviewReady = true;
        this.flushPendingPreviewMessages(latest);
      });
    }, PREVIEW_WEBVIEW_READY_GRACE_MS);
  }

  private flushPendingPreviewMessages(session: CanvasPreviewSession): void {
    if (session.pendingMessages.length === 0) return;
    const messages = session.pendingMessages;
    session.pendingMessages = [];
    for (const message of messages) {
      session.panel.webview.postMessage(message);
    }
  }

  private handlePreviewVariantRequest(
    message: Record<string, unknown>,
    session: CanvasPreviewSession,
  ): void {
    const requestId = typeof message['requestId'] === 'string' ? message['requestId'] : undefined;
    if (!requestId) {
      return;
    }
    if (!this.host.resolveNarrativePreviewVariant) {
      void session.panel.webview.postMessage({
        type: 'preview:variantResolved',
        requestId,
        sessionId: session.sessionId,
        sourceCanvasUri: session.sourceCanvasUri,
        revision: session.revision,
        error: 'Preview variant resolution is unavailable for this Canvas host.',
      });
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      logger.warn('Canvas Preview variant request timed out before the host responded', {
        requestId,
        sourceId: typeof message['sourceId'] === 'string' ? message['sourceId'] : undefined,
      });
      void session.panel.webview.postMessage({
        type: 'preview:variantResolved',
        requestId,
        sessionId: session.sessionId,
        sourceCanvasUri: session.sourceCanvasUri,
        revision: session.revision,
        error: `Preview variant request timed out after ${HOST_PREVIEW_VARIANT_RESPONSE_TIMEOUT_MS}ms.`,
      });
    }, HOST_PREVIEW_VARIANT_RESPONSE_TIMEOUT_MS);

    Promise.resolve()
      .then(() =>
        this.host.resolveNarrativePreviewVariant?.(message, session.panel, session.sourceCanvasUri),
      )
      .then((handled) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        if (handled === false) {
          void session.panel.webview.postMessage({
            type: 'preview:variantResolved',
            requestId,
            sessionId: session.sessionId,
            sourceCanvasUri: session.sourceCanvasUri,
            revision: session.revision,
            error: 'Preview variant resolution completed without delivering a response.',
          });
        }
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        logger.warn('Canvas Preview variant host handler failed', {
          requestId,
          sourceId: typeof message['sourceId'] === 'string' ? message['sourceId'] : undefined,
          error: error instanceof Error ? error.message : String(error),
        });
        void session.panel.webview.postMessage({
          type: 'preview:variantResolved',
          requestId,
          sessionId: session.sessionId,
          sourceCanvasUri: session.sourceCanvasUri,
          revision: session.revision,
          error: error instanceof Error ? error.message : 'Preview variant resolution failed.',
        });
      });
  }

  private postFeatureToggles(session: CanvasPreviewSession, revision: number): void {
    this.postToPreview(session, this.createFeatureTogglesMessage(session, revision));
  }

  private createFeatureTogglesMessage(
    session: CanvasPreviewSession,
    revision: number,
  ): CanvasToPreviewMessage {
    return {
      type: 'preview:setFeatureToggles',
      requestId: this.createRequestId('toggles'),
      toggles: this.getFeatureToggles(),
      revision,
      sessionId: session.sessionId,
      sourceCanvasUri: session.sourceCanvasUri,
    } as CanvasToPreviewMessage;
  }

  private postPreviewPlaybackPlan(
    session: CanvasPreviewSession,
    revision: number,
    mode: 'load' | 'refresh',
  ): void {
    const basePlan = this.host.extractCanvasPlaybackPlan?.(session.sourceCanvasUri);
    const postedBasePlan = this.postCanvasPlaybackPlanToPreview(session, revision, mode, basePlan, {
      source: 'base',
      warnIfUnavailable: !this.host.extractCanvasPlaybackPlanForPreview,
    });

    if (!this.host.extractCanvasPlaybackPlanForPreview) {
      return;
    }

    void this.postPreviewSpecificPlaybackPlan(session, revision, mode, postedBasePlan);
  }

  private async postPreviewSpecificPlaybackPlan(
    session: CanvasPreviewSession,
    revision: number,
    mode: 'load' | 'refresh',
    postedBasePlan: boolean,
  ): Promise<void> {
    try {
      const plan = await this.host.extractCanvasPlaybackPlanForPreview?.(
        session.panel.webview,
        session.sourceCanvasUri,
      );
      this.postCanvasPlaybackPlanToPreview(session, revision, mode, plan, {
        source: 'preview',
        warnIfUnavailable: !postedBasePlan,
      });
    } catch (error) {
      logger.warn('Failed to prepare Canvas playback plan for Preview', {
        revision,
        mode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private postCanvasPlaybackPlanToPreview(
    session: CanvasPreviewSession,
    revision: number,
    mode: 'load' | 'refresh',
    plan: CanvasPlaybackPlan | undefined,
    options: {
      readonly source: 'base' | 'preview';
      readonly warnIfUnavailable: boolean;
    },
  ): boolean {
    if (!plan) {
      if (options.warnIfUnavailable) {
        logger.warn('Canvas playback plan was unavailable for Preview', {
          revision,
          mode,
          source: options.source,
        });
      }
      return false;
    }
    const current = this.sessionsByCanvasUri.get(session.sourceCanvasUri);
    if (!current || current.sessionId !== session.sessionId || revision < current.revision) {
      logger.debug('Dropped stale Canvas playback plan for Preview', {
        revision,
        mode,
        source: options.source,
        lastAcceptedPreviewRevision: current?.revision,
      });
      return false;
    }
    const acceptedSession = this.acceptRevision(current, revision);
    const previewPlan = prepareCanvasPlaybackPlanForPreview(plan);
    this.postToPreview(acceptedSession, {
      type: mode === 'load' ? 'preview:loadPlaybackPlan' : 'preview:refreshPlaybackPlan',
      requestId: this.createRequestId(
        options.source === 'preview' ? `${mode}-preview-plan` : `${mode}-plan`,
      ),
      plan: previewPlan,
      revision,
    });
    return true;
  }

  private recordPreviewMessageRevision(
    session: CanvasPreviewSession,
    message: CanvasToPreviewMessage,
  ): void {
    const revision = readCanvasMessageRevision(message);
    if (revision !== undefined) {
      this.acceptRevision(session, revision);
    }
  }

  private isStalePreviewMessage(
    session: CanvasPreviewSession,
    message: PreviewToCanvasMessage,
  ): boolean {
    const revision = readRevision(message);
    return revision !== undefined && revision < session.revision;
  }

  private resolveSessionForPreviewMessage(
    message: PreviewToCanvasMessage,
  ): CanvasPreviewSession | undefined {
    const envelope = readCanvasPreviewEnvelope(message);
    if (envelope.sessionId || envelope.sourceCanvasUri) {
      return this.findSessionByEnvelope(envelope);
    }
    return this.activeSessionId ? this.findSessionById(this.activeSessionId) : undefined;
  }

  private isPreviewRuntimeMessageForSession(
    message: unknown,
    session: CanvasPreviewSession,
    options: { readonly allowMissingIdentity?: boolean } = {},
  ): boolean {
    const envelope = readCanvasPreviewEnvelope(message);
    if (!envelope.sessionId && !envelope.sourceCanvasUri) {
      return options.allowMissingIdentity === true;
    }
    if (envelope.sessionId && envelope.sessionId !== session.sessionId) {
      return false;
    }
    if (envelope.sourceCanvasUri && envelope.sourceCanvasUri !== session.sourceCanvasUri) {
      return false;
    }
    if (envelope.revision !== undefined && envelope.revision < session.revision) {
      return false;
    }
    return true;
  }

  private findSessionByEnvelope(
    envelope: CanvasPreviewMessageEnvelope,
  ): CanvasPreviewSession | undefined {
    if (envelope.sessionId) {
      const session = this.findSessionById(envelope.sessionId);
      if (!session) return undefined;
      if (envelope.sourceCanvasUri && envelope.sourceCanvasUri !== session.sourceCanvasUri) {
        return undefined;
      }
      return session;
    }
    return envelope.sourceCanvasUri
      ? this.sessionsByCanvasUri.get(envelope.sourceCanvasUri)
      : undefined;
  }

  private findSessionById(sessionId: string): CanvasPreviewSession | undefined {
    for (const session of this.sessionsByCanvasUri.values()) {
      if (session.sessionId === sessionId) {
        return session;
      }
    }
    return undefined;
  }

  private withSessionEnvelope<TMessage extends CanvasToPreviewMessage>(
    message: TMessage,
    session: CanvasPreviewSession,
    revision: number | undefined,
  ): TMessage {
    return {
      ...message,
      sessionId: session.sessionId,
      sourceCanvasUri: session.sourceCanvasUri,
      ...(revision !== undefined ? { revision } : {}),
    } as TMessage;
  }

  private createSessionId(): string {
    this.sessionSequence += 1;
    return `canvas-preview:${this.now()}:${this.sessionSequence}`;
  }

  private createRequestId(reason: string): string {
    this.requestSequence += 1;
    return `canvas-narrative:${reason}:${this.now()}:${this.requestSequence}`;
  }

  private getPreviewHtml(
    webview: vscode.Webview,
    bootstrapMessages: readonly CanvasToPreviewMessage[] = [],
    i18n: NarrativePreviewI18n = createNarrativePreviewI18n(),
  ): string {
    const nonce = createNonce();
    const bootstrapJson = serializePreviewBootstrapMessages(bootstrapMessages);
    const i18nJson = serializePreviewJson(i18n);
    const mediaRuntimeScriptUri = this.resolveMediaRuntimeScriptUri(webview);
    const localeAttr = injectLocaleAttribute();
    const h = escapeHtml;
    return `<!DOCTYPE html>
<html ${localeAttr}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob: https:; font-src ${webview.cspSource}; media-src ${webview.cspSource} data: blob: https:; connect-src ws://127.0.0.1:* http://127.0.0.1:*;">
  <title>${h(i18n.title)}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    main { min-height: 100vh; height: 100vh; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; }
    section { width: 100%; box-sizing: border-box; }
    h1 { margin: 0; font-size: 16px; font-weight: 600; }
    h2 { margin: 0; font-size: 28px; font-weight: 650; }
    h3 { margin: 0 0 8px; font-size: 12px; font-weight: 650; text-transform: uppercase; color: var(--vscode-descriptionForeground); letter-spacing: 0; }
    p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.5; }
    code { color: var(--vscode-textLink-foreground); }
    button { height: 30px; border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 0 10px; cursor: pointer; }
    button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    .placeholder { max-width: 720px; margin: 18px; border: 1px solid var(--vscode-panel-border); padding: 16px; border-radius: 6px; background: var(--vscode-sideBar-background); }
    .playback-shell { display: none; min-height: 100vh; height: 100vh; }
    .playback-shell[data-visible="true"] { display: flex; flex-direction: column; }
    .player-stage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; align-items: stretch; justify-content: center; overflow: hidden; background: color-mix(in srgb, var(--vscode-editor-background) 88%, black); }
    .stage-overlay { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 4; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; pointer-events: none; }
    .stage-heading { min-width: 0; display: grid; gap: 4px; max-width: min(520px, 58vw); padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 78%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--vscode-editor-background) 88%, transparent); backdrop-filter: blur(10px); pointer-events: auto; }
    .stage-heading-row { min-width: 0; display: flex; align-items: center; gap: 8px; }
    .stage-kicker { display: inline-flex; align-items: center; height: 22px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 0 7px; font-size: 12px; color: var(--vscode-descriptionForeground); white-space: nowrap; }
    .stage-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stage-subtitle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .route-switcher { display: none; align-items: center; justify-content: center; gap: 6px; min-width: 0; }
    .route-switcher[data-visible="true"] { display: flex; }
    .route-switcher label { flex: 0 0 auto; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .route-switcher select { min-width: 0; width: min(520px, 100%); height: 26px; border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); border-radius: 4px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); padding: 0 8px; }
    .session-badge { display: none; align-items: center; min-width: 0; width: fit-content; max-width: 100%; height: 22px; border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border)); border-radius: 4px; padding: 0 7px; color: var(--vscode-inputValidation-warningForeground, var(--vscode-descriptionForeground)); background: var(--vscode-inputValidation-warningBackground, var(--vscode-editor-background)); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-badge[data-visible="true"] { display: inline-flex; }
    .stage-actions { display: flex; align-items: center; gap: 6px; pointer-events: auto; }
    .stage-actions button { min-width: 30px; width: 30px; padding: 0; background: color-mix(in srgb, var(--vscode-editor-background) 84%, transparent); backdrop-filter: blur(10px); }
    .stage-actions button[data-active="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .stage-content { flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; align-items: stretch; justify-items: center; gap: 18px; padding: 48px 28px 32px; box-sizing: border-box; }
    .stage-visual { min-width: 0; width: min(100%, 980px); min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .stage-visual img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; box-shadow: 0 18px 70px rgba(0, 0, 0, 0.24); }
    .stage-media-slot { width: min(100%, 980px); height: min(100%, 62vh); min-height: 220px; display: flex; align-items: stretch; justify-content: center; }
    .neko-preview-media-player { width: 100%; min-height: 220px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 8px; color: var(--vscode-foreground); }
    .neko-preview-media-title { color: var(--vscode-descriptionForeground); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .neko-preview-media-viewport { position: relative; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 6px; background: #000; box-shadow: 0 18px 70px rgba(0, 0, 0, 0.24); }
    .neko-preview-video-surface { width: 100%; height: 100%; display: block; object-fit: contain; }
    .neko-preview-media-poster { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0.42; pointer-events: none; }
    .neko-preview-media-player[data-state="playing"] .neko-preview-media-poster { display: none; }
    .neko-preview-media-message { position: absolute; inset: auto 12px 12px; color: rgba(255,255,255,0.82); font-size: 12px; text-align: center; pointer-events: none; }
    .neko-preview-media-player[data-state="playing"] .neko-preview-media-message:empty { display: none; }
    .neko-preview-audio-visualization { width: min(620px, 84%); height: 130px; display: flex; align-items: end; justify-content: center; gap: 4px; }
    .neko-preview-audio-visualization span { width: 7px; height: var(--bar-height); border-radius: 3px 3px 0 0; background: var(--vscode-progressBar-background, var(--vscode-focusBorder)); opacity: 0.72; transform-origin: bottom; animation: neko-preview-audio-bar 0.8s ease-in-out infinite; animation-delay: var(--bar-delay); }
    .neko-preview-media-player[data-state="error"] .neko-preview-audio-visualization span,
    .neko-preview-media-player[data-state="loading"] .neko-preview-audio-visualization span { animation-play-state: paused; opacity: 0.32; }
    .neko-preview-media-controls { display: grid; grid-template-columns: auto minmax(80px, 1fr) auto; align-items: center; gap: 8px; }
    .neko-preview-media-controls button { min-width: 54px; }
    .neko-preview-media-progress { width: 100%; accent-color: var(--vscode-progressBar-background, var(--vscode-focusBorder)); }
    .neko-preview-media-time { color: var(--vscode-descriptionForeground); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    @keyframes neko-preview-audio-bar { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.42); } }
    .stage-unavailable { width: min(720px, 100%); border: 1px dashed var(--vscode-panel-border); border-radius: 6px; padding: 22px; box-sizing: border-box; display: grid; gap: 8px; text-align: center; background: color-mix(in srgb, var(--vscode-sideBar-background) 78%, transparent); }
    .stage-copy { width: min(820px, 100%); display: grid; gap: 10px; }
    .unit-body { max-height: 26vh; overflow: auto; white-space: pre-wrap; color: var(--vscode-foreground); font-size: 15px; line-height: 1.65; }
    .stage-details { display: flex; flex-wrap: wrap; gap: 6px; }
    .stage-detail { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 5px 7px; font-size: 12px; color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
    .player-controls { flex: 0 0 auto; display: grid; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--vscode-panel-border); background: color-mix(in srgb, var(--vscode-editor-background) 94%, black); box-sizing: border-box; }
    .player-controls > .route-switcher { justify-self: center; width: min(720px, 100%); }
    .player-controls > .route-switcher label { white-space: nowrap; }
    .player-controls > .route-switcher select { flex: 1 1 auto; }
    .branch-choices { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
    .branch-choices:empty { display: none; }
    .branch-choices button { max-width: min(360px, 100%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timeline-wrap { display: grid; gap: 5px; }
    .segmented-timeline { display: flex; gap: 3px; width: 100%; height: 12px; }
    .stage-segment { position: relative; min-width: 14px; flex: 1 1 0; overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 3px; background: var(--vscode-button-secondaryBackground); padding: 0; height: 12px; }
    .stage-segment:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .stage-segment[data-active="true"] { border-color: var(--vscode-focusBorder); }
    .stage-segment[data-done="true"] { border-color: color-mix(in srgb, var(--vscode-focusBorder) 70%, var(--vscode-panel-border)); }
    .stage-segment-fill { position: absolute; inset: 0 auto 0 0; width: 0%; background: var(--vscode-progressBar-background, var(--vscode-focusBorder)); pointer-events: none; }
    .timeline-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--vscode-descriptionForeground); font-size: 12px; font-variant-numeric: tabular-nums; }
    .transport-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; }
    .playback-controls { display: flex; align-items: center; justify-content: center; gap: 8px; }
    .playback-controls button { min-width: 34px; }
    .progress { justify-self: start; min-width: 54px; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
    .playback-clock { justify-self: end; display: flex; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
    .playback-inspector { position: absolute; z-index: 6; top: 56px; right: 12px; bottom: 92px; width: min(360px, calc(100% - 24px)); display: grid; grid-template-rows: auto 1fr; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-sideBar-background); box-shadow: 0 18px 58px rgba(0, 0, 0, 0.28); transform: translateX(calc(100% + 24px)); opacity: 0; pointer-events: none; transition: transform 150ms ease, opacity 150ms ease; }
    .playback-inspector[data-open="true"] { transform: translateX(0); opacity: 1; pointer-events: auto; }
    .inspector-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
    .inspector-body { min-height: 0; overflow: auto; padding: 12px; display: grid; align-content: start; gap: 14px; }
    .inspector-section { display: none; }
    .playback-inspector[data-section="info"] .inspector-info,
    .playback-inspector[data-section="branches"] .inspector-branches,
    .playback-inspector[data-section="diagnostics"] .inspector-diagnostics { display: grid; gap: 8px; }
    .unit-meta { display: grid; gap: 6px; }
    .meta-item { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
    .branch-meta { display: grid; gap: 6px; }
    .branch-item { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
    .diagnostics { display: grid; gap: 6px; }
    .diagnostics:empty { display: none; }
    .diagnostic { border-left: 3px solid var(--vscode-editorWarning-foreground); padding: 6px 8px; background: var(--vscode-inputValidation-warningBackground, transparent); color: var(--vscode-descriptionForeground); }
    @media (max-width: 760px) {
      .stage-overlay { align-items: stretch; flex-direction: column; }
      .stage-heading { max-width: none; }
      .stage-actions { justify-content: flex-end; }
      .stage-content { padding: 76px 14px 22px; }
      .player-controls > .route-switcher { justify-content: flex-start; }
      .transport-row { grid-template-columns: 1fr; justify-items: center; }
      .progress, .playback-clock { justify-self: center; }
      .playback-inspector { top: auto; left: 12px; bottom: 94px; width: auto; max-height: min(62vh, 420px); transform: translateY(calc(100% + 24px)); }
      .playback-inspector[data-open="true"] { transform: translateY(0); }
    }
  </style>
</head>
<body>
  <main>
    <section class="placeholder" id="placeholder">
      <h1>${h(i18n.title)}</h1>
      <p id="status">${h(i18n.statusWaitingGraph)}</p>
    </section>
    <section class="playback-shell" id="playback-preview" data-visible="false">
      <div class="player-stage" id="player-stage" aria-label="${h(i18n.ariaStage)}">
        <div class="stage-overlay" aria-label="${h(i18n.ariaStageOverlay)}">
          <div class="stage-heading">
            <div class="stage-heading-row">
              <span class="stage-kicker" id="unit-kind">${h(i18n.unitFallback)}</span>
              <h1 class="stage-title" id="playback-title">${h(i18n.planCanvasPlayback)}</h1>
            </div>
            <p class="stage-subtitle" id="playback-summary"></p>
            <span class="session-badge" id="session-badge" data-visible="false" title="${h(i18n.staleSessionDescription)}">${h(i18n.staleSession)}</span>
          </div>
          <div class="stage-actions" aria-label="${h(i18n.ariaPlaybackDetails)}">
            <button type="button" id="inspector-info" title="${h(i18n.info)}" aria-label="${h(i18n.info)}">i</button>
            <button type="button" id="inspector-branches" title="${h(i18n.branches)}" aria-label="${h(i18n.branches)}">?</button>
            <button type="button" id="inspector-diagnostics" title="${h(i18n.diagnostics)}" aria-label="${h(i18n.diagnostics)}">!</button>
          </div>
        </div>

        <article class="stage-content" id="stage-content" data-kind="node" data-render-mode="select-node">
          <div class="stage-visual" id="stage-visual"></div>
          <div class="stage-copy">
            <h2 id="unit-title">${h(i18n.noUnitSelected)}</h2>
            <p class="unit-body" id="unit-body"></p>
            <div class="stage-details" id="stage-details"></div>
          </div>
        </article>

        <aside class="playback-inspector" id="playback-inspector" data-open="false" data-section="info" aria-label="${h(i18n.ariaDetails)}">
          <div class="inspector-header">
            <h3 id="inspector-title">${h(i18n.info)}</h3>
            <button type="button" id="inspector-close" title="${h(i18n.close)}" aria-label="${h(i18n.close)}">x</button>
          </div>
          <div class="inspector-body">
            <section class="inspector-section inspector-info">
              <h3>${h(i18n.info)}</h3>
              <div class="unit-meta" id="unit-meta"></div>
            </section>
            <section class="inspector-section inspector-branches">
              <h3>${h(i18n.branches)}</h3>
              <div class="branch-meta" id="unit-branch-meta"></div>
            </section>
            <section class="inspector-section inspector-diagnostics">
              <h3>${h(i18n.diagnostics)}</h3>
              <div class="diagnostics" id="unit-diagnostics"></div>
            </section>
          </div>
        </aside>
      </div>

      <footer class="player-controls" id="player-controls" aria-label="${h(i18n.ariaControls)}">
        <div class="route-switcher" id="route-switcher" data-visible="false">
          <label for="route-select">${h(i18n.route)}</label>
          <select id="route-select" title="${h(i18n.route)}" aria-label="${h(i18n.route)}"></select>
        </div>
        <div class="branch-choices" id="unit-choices"></div>
        <div class="timeline-wrap" aria-label="${h(i18n.ariaTimeline)}">
          <div class="segmented-timeline" id="segmented-timeline"></div>
          <div class="timeline-meta">
            <span id="stage-label">${h(i18n.stageZero)}</span>
            <span id="stage-time-range">0:00 - 0:00</span>
          </div>
        </div>
        <div class="transport-row">
          <span class="progress" id="preview-progress">0/0</span>
          <div class="playback-controls">
            <button type="button" id="preview-previous" title="${h(i18n.previous)}" aria-label="${h(i18n.previous)}">${h(i18n.previousShort)}</button>
            <button type="button" id="preview-play" title="${h(i18n.play)}" aria-label="${h(i18n.play)}">${h(i18n.play)}</button>
            <button type="button" id="preview-next" title="${h(i18n.next)}" aria-label="${h(i18n.next)}">${h(i18n.next)}</button>
          </div>
          <span class="playback-clock" id="playback-clock">
            <span id="current-time">0:00</span>
            <span>/</span>
            <span id="total-time">0:00</span>
          </span>
        </div>
      </footer>
    </section>
  </main>
  ${
    mediaRuntimeScriptUri
      ? `<script nonce="${nonce}" type="module" src="${h(mediaRuntimeScriptUri)}"></script>`
      : ''
  }
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const DEFAULT_TIMER_MS = 1200;
    const PREVIEW_VARIANT_TIMEOUT_MS = 5000;
    const BOOTSTRAP_MESSAGES = ${bootstrapJson};
    const I18N = ${i18nJson};
    function t(key, values) {
      const template = typeof I18N[key] === 'string' ? I18N[key] : key;
      if (!values || typeof values !== 'object') {
        return template;
      }
      return template.replace(/\\{([a-zA-Z0-9_]+)\\}/g, (_match, name) => {
        const value = values[name];
        return value === undefined || value === null ? '' : String(value);
      });
    }

    const status = document.getElementById('status');
    const placeholder = document.getElementById('placeholder');
    const playbackPreview = document.getElementById('playback-preview');
    const playbackTitle = document.getElementById('playback-title');
    const playbackSummary = document.getElementById('playback-summary');
    const sessionBadge = document.getElementById('session-badge');
    const routeSwitcher = document.getElementById('route-switcher');
    const routeSelect = document.getElementById('route-select');
    const stageContent = document.getElementById('stage-content');
    const stageVisual = document.getElementById('stage-visual');
    const stageDetails = document.getElementById('stage-details');
    const previewPrevious = document.getElementById('preview-previous');
    const previewPlay = document.getElementById('preview-play');
    const previewNext = document.getElementById('preview-next');
    const previewProgress = document.getElementById('preview-progress');
    const playbackClock = document.getElementById('playback-clock');
    const currentTime = document.getElementById('current-time');
    const totalTime = document.getElementById('total-time');
    const segmentedTimeline = document.getElementById('segmented-timeline');
    const stageLabel = document.getElementById('stage-label');
    const stageTimeRange = document.getElementById('stage-time-range');
    const unitKind = document.getElementById('unit-kind');
    const unitTitle = document.getElementById('unit-title');
    const unitBody = document.getElementById('unit-body');
    const playbackInspector = document.getElementById('playback-inspector');
    const inspectorTitle = document.getElementById('inspector-title');
    const inspectorInfo = document.getElementById('inspector-info');
    const inspectorBranches = document.getElementById('inspector-branches');
    const inspectorDiagnostics = document.getElementById('inspector-diagnostics');
    const inspectorClose = document.getElementById('inspector-close');
    const unitMeta = document.getElementById('unit-meta');
    const unitBranchMeta = document.getElementById('unit-branch-meta');
    const unitChoices = document.getElementById('unit-choices');
    const unitDiagnostics = document.getElementById('unit-diagnostics');

    let playbackPlan = null;
    let effectiveRoutes = [];
    let routeDiagnostics = [];
    let activeRouteId = null;
    let route = [];
    let activeUnitId = null;
    let branchSelections = {};
    let currentSessionId = null;
    let currentSourceCanvasUri = null;
    let currentRevision = null;
    let isSessionStale = false;
    let timer = null;
    let isPlaying = false;
    let elapsedInUnitMs = 0;
    let playbackStartedAtMs = 0;
    let playbackStartElapsedMs = 0;
    let activeMediaSurfaceId = null;
    let renderedStageKey = null;
    const pendingPreviewVariantRequests = new Map();
    const resolvedPreviewVariants = new Map();
    const failedPreviewVariantRequests = new Set();

    window.__nekoNarrativePreviewPostMessage = (message) => vscode.postMessage(message);

    previewPrevious.addEventListener('click', () => {
      stopPlayback();
      const index = getCurrentIndex();
      if (index > 0) {
        setActiveUnit(route[index - 1], false, 0);
      }
    });
    previewPlay.addEventListener('click', () => {
      if (isPlaying) {
        stopPlayback();
        renderPlaybackPlan();
        return;
      }
      if (!canPreviewAutoAdvance()) {
        return;
      }
      const unit = getCurrentUnit();
      if (!unit) {
        return;
      }
      isPlaying = true;
      playbackStartedAtMs = performance.now();
      playbackStartElapsedMs = elapsedInUnitMs;
      if (activeMediaSurfaceId) {
        window.__nekoNarrativePreviewMediaRuntime?.resume(activeMediaSurfaceId);
      }
      renderPlaybackPlan();
      scheduleNext(unit.id);
    });
    previewNext.addEventListener('click', () => {
      stopPlayback();
      const next = resolveNextStep();
      if (next) {
        route = next.route;
        setActiveUnit(next.unitId, false, 0);
      }
    });
    inspectorInfo.addEventListener('click', () => toggleInspector('info'));
    inspectorBranches.addEventListener('click', () => toggleInspector('branches'));
    inspectorDiagnostics.addEventListener('click', () => toggleInspector('diagnostics'));
    inspectorClose.addEventListener('click', () => closeInspector());
    routeSelect.addEventListener('change', () => {
      const routeId = routeSelect.value;
      if (!routeId || routeId === activeRouteId) {
        return;
      }
      switchActiveRoute(routeId);
    });

    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'media:probeResult' || message.type === 'media:streamReady') {
        window.__nekoNarrativePreviewMediaRuntime?.handleHostMessage(message);
        return;
      }
      if (message.type === 'preview:variantResolved') {
        handlePreviewVariantResolved(message);
        return;
      }
      handleCanvasPreviewMessage(message);
    });
    for (const message of BOOTSTRAP_MESSAGES) {
      handleCanvasPreviewMessage(message);
    }

    function handleCanvasPreviewMessage(message) {
      updateSessionEnvelopeState(message);
      if (message.type === 'preview:sessionStale') {
        isSessionStale = true;
        sessionBadge.dataset.visible = 'true';
        return;
      }
      if (message.type === 'preview:loadGraph' || message.type === 'preview:refresh') {
        isSessionStale = false;
        sessionBadge.dataset.visible = 'false';
        const count = Array.isArray(message.snapshot?.nodes) ? message.snapshot.nodes.length : 0;
        if (count === 0 && playbackPlan) {
          return;
        }
        if (count === 0) {
          status.textContent = t('statusLoadedZeroRuntime', { revision: message.revision });
        } else {
          status.textContent = t('statusLoadedRuntime', { revision: message.revision, count });
        }
      } else if (message.type === 'preview:loadPlaybackPlan' || message.type === 'preview:refreshPlaybackPlan') {
        const units = Array.isArray(message.plan?.units) ? message.plan.units : [];
        const diagnostics = Array.isArray(message.plan?.diagnostics) ? message.plan.diagnostics : [];
        const kinds = Array.from(new Set(units.map((unit) => unit && unit.kind).filter(Boolean)))
          .map(formatKindLabel)
          .join(', ');
        const suffix = diagnostics.length > 0
          ? t('statusDiagnostics', { diagnostics: diagnostics.map(formatDiagnosticMessage).join(' ') })
          : '';
        status.textContent = t('statusLoadedPlaybackPlan', {
          adapterId: message.plan.adapterId,
          behaviorMode: message.plan.behaviorMode,
          count: units.length,
          kindList: kinds ? ' [' + kinds + ']' : '',
        }) + suffix;
        loadPlaybackPlan(message.plan);
      } else if (message.type === 'preview:jumpTo') {
        status.textContent = t('statusJumpRequest', {
          nodeId: message.nodeId,
          revision: message.revision,
        });
        if (playbackPlan) {
          const unit = playbackPlan.units.find((candidate) => candidate.sourceNodeId === message.nodeId || candidate.id === message.nodeId);
          if (unit) {
            stopPlayback();
            const index = route.indexOf(unit.id);
            route = index >= 0 ? route.slice(0, index + 1) : [unit.id];
            setActiveUnit(unit.id, false, 0);
          }
        }
      }
    }

    function loadPlaybackPlan(plan) {
      stopPlayback();
      disposeActiveMediaSurface();
      playbackPlan = plan;
      const routeResolution = resolveEffectiveRoutes(plan);
      effectiveRoutes = routeResolution.routes;
      routeDiagnostics = routeResolution.diagnostics;
      activeRouteId = effectiveRoutes[0]?.id || null;
      branchSelections = {};
      route = buildInitialRoute(plan);
      activeUnitId = route[0] || null;
      renderedStageKey = null;
      elapsedInUnitMs = 0;
      playbackStartedAtMs = 0;
      playbackStartElapsedMs = 0;
      clearPreviewVariantState();
      placeholder.style.display = 'none';
      playbackPreview.dataset.visible = 'true';
      renderPlaybackPlan();
      postPlaybackHighlight();
    }

    function renderPlaybackPlan() {
      const unit = getCurrentUnit();
      const index = getCurrentIndex();
      const diagnostics = [
        ...(Array.isArray(playbackPlan?.diagnostics) ? playbackPlan.diagnostics : []),
        ...routeDiagnostics,
      ];
      playbackTitle.textContent = formatPlanTitle(playbackPlan);
      playbackSummary.textContent = playbackPlan
        ? playbackPlan.adapterId + ' / ' + playbackPlan.behaviorMode + ' / ' + playbackPlan.advancePolicy
        : t('summaryWaitingPlan');
      previewProgress.textContent = (index >= 0 ? index + 1 : 0) + '/' + route.length;
      renderPlaybackTime(unit, index);
      previewPrevious.disabled = index <= 0;
      previewNext.disabled = !resolveNextStep();
      previewPlay.disabled = !unit || !canPreviewAutoAdvance();
      previewPlay.textContent = isPlaying ? t('pause') : t('play');
      previewPlay.setAttribute('aria-label', isPlaying ? t('pause') : t('play'));
      previewPlay.title = isPlaying ? t('pause') : t('play');
      unitKind.textContent = unit ? formatKindLabel(unit.kind) : t('unitFallback');
      stageContent.dataset.kind = unit ? unit.kind : 'node';
      stageContent.dataset.renderMode = unit ? unit.renderMode : 'select-node';
      const stageKey = unit ? unit.id + ':' + index : 'none';
      if (stageKey !== renderedStageKey) {
        renderStageContent(unit, index);
        renderedStageKey = stageKey;
      }
      renderRouteSwitcher();
      renderSegmentedTimeline();
      renderMeta(unit);
      renderChoices(unit);
      renderDiagnostics(diagnostics);
      renderInspectorActions();
    }

    function renderRouteSwitcher() {
      routeSelect.replaceChildren();
      if (!effectiveRoutes || effectiveRoutes.length <= 1) {
        routeSwitcher.dataset.visible = 'false';
        return;
      }
      routeSwitcher.dataset.visible = 'true';
      for (const candidate of effectiveRoutes) {
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = formatRouteTitle(candidate);
        routeSelect.appendChild(option);
      }
      routeSelect.value = activeRouteId || effectiveRoutes[0]?.id || '';
    }

    function renderPlaybackTime(unit, index) {
      const durationMs = unit ? resolveUnitDurationMs(unit.id) : 0;
      const boundedElapsed = clampElapsed(elapsedInUnitMs, durationMs);
      const totalMs = getRouteTotalDurationMs();
      const absoluteMs = getElapsedBeforeIndex(index) + boundedElapsed;
      currentTime.textContent = formatClockTime(absoluteMs);
      totalTime.textContent = formatClockTime(totalMs);
      stageLabel.textContent = index >= 0
        ? t('stagePosition', { index: index + 1, total: route.length })
        : t('stageZero');
      const stageStart = getElapsedBeforeIndex(index);
      stageTimeRange.textContent = index >= 0
        ? formatClockTime(stageStart) + ' - ' + formatClockTime(stageStart + durationMs)
        : '0:00 - 0:00';
      playbackClock.title = formatClockTime(absoluteMs) + ' / ' + formatClockTime(totalMs);
    }

    function renderSegmentedTimeline() {
      segmentedTimeline.replaceChildren();
      if (!playbackPlan || route.length === 0) {
        return;
      }
      const currentIndex = getCurrentIndex();
      route.forEach((unitId, index) => {
        const unit = playbackPlan.units.find((candidate) => candidate.id === unitId);
        if (!unit) {
          return;
        }
        const segment = document.createElement('button');
        segment.type = 'button';
        segment.className = 'stage-segment';
        segment.dataset.active = index === currentIndex ? 'true' : 'false';
        segment.dataset.done = index < currentIndex ? 'true' : 'false';
        segment.title = formatUnitTitle(unit, index) + ' · ' + formatDuration(resolveUnitDurationMs(unit.id));
        const fill = document.createElement('span');
        fill.className = 'stage-segment-fill';
        if (index < currentIndex) {
          fill.style.width = '100%';
        } else if (index === currentIndex) {
          const durationMs = resolveUnitDurationMs(unit.id);
          fill.style.width = durationMs > 0 ? Math.min(100, (elapsedInUnitMs / durationMs) * 100) + '%' : '0%';
        }
        segment.appendChild(fill);
        segment.addEventListener('click', () => {
          stopPlayback();
          setActiveUnit(unit.id, false, 0);
        });
        segmentedTimeline.appendChild(segment);
      });
    }

    function renderStageContent(unit, index) {
      const nextMediaSurfaceId = unit ? createMediaSurfaceId(unit) : null;
      if (activeMediaSurfaceId && activeMediaSurfaceId !== nextMediaSurfaceId) {
        disposeActiveMediaSurface();
      }
      stageVisual.replaceChildren();
      stageDetails.replaceChildren();
      unitTitle.textContent = unit ? formatUnitTitle(unit, index) : t('noPlayableUnit');
      unitBody.textContent = unit ? formatUnitBody(unit) : t('noPlayableUnitDescription');
      if (!unit) {
        appendStageUnavailable(t('noPlayableUnit'), t('noPlayableUnitDescription'));
        return;
      }

      const metadata = getMetadata(unit);
      const visual = resolveStageVisual(unit, metadata);
      if (visual) {
        appendStageVisual(visual, unit);
      } else if (requestStageImageVariant(unit, metadata)) {
        appendStageUnavailable(t('storyboardShot'), t('mediaLoading'));
      } else if (unit.kind === 'media' || unit.renderMode === 'media-playback') {
        appendStageUnavailable(t('mediaUnavailable'), t('mediaUnavailableDescription'));
      } else if (unit.kind === 'shot') {
        appendStageUnavailable(t('storyboardShot'), t('storyboardShotUnavailableDescription'));
      } else if (unit.kind === 'scene') {
        appendStageUnavailable(t('storyboardScene'), t('storyboardSceneDescription'));
      } else {
        appendStageUnavailable(t('canvasNode'), t('canvasNodeDescription'));
      }

      appendStageDetail(t('labelMode'), unit.renderMode);
      appendStageDetail(t('labelDuration'), formatDuration(resolveUnitDurationMs(unit.id)));
      if (unit.assetPath) {
        appendStageDetail(t('labelAsset'), unit.assetPath);
      }
      if (unit.kind === 'shot') {
        appendStageDetail(t('labelShot'), metadata.shotNumber);
        appendStageDetail(t('labelPreviewSource'), formatPreviewSourceKind(metadata.previewSourceKind));
        appendStageDetail(t('labelScale'), metadata.shotScale);
        appendStageDetail(t('labelAction'), metadata.characterAction);
        appendStageDetail(t('labelDialogue'), metadata.dialogue);
        appendStageDetail(t('labelMediaRefs'), summarizeStoryboardMediaRefs(metadata));
      } else if (unit.kind === 'scene') {
        appendStageDetail(t('labelScene'), metadata.sceneNumber);
        appendStageDetail(t('labelLocation'), metadata.location);
        appendStageDetail(t('labelTime'), metadata.timeOfDay);
      } else if (unit.kind === 'media') {
        appendStageDetail(t('labelMedia'), metadata.mediaType);
        appendStageDetail(t('labelMime'), metadata.mimeType);
      }
    }

    function resolveStageVisual(unit, metadata) {
      const safeVisualSource =
        readString(metadata.previewUrl) ||
        readString(metadata.posterUrl) ||
        readString(metadata.thumbnailUrl);
      const playbackSource =
        readString(metadata.previewPlayableAssetPath) ||
        unit.assetPath ||
        readString(metadata.generatedImage) ||
        readNestedString(metadata.generatedAsset, ['url', 'sourcePath', 'previewUrl', 'dataUrl', 'path', 'assetPath']) ||
        readNestedString(metadata.generatedVideoAsset, ['url', 'sourcePath', 'previewUrl', 'dataUrl', 'path', 'assetPath']) ||
        readString(metadata.assetPath);
      const displaySource = safeVisualSource && isSafePreviewSource(safeVisualSource) ? safeVisualSource : undefined;
      const playableSource = playbackSource || displaySource;
      if (!displaySource && !playableSource && !unit.resourceRef) {
        return undefined;
      }
      const mediaType =
        readString(metadata.previewMediaType) ||
        readString(metadata.mediaType) ||
        inferMediaType(playableSource || displaySource || '');
      if (mediaType === 'audio') {
        return {
          type: 'audio',
          source: playableSource,
          posterUrl: displaySource,
          resourceRef: unit.resourceRef,
        };
      }
      if (mediaType === 'video') {
        return {
          type: 'video',
          source: playableSource,
          posterUrl: displaySource,
          resourceRef: unit.resourceRef,
        };
      }
      if ((mediaType === 'image' || unit.kind === 'shot') && displaySource) {
        return { type: 'image', source: displaySource };
      }
      return undefined;
    }

    function appendStageVisual(visual, unit) {
      if (visual.type === 'image') {
        const image = document.createElement('img');
        image.src = visual.source;
        image.alt = t('playbackPreviewAlt');
        stageVisual.appendChild(image);
        return;
      }
      if (visual.type === 'video' || visual.type === 'audio') {
        appendMediaPlaybackSurface(visual, unit);
      }
    }

    function requestStageImageVariant(unit, metadata) {
      const request = createStageImageVariantRequest(unit, metadata);
      if (!request) {
        return false;
      }
      const cached = resolvedPreviewVariants.get(request.cacheKey);
      if (cached) {
        appendStageVisual({ type: 'image', source: cached }, unit);
        return true;
      }
      if (failedPreviewVariantRequests.has(request.cacheKey)) {
        return false;
      }
      if (pendingPreviewVariantRequests.has(request.cacheKey)) {
        return true;
      }
      const timeoutId = window.setTimeout(() => {
        const pending = pendingPreviewVariantRequests.get(request.cacheKey);
        if (!pending || pending.requestId !== request.requestId) {
          return;
        }
        pendingPreviewVariantRequests.delete(request.cacheKey);
        failedPreviewVariantRequests.add(request.cacheKey);
        if (getCurrentUnit()?.id === pending.unitId) {
          renderedStageKey = null;
          renderPlaybackPlan();
        }
      }, PREVIEW_VARIANT_TIMEOUT_MS);
      pendingPreviewVariantRequests.set(request.cacheKey, {
        unitId: unit.id,
        requestId: request.requestId,
        timeoutId,
      });
      vscode.postMessage({
        type: 'preview:resolveVariant',
        requestId: request.requestId,
        sessionId: currentSessionId,
        sourceCanvasUri: currentSourceCanvasUri,
        revision: currentRevision,
        sourceId: unit.id,
        role: 'thumbnail',
        mediaType: 'image',
        ...(request.assetPath ? { assetPath: request.assetPath } : {}),
        ...(request.documentResourceRef ? { documentResourceRef: request.documentResourceRef } : {}),
        ...(request.resourceRef ? { resourceRef: request.resourceRef } : {}),
      });
      return true;
    }

    function handlePreviewVariantResolved(message) {
      const requestId = readString(message.requestId);
      if (!requestId) {
        return;
      }
      const cacheKey = requestId.replace(/^canvas-playback-preview:variant:/, '');
      const pending = pendingPreviewVariantRequests.get(cacheKey);
      if (!pending) {
        return;
      }
      if (pending.requestId !== requestId) {
        return;
      }
      pendingPreviewVariantRequests.delete(cacheKey);
      window.clearTimeout(pending.timeoutId);
      const url = readString(message.url);
      if (url && isSafePreviewSource(url)) {
        resolvedPreviewVariants.set(cacheKey, url);
      } else {
        failedPreviewVariantRequests.add(cacheKey);
      }
      if (getCurrentUnit()?.id === pending.unitId) {
        renderedStageKey = null;
        renderPlaybackPlan();
      }
    }

    function clearPreviewVariantState() {
      for (const pending of pendingPreviewVariantRequests.values()) {
        window.clearTimeout(pending.timeoutId);
      }
      pendingPreviewVariantRequests.clear();
      resolvedPreviewVariants.clear();
      failedPreviewVariantRequests.clear();
    }

    function createStageImageVariantRequest(unit, metadata) {
      if (!unit || unit.kind !== 'shot') {
        return undefined;
      }
      const source =
        readCanvasPreviewSourceCandidate({
          assetPath: metadata.previewSourceAssetPath,
          resourceRef: metadata.previewSourceResourceRef,
          documentResourceRef: metadata.previewSourceDocumentResourceRef,
        }) ||
        readSelectedGenerationPreviewSource(metadata) ||
        readCanvasPreviewSourceCandidate(metadata.generatedImage) ||
        readCanvasPreviewSourceCandidate(metadata.generatedAsset) ||
        readFirstStoryboardMediaRefPreviewSource([
          ...readArray(metadata.generatedMediaRefs),
          ...readArray(metadata.shotImagePrepPlan?.outputMediaRefs),
        ]) ||
        readCanvasPreviewSourceCandidate(metadata.runtimeReferenceImagePath) ||
        readCanvasPreviewSourceCandidate(metadata.referenceResourceRef) ||
        readCanvasPreviewSourceCandidate(metadata.referenceImageResourceRef) ||
        readCanvasPreviewSourceCandidate(metadata.referenceImagePath) ||
        readFirstStoryboardMediaRefPreviewSource([
          ...readArray(metadata.sourceMediaRefs),
          ...readArray(metadata.mediaRefs),
        ]);
      if (!source) {
        return undefined;
      }
      const cacheKey = [
        unit.id,
        source.assetPath || '',
        stableStringify(source.documentResourceRef),
        stableStringify(source.resourceRef),
      ].join('|');
      return {
        ...source,
        cacheKey,
        requestId: 'canvas-playback-preview:variant:' + cacheKey,
      };
    }

    function readSelectedGenerationPreviewSource(metadata) {
      const history = readArray(metadata.generationHistory);
      const selected = history.find((candidate) =>
        candidate && typeof candidate === 'object' && !Array.isArray(candidate) && candidate.selected === true
      );
      return readCanvasPreviewSourceCandidate(selected);
    }

    function readFirstStoryboardMediaRefPreviewSource(refs) {
      for (const ref of refs) {
        const source = readCanvasPreviewSourceCandidate(ref) ||
          readCanvasPreviewSourceCandidate(ref && typeof ref === 'object' ? ref.locator : undefined);
        if (source) {
          return source;
        }
      }
      return undefined;
    }

    function readCanvasPreviewSourceCandidate(value) {
      const direct = readString(value);
      if (direct) {
        return { assetPath: direct };
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
      }
      const directResourceRef = readResourceLike(value);
      const directDocumentResourceRef = readDocumentResourceLike(value);
      if (directResourceRef || directDocumentResourceRef) {
        const legacyCachePath = directResourceRef
          ? readFirstString(directResourceRef.source?.metadata || {}, ['legacyCachePath'])
          : undefined;
        return {
          ...(legacyCachePath ? { assetPath: legacyCachePath } : {}),
          ...(directResourceRef ? { resourceRef: directResourceRef } : {}),
          ...(directDocumentResourceRef ? { documentResourceRef: directDocumentResourceRef } : {}),
        };
      }
      const metadata = value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata)
        ? value.metadata
        : undefined;
      const assetRef = value.assetRef && typeof value.assetRef === 'object' && !Array.isArray(value.assetRef)
        ? value.assetRef
        : undefined;
      const resourceRef =
        readResourceLike(value.resourceRef) ||
        readResourceLike(value.cacheResourceRef) ||
        readResourceLike(assetRef?.resourceRef) ||
        readResourceLike(assetRef?.cacheResourceRef) ||
        readResourceLike(metadata?.resourceRef) ||
        readResourceLike(metadata?.cacheResourceRef);
      const documentResourceRef =
        readDocumentResourceLike(value.documentResourceRef) ||
        readDocumentResourceLike(value.referenceImageResourceRef) ||
        readDocumentResourceLike(value.resourceRef) ||
        readDocumentResourceLike(assetRef?.documentResourceRef) ||
        readDocumentResourceLike(metadata?.documentResourceRef) ||
        readDocumentResourceLike(metadata?.referenceImageResourceRef) ||
        readDocumentResourceLike(metadata?.resourceRef);
      const assetPath =
        readFirstString(value, ['dataUrl', 'sourcePath', 'localPath', 'path', 'assetPath', 'uri', 'filePath', 'previewUrl', 'url', 'src']) ||
        readFirstString(assetRef || {}, ['dataUrl', 'sourcePath', 'localPath', 'path', 'assetPath', 'uri', 'filePath', 'previewUrl', 'url', 'src']) ||
        readFirstString(metadata || {}, ['legacyCachePath']);
      return assetPath || resourceRef || documentResourceRef
        ? {
            ...(assetPath ? { assetPath } : {}),
            ...(resourceRef ? { resourceRef } : {}),
            ...(documentResourceRef ? { documentResourceRef } : {}),
          }
        : undefined;
    }

    function readResourceLike(value) {
      return value && typeof value === 'object' && !Array.isArray(value) && typeof value.id === 'string'
        ? value
        : undefined;
    }

    function readDocumentResourceLike(value) {
      return value && typeof value === 'object' && !Array.isArray(value) && value.kind === 'document-entry' && (
        value.source !== undefined ||
        value.cachePath !== undefined ||
        value.entryPath !== undefined ||
        value.locator !== undefined
      )
        ? value
        : undefined;
    }

    function stableStringify(value) {
      if (!value || typeof value !== 'object') {
        return '';
      }
      try {
        return JSON.stringify(value, Object.keys(value).sort());
      } catch {
        return '';
      }
    }

    function appendMediaPlaybackSurface(visual, unit) {
      const surfaceId = createMediaSurfaceId(unit);
      activeMediaSurfaceId = surfaceId;
      const slot = document.createElement('div');
      slot.className = 'stage-media-slot';
      stageVisual.appendChild(slot);
      const metadata = getMetadata(unit);
      const label = formatUnitTitle(unit, getCurrentIndex());
      const durationMs = resolveUnitDurationMs(unit.id);
      ensureMediaRuntime(() => {
        const runtime = window.__nekoNarrativePreviewMediaRuntime;
        runtime.mount({
          surfaceId,
          container: slot,
          mediaType: visual.type,
          label,
          startTime: elapsedInUnitMs / 1000,
          duration: durationMs / 1000,
          posterUrl: visual.posterUrl,
          labels: {
            play: t('play'),
            pause: t('pause'),
            loading: t('mediaLoading'),
            preparing: t('mediaPreparing'),
          },
        });
        runtime.start({
          surfaceId,
          assetPath:
            readString(metadata.previewPlayableAssetPath) ||
            visual.source ||
            unit.assetPath ||
            readString(metadata.assetPath),
          resourceRef: visual.resourceRef || unit.resourceRef,
          documentResourceRef: metadata.previewSourceDocumentResourceRef,
          mediaType: visual.type,
          startTime: elapsedInUnitMs / 1000,
          autoPlay: isPlaying,
        });
      });
    }

    function ensureMediaRuntime(callback) {
      if (window.__nekoNarrativePreviewMediaRuntime) {
        callback();
        return;
      }
      window.setTimeout(() => ensureMediaRuntime(callback), 25);
    }

    function createMediaSurfaceId(unit) {
      return unit ? 'preview-media:' + unit.id : null;
    }

    function disposeActiveMediaSurface() {
      if (!activeMediaSurfaceId) {
        return;
      }
      window.__nekoNarrativePreviewMediaRuntime?.dispose(activeMediaSurfaceId);
      activeMediaSurfaceId = null;
    }

    function appendStageUnavailable(title, description) {
      const box = document.createElement('div');
      box.className = 'stage-unavailable';
      const heading = document.createElement('h2');
      heading.textContent = title;
      const text = document.createElement('p');
      text.textContent = description;
      box.append(heading, text);
      stageVisual.appendChild(box);
    }

    function appendStageDetail(label, value) {
      if (value === undefined || value === null || value === '') {
        return;
      }
      const detail = document.createElement('span');
      detail.className = 'stage-detail';
      detail.textContent = label + ': ' + formatValue(value);
      stageDetails.appendChild(detail);
    }

    function renderMeta(unit) {
      unitMeta.replaceChildren();
      if (!unit) {
        return;
      }
      appendMeta(t('labelSourceNode'), unit.sourceNodeId);
      appendMeta(t('labelRenderMode'), unit.renderMode);
      appendMeta(t('labelDuration'), formatDuration(unit.durationMs));
      if (unit.assetPath) {
        appendMeta(t('labelAsset'), unit.assetPath);
      }
      if (unit.resourceRef) {
        appendMeta(t('labelResource'), JSON.stringify(unit.resourceRef));
      }
      const metadata = getMetadata(unit);
      if (unit.kind === 'shot') {
        appendMetaField(metadata, t('labelShot'), 'shotNumber');
        appendMetaValue(t('labelPreviewSource'), formatPreviewSourceKind(metadata.previewSourceKind));
        appendMetaField(metadata, t('labelScale'), 'shotScale');
        appendMetaField(metadata, t('labelCamera'), 'cameraMovement');
        appendMetaField(metadata, t('labelAngle'), 'cameraAngle');
        appendMetaField(metadata, t('labelAction'), 'characterAction');
        appendMetaField(metadata, t('labelDialogue'), 'dialogue');
        appendMetaField(metadata, t('labelVoice'), 'voiceOver');
        appendMetaField(metadata, t('labelSound'), 'soundCue');
        appendMetaField(metadata, t('labelStatus'), 'generationStatus');
        appendMetaValue(t('labelCharacters'), summarizeCharacters(metadata.characters));
        appendMetaValue(t('labelMediaRefs'), summarizeStoryboardMediaRefs(metadata));
        appendMetaValue(t('labelImageAsset'), readNestedString(metadata.generatedAsset, ['path', 'assetPath', 'id']) || readString(metadata.generatedImage));
        appendMetaValue(t('labelVideoAsset'), readNestedString(metadata.generatedVideoAsset, ['path', 'assetPath', 'id']) || readString(metadata.generatedVideo));
      } else if (unit.kind === 'scene') {
        appendMetaField(metadata, t('labelScene'), 'sceneNumber');
        appendMetaField(metadata, t('labelLocation'), 'location');
        appendMetaField(metadata, t('labelTime'), 'timeOfDay');
        appendMetaField(metadata, t('labelScript'), 'sourceScriptUri');
      } else if (unit.kind === 'media') {
        appendMetaField(metadata, t('labelMediaType'), 'mediaType');
        appendMetaField(metadata, t('labelAssetPath'), 'assetPath');
        appendMetaField(metadata, t('labelDuration'), 'duration');
        appendMetaField(metadata, t('labelMime'), 'mimeType');
      } else {
        appendMetaField(metadata, t('labelScript'), 'scriptPath');
        appendMetaField(metadata, t('labelDocument'), 'docPath');
        appendMetaField(metadata, t('labelProject'), 'projectPath');
        appendMetaValue(t('labelScenes'), summarizeArray(metadata.scenes));
      }
    }

    function appendMeta(label, value) {
      if (value === undefined || value === null || value === '') {
        return;
      }
      const item = document.createElement('div');
      item.className = 'meta-item';
      item.textContent = label + ': ' + formatValue(value);
      unitMeta.appendChild(item);
    }

    function appendMetaField(metadata, label, field) {
      appendMeta(label, metadata[field]);
    }

    function appendMetaValue(label, value) {
      appendMeta(label, value);
    }

    function formatPreviewSourceKind(value) {
      switch (readString(value)) {
        case 'generated-image':
          return t('previewSourceGeneratedImage');
        case 'generated-media':
          return t('previewSourceGeneratedMedia');
        case 'reference-image':
          return t('previewSourceReferenceImage');
        case 'source-media':
          return t('previewSourceSourceMedia');
        case 'media-asset':
          return t('previewSourceMediaAsset');
        default:
          return undefined;
      }
    }

    function summarizeStoryboardMediaRefs(metadata) {
      const refs = [
        ...readArray(metadata.generatedMediaRefs),
        ...readArray(metadata.shotImagePrepPlan?.outputMediaRefs),
        ...readArray(metadata.sourceMediaRefs),
        ...readArray(metadata.mediaRefs),
      ];
      if (refs.length === 0) {
        return undefined;
      }
      const labels = refs
        .map((ref) => summarizeStoryboardMediaRef(ref))
        .filter(Boolean)
        .slice(0, 3);
      const suffix = refs.length > labels.length ? ' +' + (refs.length - labels.length) : '';
      return labels.length > 0 ? labels.join(', ') + suffix : summarizeCount(refs);
    }

    function summarizeStoryboardMediaRef(ref) {
      if (!ref || typeof ref !== 'object') {
        return undefined;
      }
      const label = readString(ref.label);
      const refId = readString(ref.refId);
      const role = readString(ref.role);
      const locator = ref.locator && typeof ref.locator === 'object' ? ref.locator : undefined;
      const locatorType = locator ? readString(locator.type) : undefined;
      const source =
        readString(locator?.path) ||
        readString(locator?.uri) ||
        readString(locator?.assetId) ||
        readString(locator?.toolCallId) ||
        readString(locator?.canvasNodeId) ||
        readString(locator?.storyId);
      const name = label || refId || source || locatorType;
      return [role, name].filter(Boolean).join(': ');
    }

    function readArray(value) {
      return Array.isArray(value) ? value : [];
    }

    function renderChoices(unit) {
      unitChoices.replaceChildren();
      unitBranchMeta.replaceChildren();
      if (!unit) {
        return;
      }
      const choices = getOutgoingTransitions(unit.id);
      for (const choice of choices) {
        const item = document.createElement('div');
        item.className = 'branch-item';
        item.textContent = t('choiceTransition', {
          label: formatChoiceLabel(choice),
          targetUnitId: choice.targetUnitId,
        });
        unitBranchMeta.appendChild(item);
      }
      if (choices.length <= 1) {
        return;
      }
      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = formatChoiceLabel(choice);
        button.title = button.textContent;
        button.addEventListener('click', () => {
          stopPlayback();
          const sourceUnit = getCurrentUnit();
          if (sourceUnit) {
            branchSelections = { ...branchSelections, [sourceUnit.id]: choice.id };
          }
          route = appendTargetToRoute(route, getCurrentIndex(), activeUnitId, choice.targetUnitId);
          setActiveUnit(choice.targetUnitId, false, 0);
          if (sourceUnit) {
            postMessage({
              type: 'canvas:choiceMade',
              requestId: createRequestId('choice'),
              fromNodeId: sourceUnit.sourceNodeId,
              toNodeId: getCurrentUnit()?.sourceNodeId || choice.targetUnitId,
            });
          }
        });
        unitChoices.appendChild(button);
      }
    }

    function renderDiagnostics(diagnostics) {
      unitDiagnostics.replaceChildren();
      for (const diagnostic of diagnostics) {
        const item = document.createElement('div');
        item.className = 'diagnostic';
        item.textContent = formatDiagnosticMessage(diagnostic);
        unitDiagnostics.appendChild(item);
      }
    }

    function renderInspectorActions() {
      const diagnostics = Array.isArray(playbackPlan?.diagnostics) ? playbackPlan.diagnostics : [];
      const unit = getCurrentUnit();
      const choices = unit ? getOutgoingTransitions(unit.id) : [];
      inspectorInfo.dataset.active = playbackInspector.dataset.open === 'true' && playbackInspector.dataset.section === 'info' ? 'true' : 'false';
      inspectorBranches.dataset.active = playbackInspector.dataset.open === 'true' && playbackInspector.dataset.section === 'branches' ? 'true' : 'false';
      inspectorDiagnostics.dataset.active = playbackInspector.dataset.open === 'true' && playbackInspector.dataset.section === 'diagnostics' ? 'true' : 'false';
      inspectorBranches.disabled = choices.length === 0;
      inspectorDiagnostics.disabled = diagnostics.length === 0;
      inspectorBranches.title = choices.length > 0 ? t('branches') : t('noBranches');
      inspectorDiagnostics.title = diagnostics.length > 0 ? t('diagnostics') : t('noDiagnostics');
    }

    function toggleInspector(section) {
      if (playbackInspector.dataset.open === 'true' && playbackInspector.dataset.section === section) {
        closeInspector();
        return;
      }
      playbackInspector.dataset.open = 'true';
      playbackInspector.dataset.section = section;
      inspectorTitle.textContent = section === 'branches'
        ? t('branches')
        : section === 'diagnostics'
          ? t('diagnostics')
          : t('info');
      renderInspectorActions();
    }

    function closeInspector() {
      playbackInspector.dataset.open = 'false';
      renderInspectorActions();
    }

    function setActiveUnit(unitId, keepPlaying, nextElapsedMs) {
      activeUnitId = unitId;
      elapsedInUnitMs = typeof nextElapsedMs === 'number' ? nextElapsedMs : elapsedInUnitMs;
      if (!keepPlaying) {
        isPlaying = false;
      }
      renderPlaybackPlan();
      postPlaybackHighlight();
    }

    function scheduleNext(currentUnitId) {
      clearTimer();
      timer = window.setTimeout(() => {
        timer = null;
        if (!isPlaying || currentUnitId !== activeUnitId) {
          return;
        }
        const durationMs = resolveUnitDurationMs(currentUnitId);
        elapsedInUnitMs = clampElapsed(
          playbackStartElapsedMs + (performance.now() - playbackStartedAtMs),
          durationMs,
        );
        renderPlaybackPlan();
        if (elapsedInUnitMs < durationMs) {
          scheduleNext(currentUnitId);
          return;
        }
        const next = resolveNextStep();
        if (!next) {
          isPlaying = false;
          renderPlaybackPlan();
          return;
        }
        route = next.route;
        activeUnitId = next.unitId;
        elapsedInUnitMs = 0;
        playbackStartedAtMs = performance.now();
        playbackStartElapsedMs = 0;
        renderPlaybackPlan();
        postPlaybackHighlight();
        if (isPlaying) {
          scheduleNext(next.unitId);
        }
      }, 100);
    }

    function stopPlayback() {
      if (isPlaying && activeUnitId) {
        elapsedInUnitMs = clampElapsed(
          playbackStartElapsedMs + (performance.now() - playbackStartedAtMs),
          resolveUnitDurationMs(activeUnitId),
        );
      }
      isPlaying = false;
      if (activeMediaSurfaceId) {
        window.__nekoNarrativePreviewMediaRuntime?.pause(activeMediaSurfaceId);
      }
      clearTimer();
    }

    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function getCurrentUnit() {
      if (!playbackPlan || !activeUnitId) {
        return null;
      }
      return playbackPlan.units.find((unit) => unit.id === activeUnitId) || null;
    }

    function getCurrentIndex() {
      return activeUnitId ? route.indexOf(activeUnitId) : -1;
    }

    function switchActiveRoute(routeId) {
      const candidate = effectiveRoutes.find((item) => item.id === routeId);
      if (!candidate) {
        return;
      }
      stopPlayback();
      disposeActiveMediaSurface();
      activeRouteId = candidate.id;
      branchSelections = {};
      route = buildRouteFromCandidate(playbackPlan, candidate);
      activeUnitId = route[0] || null;
      renderedStageKey = null;
      elapsedInUnitMs = 0;
      playbackStartedAtMs = 0;
      playbackStartElapsedMs = 0;
      renderPlaybackPlan();
      postPlaybackHighlight();
    }

    function buildInitialRoute(plan) {
      const activeRoute = effectiveRoutes.find((candidate) => candidate.id === activeRouteId) || effectiveRoutes[0];
      if (activeRoute) {
        return buildRouteFromCandidate(plan, activeRoute);
      }
      return [];
    }

    function buildRouteFromCandidate(plan, candidate) {
      if (!candidate || !Array.isArray(candidate.unitIds) || candidate.unitIds.length === 0) {
        return [];
      }
      const units = new Set((plan?.units || []).map((unit) => unit.id));
      const routeIds = candidate.unitIds.filter((unitId) => units.has(unitId));
      if (plan?.behaviorMode === 'interactive') {
        return routeIds[0] ? [routeIds[0]] : [];
      }
      return routeIds;
    }

    function resolveEffectiveRoutes(plan) {
      if (!plan) {
        return { routes: [], diagnostics: [] };
      }
      if (Array.isArray(plan.routeCandidates)) {
        if (plan.routeCandidates.length === 0) {
          return {
            routes: [],
            diagnostics: [{
              code: 'playback-missing-route',
              severity: 'warning',
              message: t('missingRouteCandidates'),
            }],
          };
        }
        return {
          routes: normalizeRouteCandidates(plan.routeCandidates, plan),
          diagnostics: [],
        };
      }
      return {
        routes: [],
        diagnostics: [{
          code: 'playback-missing-route',
          severity: 'warning',
          message: t('missingRouteEntry'),
        }],
      };
    }

    function normalizeRouteCandidates(candidates, plan) {
      const unitIds = new Set((plan.units || []).map((unit) => unit.id));
      return candidates
        .filter((candidate) => candidate && typeof candidate.id === 'string' && typeof candidate.entryUnitId === 'string')
        .map((candidate) => ({
          ...candidate,
          unitIds: Array.isArray(candidate.unitIds)
            ? candidate.unitIds.filter((unitId) => unitIds.has(unitId))
            : [],
        }))
        .filter((candidate) => candidate.unitIds.length > 0 && unitIds.has(candidate.entryUnitId));
    }

    function resolveNextStep() {
      if (!playbackPlan || !activeUnitId) {
        return null;
      }
      const index = getCurrentIndex();
      if (index < 0) {
        return null;
      }
      const existingNext = route[index + 1];
      if (existingNext) {
        return { unitId: existingNext, route };
      }
      const transitions = getOutgoingTransitions(activeUnitId).filter((transition) => route.indexOf(transition.targetUnitId) === -1);
      if (playbackPlan.behaviorMode === 'interactive' && transitions.length > 1) {
        return null;
      }
      const transition = transitions[0];
      if (!transition) {
        return null;
      }
      return {
        unitId: transition.targetUnitId,
        route: appendTargetToRoute(route, index, activeUnitId, transition.targetUnitId),
      };
    }

    function getOutgoingTransitions(unitId) {
      if (!playbackPlan || !Array.isArray(playbackPlan.transitions)) {
        return [];
      }
      return playbackPlan.transitions
        .filter((transition) => transition.sourceUnitId === unitId && transition.enabled !== false)
        .slice()
        .sort((left, right) => (left.priority || 0) - (right.priority || 0) || String(left.id).localeCompare(String(right.id)));
    }

    function appendTargetToRoute(inputRoute, currentIndex, currentUnitId, targetUnitId) {
      const prefix = currentIndex >= 0 ? inputRoute.slice(0, currentIndex + 1) : currentUnitId ? [currentUnitId] : [];
      const existingIndex = prefix.indexOf(targetUnitId);
      return existingIndex >= 0 ? prefix.slice(0, existingIndex + 1) : prefix.concat(targetUnitId);
    }

    function resolveUnitDurationMs(unitId) {
      const durationMs = playbackPlan?.units.find((unit) => unit.id === unitId)?.durationMs;
      return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0
        ? durationMs
        : DEFAULT_TIMER_MS;
    }

    function getRouteTotalDurationMs() {
      return route.reduce((total, unitId) => total + resolveUnitDurationMs(unitId), 0);
    }

    function getElapsedBeforeIndex(index) {
      if (index <= 0) {
        return 0;
      }
      return route
        .slice(0, index)
        .reduce((total, unitId) => total + resolveUnitDurationMs(unitId), 0);
    }

    function clampElapsed(value, durationMs) {
      if (!Number.isFinite(value) || value < 0) {
        return 0;
      }
      return Math.min(value, Math.max(0, durationMs));
    }

    function canPreviewAutoAdvance() {
      if (!playbackPlan) {
        return false;
      }
      if (playbackPlan.advancePolicy === 'timer') {
        return true;
      }
      if (playbackPlan.advancePolicy !== 'media-ended') {
        return false;
      }
      const unit = getCurrentUnit();
      return Boolean(unit && typeof unit.durationMs === 'number' && Number.isFinite(unit.durationMs));
    }

    function postPlaybackHighlight() {
      const unit = getCurrentUnit();
      if (!unit) {
        return;
      }
      postMessage({
        type: 'canvas:highlightNode',
        requestId: createRequestId('node'),
        nodeId: unit.sourceNodeId,
      });
      const nodeIds = route
        .map((unitId) => playbackPlan?.units.find((candidate) => candidate.id === unitId)?.sourceNodeId)
        .filter(Boolean);
      if (nodeIds.length > 0) {
        postMessage({
          type: 'canvas:highlightPath',
          requestId: createRequestId('path'),
          nodeIds,
        });
      }
    }

    function postMessage(message) {
      vscode.postMessage({
        ...message,
        sessionId: currentSessionId,
        sourceCanvasUri: currentSourceCanvasUri,
        revision: currentRevision,
      });
    }

    function createRequestId(reason) {
      return 'canvas-playback-preview:' + reason + ':' + Date.now();
    }

    function updateSessionEnvelopeState(message) {
      if (typeof message.sessionId === 'string') {
        currentSessionId = message.sessionId;
      }
      if (typeof message.sourceCanvasUri === 'string') {
        currentSourceCanvasUri = message.sourceCanvasUri;
      }
      if (typeof message.revision === 'number' && Number.isFinite(message.revision)) {
        currentRevision = message.revision;
      }
    }

    function formatPlanTitle(plan) {
      if (!plan) {
        return t('planCanvasPlayback');
      }
      if (plan.adapterId === 'storyboard') {
        return t('planStoryboardPreview');
      }
      if (plan.adapterId === 'media-sequence') {
        return t('planMediaSequencePreview');
      }
      if (plan.adapterId === 'narrative') {
        return t('planNarrativePlaybackPlan');
      }
      return t('planCanvasPlayback');
    }

    function formatRouteTitle(candidate) {
      if (!candidate) {
        return t('route');
      }
      const title = typeof candidate.title === 'string' && candidate.title.length > 0
        ? candidate.title
        : candidate.id;
      const count = Array.isArray(candidate.unitIds) ? candidate.unitIds.length : 0;
      return t('routeTitle', {
        title,
        sourceKind: candidate.sourceKind || 'entry',
        count,
      });
    }

    function formatDiagnosticMessage(diagnostic) {
      if (!diagnostic || typeof diagnostic !== 'object') {
        return '';
      }
      if (diagnostic.code === 'playback-missing-route') {
        return t('missingRouteEntry');
      }
      if (diagnostic.code === 'playback-invalid-route') {
        return t('invalidRoute');
      }
      if (diagnostic.code === 'playback-route-truncated') {
        return t('routeTruncated');
      }
      return diagnostic.message || diagnostic.code || '';
    }

    function formatUnitTitle(unit, index) {
      const metadata = getMetadata(unit);
      if (unit.kind === 'shot') {
        const shotNumber = metadata.shotNumber !== undefined ? String(metadata.shotNumber) : String(index + 1);
        return unit.label || t('shotTitle', { shotNumber });
      }
      return (
        unit.label ||
        readFirstString(metadata, ['sceneTitle', 'scriptTitle', 'title', 'name', 'projectTitle', 'docPath', 'assetPath']) ||
        t('fallbackUnitTitle', { kind: formatKindLabel(unit.kind), index: index + 1 })
      );
    }

    function formatUnitBody(unit) {
      const metadata = getMetadata(unit);
      if (unit.kind === 'shot') {
        return (
          readString(metadata.visualDescription) ||
          readString(metadata.generationPrompt) ||
          readString(metadata.dialogue) ||
          t('bodyShotFallback')
        );
      }
      if (unit.kind === 'scene') {
        const location = readString(metadata.location);
        const timeOfDay = readString(metadata.timeOfDay);
        return [readString(metadata.sceneTitle), location, timeOfDay].filter(Boolean).join(' / ') || t('bodySceneFallback');
      }
      if (unit.kind === 'media') {
        const source = unit.assetPath || readString(metadata.assetPath) || readNestedString(unit.resourceRef, ['key', 'id', 'path']);
        return source ? t('bodyMediaSource', { source }) : t('bodyMediaFallback');
      }
      if (unit.kind === 'narrative') {
        return readString(metadata.content) || readString(metadata.sceneRef) || t('bodyNarrativeFallback');
      }
      if (unit.kind === 'container') {
        return readFirstString(metadata, ['description', 'sceneTitle', 'label', 'name']) || t('bodyContainerFallback');
      }
      return readFirstString(metadata, ['content', 'description', 'scriptPath', 'docPath', 'modelPath', 'canvasPath', 'projectPath']) || t('bodyGenericFallback');
    }

    function formatChoiceLabel(choice) {
      if (choice.label) {
        return choice.label;
      }
      const target = playbackPlan?.units.find((unit) => unit.id === choice.targetUnitId);
      return target ? t('choiceContinueTo', { title: formatUnitTitle(target, route.length) }) : t('choiceContinue');
    }

    function formatKindLabel(kind) {
      if (kind === 'node') return t('kindNode');
      if (kind === 'container') return t('kindContainer');
      if (kind === 'media') return t('kindMedia');
      if (kind === 'shot') return t('kindShot');
      if (kind === 'scene') return t('kindScene');
      if (kind === 'narrative') return t('kindNarrative');
      return kind ? String(kind) : t('kindUnit');
    }

    function getMetadata(unit) {
      return unit && unit.metadata && typeof unit.metadata === 'object' && !Array.isArray(unit.metadata)
        ? unit.metadata
        : {};
    }

    function readFirstString(source, fields) {
      for (const field of fields) {
        const value = readString(source[field]);
        if (value) {
          return value;
        }
      }
      return undefined;
    }

    function readString(value) {
      return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
    }

    function readNestedString(source, fields) {
      if (!source || typeof source !== 'object') {
        return undefined;
      }
      for (const field of fields) {
        const value = readString(source[field]);
        if (value) {
          return value;
        }
      }
      return undefined;
    }

    function isSafePreviewSource(value) {
      return (
        value.startsWith('data:image/') ||
        value.startsWith('data:audio/') ||
        value.startsWith('data:video/') ||
        value.startsWith('blob:') ||
        value.startsWith('https://') ||
        value.startsWith('vscode-webview:') ||
        value.startsWith('vscode-webview-resource:') ||
        value.startsWith('vscode-resource:') ||
        (value.startsWith('https://') && value.includes('vscode-resource.vscode-cdn.net/'))
      );
    }

    function inferMediaType(value) {
      const clean = value.split('?')[0].split('#')[0].toLowerCase();
      if (clean.startsWith('data:image/') || /\\.(png|jpe?g|webp|gif|avif)$/.test(clean)) return 'image';
      if (clean.startsWith('data:video/') || /\\.(mp4|webm|mov|m4v|mkv)$/.test(clean)) return 'video';
      if (clean.startsWith('data:audio/') || /\\.(mp3|wav|ogg|flac|m4a|aac)$/.test(clean)) return 'audio';
      return undefined;
    }

    function summarizeCharacters(value) {
      if (!Array.isArray(value) || value.length === 0) {
        return undefined;
      }
      return value
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            return readString(item.characterName) || readString(item.displayName) || readString(item.characterId);
          }
          return undefined;
        })
        .filter(Boolean)
        .join(', ');
    }

    function summarizeCount() {
      let count = 0;
      for (const value of arguments) {
        if (Array.isArray(value)) {
          count += value.length;
        }
      }
      return count > 0 ? t(count === 1 ? 'itemCountOne' : 'itemCountMany', { count }) : undefined;
    }

    function summarizeArray(value) {
      return Array.isArray(value) && value.length > 0 ? String(value.length) : undefined;
    }

    function formatDuration(value) {
      return typeof value === 'number' && Number.isFinite(value)
        ? t('durationSeconds', { seconds: (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) })
        : undefined;
    }

    function formatClockTime(value) {
      const totalSeconds = Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return minutes + ':' + String(seconds).padStart(2, '0');
    }

    function formatValue(value) {
      if (Array.isArray(value)) {
        return value.map(formatValue).join(', ');
      }
      if (value && typeof value === 'object') {
        const preferred = readNestedString(value, ['path', 'assetPath', 'scriptPath', 'docPath', 'id', 'key', 'name', 'title']);
        if (preferred) {
          return preferred;
        }
        const json = JSON.stringify(value);
        return json.length > 160 ? json.slice(0, 157) + '...' : json;
      }
      return String(value);
    }

    vscode.postMessage({ type: 'preview:webviewReady', requestId: createRequestId('ready') });
  </script>
</body>
</html>`;
  }

  private resolveMediaRuntimeScriptUri(webview: vscode.Webview): string | undefined {
    if (!this.getMediaRuntimeScriptUri) {
      return undefined;
    }
    return webview.asWebviewUri(this.getMediaRuntimeScriptUri(webview)).toString();
  }
}

function createNarrativePreviewI18n(): NarrativePreviewI18n {
  const t = (key: string, fallback: string): string => {
    const localized = vscode.l10n.t(key);
    return localized === key ? fallback : localized;
  };
  return {
    title: t('neko.canvas.preview.title', 'Canvas Preview'),
    statusWaitingGraph: t('neko.canvas.preview.statusWaitingGraph', 'Waiting for Canvas graph...'),
    ariaStage: t('neko.canvas.preview.ariaStage', 'Canvas playback stage'),
    ariaStageOverlay: t('neko.canvas.preview.ariaStageOverlay', 'Playback stage overlay'),
    ariaPlaybackDetails: t('neko.canvas.preview.ariaPlaybackDetails', 'Playback details'),
    ariaDetails: t('neko.canvas.preview.ariaDetails', 'Playback details'),
    ariaControls: t('neko.canvas.preview.ariaControls', 'Playback controls'),
    ariaTimeline: t('neko.canvas.preview.ariaTimeline', 'Playback timeline'),
    unitFallback: t('neko.canvas.preview.unitFallback', 'Unit'),
    planCanvasPlayback: t('neko.canvas.preview.planCanvasPlayback', 'Canvas Playback'),
    info: t('neko.canvas.preview.info', 'Info'),
    route: t('neko.canvas.preview.route', 'Route'),
    routeTitle: t('neko.canvas.preview.routeTitle', '{title} · {sourceKind} · {count} units'),
    missingRouteCandidates: t(
      'neko.canvas.preview.missingRouteCandidates',
      'Playback plan has no route candidates.',
    ),
    missingRouteEntry: t(
      'neko.canvas.preview.missingRouteEntry',
      'Playback plan has no playable route entry.',
    ),
    invalidRoute: t('neko.canvas.preview.invalidRoute', 'Playback route candidate is invalid.'),
    routeTruncated: t(
      'neko.canvas.preview.routeTruncated',
      'Some playback routes were hidden because the route list exceeded the Preview limit.',
    ),
    branches: t('neko.canvas.preview.branches', 'Branches'),
    diagnostics: t('neko.canvas.preview.diagnostics', 'Diagnostics'),
    staleSession: t('neko.canvas.preview.staleSession', 'Source Canvas closed'),
    staleSessionDescription: t(
      'neko.canvas.preview.staleSessionDescription',
      'This Preview is still visible, but its source Canvas editor has been closed.',
    ),
    noUnitSelected: t('neko.canvas.preview.noUnitSelected', 'No unit selected'),
    close: t('neko.canvas.preview.close', 'Close'),
    stageZero: t('neko.canvas.preview.stageZero', 'Stage 0'),
    previous: t('neko.canvas.preview.previous', 'Previous'),
    previousShort: t('neko.canvas.preview.previousShort', 'Prev'),
    play: t('neko.canvas.preview.play', 'Play'),
    pause: t('neko.canvas.preview.pause', 'Pause'),
    next: t('neko.canvas.preview.next', 'Next'),
    summaryWaitingPlan: t(
      'neko.canvas.preview.summaryWaitingPlan',
      'Waiting for Canvas playback plan...',
    ),
    statusLoadedZeroRuntime: t(
      'neko.canvas.preview.statusLoadedZeroRuntime',
      'Loaded revision {revision} with 0 Narrative Runtime nodes. Storyboard scene/shot and generic Canvas nodes use Canvas Playback Plan preview instead of Narrative Runtime.',
    ),
    statusLoadedRuntime: t(
      'neko.canvas.preview.statusLoadedRuntime',
      'Loaded revision {revision} with {count} runtime nodes.',
    ),
    statusLoadedPlaybackPlan: t(
      'neko.canvas.preview.statusLoadedPlaybackPlan',
      'Loaded Canvas playback plan ({adapterId}, {behaviorMode}) with {count} units{kindList}.',
    ),
    statusDiagnostics: t('neko.canvas.preview.statusDiagnostics', ' Diagnostics: {diagnostics}'),
    statusJumpRequest: t(
      'neko.canvas.preview.statusJumpRequest',
      'Jump request: {nodeId} at revision {revision}.',
    ),
    stagePosition: t('neko.canvas.preview.stagePosition', 'Stage {index} of {total}'),
    noPlayableUnit: t('neko.canvas.preview.noPlayableUnit', 'No playable unit'),
    noPlayableUnitDescription: t(
      'neko.canvas.preview.noPlayableUnitDescription',
      'This Canvas does not expose a playable unit for the selected preview surface.',
    ),
    mediaUnavailable: t('neko.canvas.preview.mediaUnavailable', 'Media unavailable'),
    mediaUnavailableDescription: t(
      'neko.canvas.preview.mediaUnavailableDescription',
      'A durable media reference exists, but no runtime preview URL is available in this player shell.',
    ),
    mediaLoading: t('neko.canvas.preview.mediaLoading', 'Loading media stream...'),
    mediaPreparing: t('neko.canvas.preview.mediaPreparing', 'Preparing media stream...'),
    storyboardShot: t('neko.canvas.preview.storyboardShot', 'Storyboard shot'),
    storyboardShotUnavailableDescription: t(
      'neko.canvas.preview.storyboardShotUnavailableDescription',
      'No generated image or safe preview source is available for this shot yet.',
    ),
    storyboardScene: t('neko.canvas.preview.storyboardScene', 'Storyboard scene'),
    storyboardSceneDescription: t(
      'neko.canvas.preview.storyboardSceneDescription',
      'Scene playback is represented by ordered shots or scene metadata.',
    ),
    canvasNode: t('neko.canvas.preview.canvasNode', 'Canvas node'),
    canvasNodeDescription: t(
      'neko.canvas.preview.canvasNodeDescription',
      'This unit is shown as a Canvas summary and highlighted in the source editor.',
    ),
    playbackPreviewAlt: t('neko.canvas.preview.playbackPreviewAlt', 'Playback preview'),
    labelMode: t('neko.canvas.preview.labelMode', 'Mode'),
    labelDuration: t('neko.canvas.preview.labelDuration', 'Duration'),
    labelAsset: t('neko.canvas.preview.labelAsset', 'Asset'),
    labelShot: t('neko.canvas.preview.labelShot', 'Shot'),
    labelScale: t('neko.canvas.preview.labelScale', 'Scale'),
    labelAction: t('neko.canvas.preview.labelAction', 'Action'),
    labelDialogue: t('neko.canvas.preview.labelDialogue', 'Dialogue'),
    labelScene: t('neko.canvas.preview.labelScene', 'Scene'),
    labelLocation: t('neko.canvas.preview.labelLocation', 'Location'),
    labelTime: t('neko.canvas.preview.labelTime', 'Time'),
    labelMedia: t('neko.canvas.preview.labelMedia', 'Media'),
    labelMime: t('neko.canvas.preview.labelMime', 'MIME'),
    labelSourceNode: t('neko.canvas.preview.labelSourceNode', 'Source node'),
    labelRenderMode: t('neko.canvas.preview.labelRenderMode', 'Render mode'),
    labelResource: t('neko.canvas.preview.labelResource', 'Resource'),
    labelCamera: t('neko.canvas.preview.labelCamera', 'Camera'),
    labelAngle: t('neko.canvas.preview.labelAngle', 'Angle'),
    labelVoice: t('neko.canvas.preview.labelVoice', 'Voice'),
    labelSound: t('neko.canvas.preview.labelSound', 'Sound'),
    labelStatus: t('neko.canvas.preview.labelStatus', 'Status'),
    labelCharacters: t('neko.canvas.preview.labelCharacters', 'Characters'),
    labelMediaRefs: t('neko.canvas.preview.labelMediaRefs', 'Media refs'),
    labelPreviewSource: t('neko.canvas.preview.labelPreviewSource', 'Preview source'),
    previewSourceGeneratedImage: t(
      'neko.canvas.preview.previewSourceGeneratedImage',
      'Generated image',
    ),
    previewSourceGeneratedMedia: t(
      'neko.canvas.preview.previewSourceGeneratedMedia',
      'Generated media',
    ),
    previewSourceReferenceImage: t(
      'neko.canvas.preview.previewSourceReferenceImage',
      'Reference image',
    ),
    previewSourceSourceMedia: t('neko.canvas.preview.previewSourceSourceMedia', 'Source media'),
    previewSourceMediaAsset: t('neko.canvas.preview.previewSourceMediaAsset', 'Media asset'),
    labelImageAsset: t('neko.canvas.preview.labelImageAsset', 'Image asset'),
    labelVideoAsset: t('neko.canvas.preview.labelVideoAsset', 'Video asset'),
    labelScript: t('neko.canvas.preview.labelScript', 'Script'),
    labelMediaType: t('neko.canvas.preview.labelMediaType', 'Media type'),
    labelAssetPath: t('neko.canvas.preview.labelAssetPath', 'Asset path'),
    labelDocument: t('neko.canvas.preview.labelDocument', 'Document'),
    labelProject: t('neko.canvas.preview.labelProject', 'Project'),
    labelScenes: t('neko.canvas.preview.labelScenes', 'Scenes'),
    noBranches: t('neko.canvas.preview.noBranches', 'No branches'),
    noDiagnostics: t('neko.canvas.preview.noDiagnostics', 'No diagnostics'),
    planStoryboardPreview: t('neko.canvas.preview.planStoryboardPreview', 'Storyboard Preview'),
    planMediaSequencePreview: t(
      'neko.canvas.preview.planMediaSequencePreview',
      'Media Sequence Preview',
    ),
    planNarrativePlaybackPlan: t(
      'neko.canvas.preview.planNarrativePlaybackPlan',
      'Narrative Playback Plan',
    ),
    shotTitle: t('neko.canvas.preview.shotTitle', 'Shot {shotNumber}'),
    fallbackUnitTitle: t('neko.canvas.preview.fallbackUnitTitle', '{kind} {index}'),
    bodyShotFallback: t(
      'neko.canvas.preview.bodyShotFallback',
      'Storyboard shot playback unit. Use Canvas to edit shot content and route ordering.',
    ),
    bodySceneFallback: t(
      'neko.canvas.preview.bodySceneFallback',
      'Storyboard scene playback unit.',
    ),
    bodyMediaSource: t('neko.canvas.preview.bodyMediaSource', 'Media source: {source}'),
    bodyMediaFallback: t(
      'neko.canvas.preview.bodyMediaFallback',
      'Media playback unit. Runtime source will be resolved by the host.',
    ),
    bodyNarrativeFallback: t(
      'neko.canvas.preview.bodyNarrativeFallback',
      'Narrative runtime unit. Interactive rendering remains handled by the Narrative Runtime.',
    ),
    bodyContainerFallback: t(
      'neko.canvas.preview.bodyContainerFallback',
      'Container playback unit.',
    ),
    bodyGenericFallback: t(
      'neko.canvas.preview.bodyGenericFallback',
      'Generic Canvas node playback unit.',
    ),
    choiceContinueTo: t('neko.canvas.preview.choiceContinueTo', 'Continue to {title}'),
    choiceContinue: t('neko.canvas.preview.choiceContinue', 'Continue'),
    choiceTransition: t('neko.canvas.preview.choiceTransition', '{label} -> {targetUnitId}'),
    itemCountOne: t('neko.canvas.preview.itemCountOne', '{count} item'),
    itemCountMany: t('neko.canvas.preview.itemCountMany', '{count} items'),
    durationSeconds: t('neko.canvas.preview.durationSeconds', '{seconds}s'),
    kindNode: t('neko.canvas.preview.kindNode', 'Node'),
    kindContainer: t('neko.canvas.preview.kindContainer', 'Container'),
    kindMedia: t('neko.canvas.preview.kindMedia', 'Media'),
    kindShot: t('neko.canvas.preview.kindShot', 'Shot'),
    kindScene: t('neko.canvas.preview.kindScene', 'Scene'),
    kindNarrative: t('neko.canvas.preview.kindNarrative', 'Narrative'),
    kindUnit: t('neko.canvas.preview.kindUnit', 'Unit'),
    disabledByConfiguration: t(
      'neko.canvas.preview.disabledByConfiguration',
      'Canvas Preview is disabled by configuration.',
    ),
    noActiveGraph: t(
      'neko.canvas.preview.noActiveGraph',
      'No active Canvas narrative graph is available.',
    ),
  };
}

function prepareCanvasPlaybackPlanForPreview(plan: CanvasPlaybackPlan): CanvasPlaybackPlan {
  const routeResolution = resolveEffectiveCanvasPlaybackRoutes(plan);
  const diagnostics = mergeCanvasPlaybackDiagnostics(plan.diagnostics, routeResolution.diagnostics);
  return {
    ...plan,
    routeCandidates: routeResolution.routes,
    diagnostics,
  };
}

function mergeCanvasPlaybackDiagnostics(
  baseDiagnostics: readonly CanvasPlaybackDiagnostic[],
  routeDiagnostics: readonly CanvasPlaybackDiagnostic[],
): readonly CanvasPlaybackDiagnostic[] {
  if (routeDiagnostics.length === 0) return baseDiagnostics;
  const seen = new Set(baseDiagnostics.map(getCanvasPlaybackDiagnosticKey));
  const merged: CanvasPlaybackDiagnostic[] = [...baseDiagnostics];
  for (const diagnostic of routeDiagnostics) {
    const key = getCanvasPlaybackDiagnosticKey(diagnostic);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(diagnostic);
  }
  return merged;
}

function getCanvasPlaybackDiagnosticKey(diagnostic: CanvasPlaybackDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.severity,
    diagnostic.message,
    diagnostic.adapterId ?? '',
    diagnostic.nodeId ?? '',
    diagnostic.connectionId ?? '',
  ].join('|');
}

export function createNarrativeGraphSnapshotFromCanvasData(
  canvas: CanvasData | Record<string, unknown>,
  options: {
    readonly revision: number;
    readonly sourceCanvasUri?: string;
  },
): NarrativeGraphSnapshot {
  const nodes = readCanvasNodes(canvas);
  const runtimeNodeIds = new Set(nodes.filter(isNarrativeRuntimeCanvasNode).map((node) => node.id));
  const connections = readCanvasConnections(canvas)
    .filter(
      (connection) =>
        runtimeNodeIds.has(connection.sourceId) &&
        runtimeNodeIds.has(connection.targetId) &&
        NARRATIVE_RUNTIME_CONNECTION_TYPES.has(connection.type),
    )
    .map(toNarrativeConnectionSnapshot);

  return {
    nodes: nodes.filter(isNarrativeRuntimeCanvasNode).map(toNarrativeNodeSnapshot),
    connections,
    metadata: readNarrativeMetadata(canvas),
    revision: options.revision,
    ...(options.sourceCanvasUri ? { sourceCanvasUri: options.sourceCanvasUri } : {}),
    ...readOptionalStringRecord(canvas, 'sceneContents', 'sceneContents'),
    ...readOptionalString(canvas, 'charactersYaml', 'charactersYaml'),
  };
}

export function createCanvasPlaybackPlanFromCanvasData(
  canvas: CanvasData | Record<string, unknown>,
  options: {
    readonly selectedNodeId?: string;
  } = {},
): CanvasPlaybackPlan | undefined {
  const normalized = normalizeCanvasDataForPlayback(canvas);
  if (!normalized) return undefined;
  return createCanvasPlaybackPlan({
    canvas: normalized,
    selectedNodeId: options.selectedNodeId,
    adapterId: 'auto',
  });
}

export function parsePreviewToCanvasMessage(value: unknown): PreviewToCanvasMessage | undefined {
  if (!isRecord(value) || typeof value['type'] !== 'string') return undefined;
  const requestId = typeof value['requestId'] === 'string' ? value['requestId'] : undefined;
  if (!requestId) return undefined;
  const envelope = readCanvasPreviewEnvelope(value);

  switch (value['type']) {
    case 'canvas:highlightNode': {
      const nodeId = typeof value['nodeId'] === 'string' ? value['nodeId'] : undefined;
      return nodeId
        ? ({
            type: 'canvas:highlightNode',
            requestId,
            nodeId,
            ...envelope,
          } as PreviewToCanvasMessage)
        : undefined;
    }
    case 'canvas:highlightPath': {
      const nodeIds = Array.isArray(value['nodeIds'])
        ? value['nodeIds'].filter((nodeId): nodeId is string => typeof nodeId === 'string')
        : undefined;
      return nodeIds
        ? ({
            type: 'canvas:highlightPath',
            requestId,
            nodeIds,
            ...envelope,
          } as PreviewToCanvasMessage)
        : undefined;
    }
    case 'canvas:choiceMade': {
      const fromNodeId = typeof value['fromNodeId'] === 'string' ? value['fromNodeId'] : undefined;
      const toNodeId = typeof value['toNodeId'] === 'string' ? value['toNodeId'] : undefined;
      return fromNodeId && toNodeId
        ? ({
            type: 'canvas:choiceMade',
            requestId,
            fromNodeId,
            toNodeId,
            ...envelope,
          } as PreviewToCanvasMessage)
        : undefined;
    }
    default:
      return undefined;
  }
}

function isPreviewWebviewReadyMessage(value: unknown): boolean {
  return isRecord(value) && value['type'] === 'preview:webviewReady';
}

function isNarrativePreviewMediaMessage(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value['type'] !== 'string') {
    return false;
  }
  return (
    value['type'] === 'media:probe' ||
    value['type'] === 'media:play' ||
    value['type'] === 'media:seek' ||
    value['type'] === 'media:pause' ||
    value['type'] === 'media:resume' ||
    value['type'] === 'media:stop'
  );
}

function isNarrativePreviewVariantMessage(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value['type'] === 'preview:resolveVariant' &&
    typeof value['requestId'] === 'string'
  );
}

function readCanvasNodes(canvas: CanvasData | Record<string, unknown>): readonly CanvasNode[] {
  const nodes = isRecord(canvas) ? canvas['nodes'] : undefined;
  return Array.isArray(nodes) ? (nodes.filter(isCanvasNodeLike) as CanvasNode[]) : [];
}

function readCanvasConnections(
  canvas: CanvasData | Record<string, unknown>,
): readonly CanvasConnection[] {
  const connections = isRecord(canvas) ? canvas['connections'] : undefined;
  return Array.isArray(connections)
    ? (connections.filter(isCanvasConnectionLike) as CanvasConnection[])
    : [];
}

function normalizeCanvasDataForPlayback(
  canvas: CanvasData | Record<string, unknown>,
): CanvasData | undefined {
  if (!isRecord(canvas)) return undefined;
  const nodes = readCanvasNodes(canvas);
  const connections = readCanvasConnections(canvas);
  if (!Array.isArray(canvas['nodes'])) return undefined;

  return {
    version: typeof canvas['version'] === 'string' ? canvas['version'] : '2.1',
    name: typeof canvas['name'] === 'string' ? canvas['name'] : 'Untitled Canvas',
    ...(isCanvasViewportLike(canvas['viewport']) ? { viewport: canvas['viewport'] } : {}),
    nodes: [...nodes],
    connections: [...connections],
    ...(isRecord(canvas['narrative']) ? { narrative: readNarrativeMetadata(canvas) } : {}),
    ...(isPlaybackMetadataLike(canvas['playback']) ? { playback: canvas['playback'] } : {}),
  };
}

function isCanvasViewportLike(value: unknown): value is NonNullable<CanvasData['viewport']> {
  return (
    isRecord(value) &&
    isRecord(value['pan']) &&
    typeof value['pan']['x'] === 'number' &&
    typeof value['pan']['y'] === 'number' &&
    typeof value['zoom'] === 'number'
  );
}

function isPlaybackMetadataLike(value: unknown): value is NonNullable<CanvasData['playback']> {
  return isRecord(value) && value['version'] === 1;
}

function isNarrativeRuntimeCanvasNode(
  node: CanvasNode,
): node is CanvasNode & { readonly type: NarrativeRuntimeNodeType } {
  return NARRATIVE_RUNTIME_NODE_TYPE_SET.has(node.type);
}

function toNarrativeNodeSnapshot(
  node: CanvasNode & { readonly type: NarrativeRuntimeNodeType },
): NarrativeNodeSnapshot {
  const data = readSerializableRecord(node.data);
  return {
    nodeId: node.id,
    type: node.type,
    label: readNodeLabel(node),
    data,
    ...(node.type === 'narrative-scene' ? { scene: readNarrativeSceneMetadata(data) } : {}),
    ...(node.type === 'narrative-ending' ? { ending: readNarrativeEndingMetadata(data) } : {}),
  };
}

function toNarrativeConnectionSnapshot(connection: CanvasConnection): NarrativeConnectionSnapshot {
  return {
    connectionId: connection.id,
    sourceNodeId: connection.sourceId,
    targetNodeId: connection.targetId,
    type: connection.type,
    choiceText: connection.choiceText ?? connection.label,
    condition: connection.condition,
    priority: connection.priority ?? 0,
  };
}

function readNarrativeMetadata(canvas: CanvasData | Record<string, unknown>): NarrativeMetadata {
  const narrative = isRecord(canvas) && isRecord(canvas['narrative']) ? canvas['narrative'] : {};
  const variables = Array.isArray(narrative['variables'])
    ? narrative['variables'].filter(isNarrativeVariable)
    : [];
  return {
    variables,
    ...(typeof narrative['entryNodeId'] === 'string'
      ? { entryNodeId: narrative['entryNodeId'] }
      : {}),
    ...(isStoryGenreValue(narrative['genre']) ? { genre: narrative['genre'] } : {}),
    ...(typeof narrative['defaultLocale'] === 'string'
      ? { defaultLocale: narrative['defaultLocale'] }
      : {}),
  };
}

function readNarrativeSceneMetadata(data: CanvasSerializableRecord): NarrativeSceneMetadata {
  const variableEffects = readVariableEffects(data['variableEffects']);
  return {
    ...(typeof data['sceneRef'] === 'string' ? { sceneRef: data['sceneRef'] } : {}),
    ...readNarrativeAssetRefField(data, 'backgroundRef', 'backgroundRef'),
    ...readNarrativeAssetRefField(data, 'bgm', 'bgm'),
    ...(Array.isArray(data['characters'])
      ? { characters: data['characters'].filter(isStringValue) }
      : {}),
    ...(variableEffects.length > 0 ? { variableEffects } : {}),
  };
}

function readNarrativeEndingMetadata(data: CanvasSerializableRecord): NarrativeEndingMetadata {
  const endingType = data['endingType'];
  return {
    ...(isNarrativeEndingTypeValue(endingType) ? { endingType } : {}),
    ...(typeof data['endingLabel'] === 'string' ? { endingLabel: data['endingLabel'] } : {}),
    ...(typeof data['statisticsSummary'] === 'boolean'
      ? { statisticsSummary: data['statisticsSummary'] }
      : {}),
  };
}

function readNarrativeAssetRefField<TKey extends string>(
  data: CanvasSerializableRecord,
  field: string,
  outputField: TKey,
): Partial<Record<TKey, NarrativeAssetRef>> {
  const value = data[field];
  if (isNarrativeAssetRef(value)) {
    return { [outputField]: value } as unknown as Partial<Record<TKey, NarrativeAssetRef>>;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return {
      [outputField]: createNarrativeRelativePathAssetRef(value.trim()),
    } as unknown as Partial<Record<TKey, NarrativeAssetRef>>;
  }
  return {};
}

function readNodeLabel(node: CanvasNode): string | undefined {
  const data = isRecord(node.data) ? (node.data as Record<string, unknown>) : {};
  const value =
    data['label'] ??
    data['title'] ??
    data['name'] ??
    data['endingLabel'] ??
    data['scriptTitle'] ??
    data['sceneTitle'];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readSerializableRecord(value: unknown): CanvasSerializableRecord {
  return isRecord(value) ? copySerializableRecord(value) : {};
}

function copySerializableRecord(value: Record<string, unknown>): CanvasSerializableRecord {
  const result: Record<string, CanvasSerializableValue> = {};
  for (const [key, field] of Object.entries(value)) {
    const copied = copySerializableValue(field);
    if (copied !== undefined) {
      result[key] = copied;
    }
  }
  return result;
}

function copySerializableValue(value: unknown): CanvasSerializableValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value
      .map(copySerializableValue)
      .filter((item): item is CanvasSerializableValue => item !== undefined);
    return values;
  }
  if (isResourceRef(value)) {
    return value as unknown as CanvasSerializableRecord;
  }
  if (isRecord(value)) {
    return copySerializableRecord(value);
  }
  return undefined;
}

function readOptionalStringRecord<TField extends string>(
  canvas: CanvasData | Record<string, unknown>,
  inputField: string,
  outputField: TField,
): Partial<Record<TField, Readonly<Record<string, string>>>> {
  if (!isRecord(canvas) || !isRecord(canvas[inputField])) return {};
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(canvas[inputField])) {
    if (typeof value === 'string') {
      values[key] = value;
    }
  }
  return { [outputField]: values } as Partial<Record<TField, Readonly<Record<string, string>>>>;
}

function readOptionalString<TField extends string>(
  canvas: CanvasData | Record<string, unknown>,
  inputField: string,
  outputField: TField,
): Partial<Record<TField, string>> {
  const value = isRecord(canvas) ? canvas[inputField] : undefined;
  return typeof value === 'string'
    ? ({ [outputField]: value } as Partial<Record<TField, string>>)
    : {};
}

function isCanvasNodeLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['type'] === 'string' &&
    isRecord(value['data'])
  );
}

function isCanvasConnectionLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['sourceId'] === 'string' &&
    typeof value['targetId'] === 'string'
  );
}

function isNarrativeVariable(value: unknown): value is NarrativeMetadata['variables'][number] {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    copySerializableValue(value['value']) !== undefined
  );
}

function readVariableEffects(value: unknown): readonly VariableEffect[] {
  if (!Array.isArray(value)) return [];
  const effects: VariableEffect[] = [];
  for (const item of value) {
    if (
      isRecord(item) &&
      typeof item['variableId'] === 'string' &&
      isVariableEffectOperation(item['operation'])
    ) {
      effects.push({
        variableId: item['variableId'],
        operation: item['operation'],
        value: item['value'],
      });
    }
  }
  return effects;
}

function isVariableEffectOperation(value: unknown): value is VariableEffect['operation'] {
  return value === 'set' || value === 'add' || value === 'subtract' || value === 'toggle';
}

function isStoryGenreValue(value: unknown): value is StoryGenre {
  return (
    value === 'interactive-film' ||
    value === 'visual-novel' ||
    value === 'illustrated-text' ||
    value === 'hybrid'
  );
}

function isNarrativeEndingTypeValue(
  value: unknown,
): value is NonNullable<NarrativeEndingMetadata['endingType']> {
  return (
    value === 'good' ||
    value === 'normal' ||
    value === 'bad' ||
    value === 'secret' ||
    value === 'custom'
  );
}

function isStringValue(value: unknown): value is string {
  return typeof value === 'string';
}

function readCanvasPreviewEnvelope(value: unknown): CanvasPreviewMessageEnvelope {
  if (!isRecord(value)) return {};
  const sessionId = typeof value['sessionId'] === 'string' ? value['sessionId'] : undefined;
  const sourceCanvasUri =
    typeof value['sourceCanvasUri'] === 'string' ? value['sourceCanvasUri'] : undefined;
  const revision =
    typeof value['revision'] === 'number' && Number.isFinite(value['revision'])
      ? value['revision']
      : undefined;
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(sourceCanvasUri ? { sourceCanvasUri } : {}),
    ...(revision !== undefined ? { revision } : {}),
  };
}

function readRevision(message: PreviewToCanvasMessage): number | undefined {
  return readCanvasPreviewEnvelope(message).revision;
}

function readCanvasMessageRevision(message: CanvasToPreviewMessage): number | undefined {
  return readCanvasPreviewEnvelope(message).revision;
}

function serializePreviewBootstrapMessages(messages: readonly CanvasToPreviewMessage[]): string {
  return serializePreviewJson(messages);
}

function serializePreviewJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let index = 0; index < 32; index += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
