import type {
  CharacterPreviewModeStatePayload,
  EnvironmentPatch,
  LightPatch,
  RenderFrameMeta,
  SceneCommandAck,
  SceneCommandEnvelope,
  SceneDelta,
  SceneSnapshot,
  SelectionQuery,
  SelectionQueryResult,
  ViewportControlFlowDiagnostic,
  ViewportControlConnectionState,
  ViewportCommand,
  ViewportEvent,
  ViewportMetadataEvent,
  ViewportSerializableRecord,
} from '@neko/shared';
import {
  isCharacterPreviewModeStatePayload,
  isViewportEvent,
  isViewportMetadataEvent,
} from '@neko/shared';
import {
  isRecord,
  parseJsonObject,
  readBoolean,
  readFiniteNumber,
  readRenderFrameMeta,
  readString,
  readStringArray,
} from './utils/wireReaders';
import {
  normalizeSelectionQueryResult,
  readCharacterRegionDescriptorSet,
} from './utils/sceneWireNormalizers';

type SceneControlMessageHandler<T> = (message: T) => void;
type SceneControlErrorHandler = (error: Error) => void;
type SceneNodeSnapshot = SceneSnapshot['nodes'][number];
type SceneAnimationClipInfo = SceneSnapshot['animations'][number];
type SceneCameraState = NonNullable<SceneSnapshot['activeCamera']>;
type SceneMeshPrimitiveSnapshot = NonNullable<SceneNodeSnapshot['primitives']>[number];
type SceneAssetHandle = NonNullable<SceneNodeSnapshot['mesh']>;
type SceneBounds3 = NonNullable<SceneNodeSnapshot['worldBounds']>;
type SceneVec3 = NonNullable<NonNullable<SceneNodeSnapshot['transform']>['position']>;
type SceneQuat = NonNullable<NonNullable<SceneNodeSnapshot['transform']>['rotation']>;

export interface SceneControlWebSocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type SceneControlWebSocketFactory = (url: string) => SceneControlWebSocketLike;

export interface SceneControlSocketConfig {
  url: string;
  sceneId?: string;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  requestTimeoutMs?: number;
  webSocketFactory?: SceneControlWebSocketFactory;
  onReady?: SceneControlMessageHandler<SceneControlReadyMessage>;
  onAck?: SceneControlMessageHandler<SceneCommandAck>;
  onDelta?: SceneControlMessageHandler<SceneDelta>;
  onSnapshot?: SceneControlMessageHandler<SceneSnapshot>;
  onRenderFrameMeta?: SceneControlMessageHandler<RenderFrameMeta>;
  onViewportMetadata?: SceneControlMessageHandler<ViewportMetadataEvent>;
  onViewportEvent?: SceneControlMessageHandler<ViewportEvent>;
  onCharacterPreviewState?: SceneControlMessageHandler<CharacterPreviewModeStatePayload>;
  onControlFlowDiagnostic?: SceneControlMessageHandler<ViewportControlFlowDiagnostic>;
  onError?: SceneControlErrorHandler;
}

export interface SceneControlReadyMessage {
  type: 'ready';
  protocol?: string;
  serverRevision?: number;
  lastClientRevision?: number;
}

export interface SceneViewportResolution {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface SceneViewportCameraUpdate {
  sceneId?: string;
  sceneRevision?: number;
  viewportId?: string;
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
  fovY?: number;
  resolution?: SceneViewportResolution;
  streamProfile?: 'default' | 'interactive';
  profileTtlMs?: number;
}

export interface SceneViewportCameraAck {
  type: 'viewportCameraAck';
  requestId?: string;
  sceneId?: string;
  viewportId?: string;
  status?: 'applied' | 'rejected';
  revision?: number;
  acceptedRevision?: number;
  error?: string;
}

export class SceneViewportCameraRejectedError extends Error {
  override name = 'SceneViewportCameraRejectedError';
}

interface PendingAck {
  resolve: (ack: SceneCommandAck) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PendingViewportCamera {
  resolve: (ack: SceneViewportCameraAck) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PendingQuery {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface SceneControlSocketMessage {
  type?: unknown;
  [key: string]: unknown;
}

const WS_OPEN = 1;
const DEFAULT_RECONNECT_DELAY_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class SceneControlSocket {
  private readonly config: Required<
    Pick<SceneControlSocketConfig, 'reconnect' | 'reconnectDelayMs' | 'requestTimeoutMs'>
  > &
    Omit<SceneControlSocketConfig, 'reconnect' | 'reconnectDelayMs' | 'requestTimeoutMs'>;
  private socket: SceneControlWebSocketLike | null = null;
  private connectionState: ViewportControlConnectionState = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private lastKnownRevision: number | undefined;
  private latestControlRevision: number | undefined;
  private latestControlAppliedSeq: number | undefined;
  private readonly latestFrameMetaByScene = new Map<string, RenderFrameMeta>();
  private readonly latestFrameMetaByViewport = new Map<string, RenderFrameMeta>();
  private readonly pendingAcks = new Map<number, PendingAck>();
  private readonly pendingViewportCameras = new Map<string, PendingViewportCamera>();
  private readonly pendingQueries = new Map<string, PendingQuery>();
  private nextViewportCameraRequestId = 1;
  private nextQueryId = 1;

  constructor(config: SceneControlSocketConfig) {
    this.config = {
      ...config,
      reconnect: config.reconnect ?? true,
      reconnectDelayMs: config.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
      requestTimeoutMs: normalizeRequestTimeoutMs(config.requestTimeoutMs),
    };
  }

  connect(): void {
    this.manuallyClosed = false;
    this.clearReconnectTimer();
    this.setConnectionState('connecting');
    this.reportControlFlowDiagnostic({
      kind: 'connection',
      severity: 'info',
      code: 'scene-control-connecting',
      message: 'Scene control socket is connecting.',
      sceneId: this.config.sceneId,
      connectionState: 'connecting',
      timestamp: Date.now(),
    });
    const socket = this.createSocket(this.config.url);
    this.socket = socket;

    socket.onopen = () => {
      this.setConnectionState('connected');
      this.reportControlFlowDiagnostic({
        kind: 'connection',
        severity: 'info',
        code: 'scene-control-connected',
        message: 'Scene control socket connected.',
        sceneId: this.config.sceneId,
        connectionState: 'connected',
        timestamp: Date.now(),
      });
      this.sendHello(this.lastKnownRevision);
      if (this.lastKnownRevision !== undefined) {
        this.resync();
      } else if (this.config.sceneId) {
        this.subscribe(this.config.sceneId);
      }
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () => {
      if (this.manuallyClosed || this.socket !== socket) return;
      this.setConnectionState('degraded');
      this.reportControlFlowDiagnostic({
        kind: 'connection',
        severity: 'error',
        code: 'scene-control-error',
        message: 'Scene control WebSocket reported an error.',
        sceneId: this.config.sceneId,
        connectionState: 'degraded',
        degradedReason: 'control-disconnected',
        timestamp: Date.now(),
      });
      this.reportError(new Error('Scene control WebSocket error'));
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      if (this.manuallyClosed || this.socket !== null) {
        return;
      }
      this.setConnectionState(this.config.reconnect ? 'reconnecting' : 'disconnected');
      this.reportControlFlowDiagnostic({
        kind: 'connection',
        severity: this.config.reconnect ? 'warning' : 'error',
        code: this.config.reconnect ? 'scene-control-reconnecting' : 'scene-control-disconnected',
        message: this.config.reconnect
          ? 'Scene control socket closed; reconnecting.'
          : 'Scene control socket closed.',
        sceneId: this.config.sceneId,
        connectionState: this.config.reconnect ? 'reconnecting' : 'disconnected',
        degradedReason: this.config.reconnect ? 'control-reconnecting' : 'control-disconnected',
        timestamp: Date.now(),
      });
      this.rejectPending(new Error('Scene control WebSocket closed'));
      if (!this.manuallyClosed && this.config.reconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.config.reconnectDelayMs);
      }
    };
  }

  close(code?: number, reason?: string): void {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.rejectPending(new Error('Scene control socket closed by client'));
    this.socket?.close(code, reason);
    this.socket = null;
    this.setConnectionState('closed');
    this.reportControlFlowDiagnostic({
      kind: 'connection',
      severity: 'info',
      code: 'scene-control-closed',
      message: 'Scene control socket closed by client.',
      sceneId: this.config.sceneId,
      connectionState: 'closed',
      timestamp: Date.now(),
    });
  }

  sendHello(lastRevision?: number): void {
    this.send({ type: 'hello', lastRevision });
  }

  subscribe(sceneId = this.config.sceneId): void {
    this.send({ type: 'subscribe', sceneId });
  }

  sendCommand(envelope: SceneCommandEnvelope): Promise<SceneCommandAck> {
    return new Promise((resolve, reject) => {
      const timeout = this.createPendingTimeout(() => {
        const pending = this.clearPendingAck(envelope.seq);
        if (!pending) return;
        const error = new Error(
          `Scene command ${envelope.seq} timed out after ${this.config.requestTimeoutMs}ms`,
        );
        this.reportControlFlowDiagnostic({
          kind: 'command',
          severity: 'error',
          code: 'scene-command-timeout',
          message: error.message,
          sceneId: this.config.sceneId,
          seq: envelope.seq,
          commandState: 'timeout',
          revision: envelope.baseRevision,
          timestamp: Date.now(),
        });
        pending.reject(error);
        this.requestResyncAfterPendingTimeout();
      });
      this.pendingAcks.set(envelope.seq, { resolve, reject, timeout });
      this.reportControlFlowDiagnostic({
        kind: 'command',
        severity: 'info',
        code: 'scene-command-queued',
        message: 'Scene command queued for scene-control transport.',
        sceneId: this.config.sceneId,
        seq: envelope.seq,
        commandState: 'queued',
        revision: envelope.baseRevision,
        timestamp: Date.now(),
      });
      try {
        this.send({ type: 'command', envelope });
        this.reportControlFlowDiagnostic({
          kind: 'command',
          severity: 'info',
          code: 'scene-command-sent',
          message: 'Scene command sent over scene-control transport.',
          sceneId: this.config.sceneId,
          seq: envelope.seq,
          commandState: 'sent',
          revision: envelope.baseRevision,
          timestamp: Date.now(),
        });
      } catch (error) {
        this.clearPendingAck(envelope.seq);
        this.reportControlFlowDiagnostic({
          kind: 'command',
          severity: 'error',
          code: 'scene-command-send-failed',
          message: toError(error).message,
          sceneId: this.config.sceneId,
          seq: envelope.seq,
          commandState: 'error',
          degradedReason: 'control-disconnected',
          timestamp: Date.now(),
        });
        reject(toError(error));
      }
    });
  }

  query(query: string, payload?: Record<string, unknown>, requestId?: string): Promise<unknown> {
    const id = requestId ?? `query-${this.nextQueryId++}`;
    return new Promise((resolve, reject) => {
      const timeout = this.createPendingTimeout(() => {
        const pending = this.clearPendingQuery(id);
        if (!pending) return;
        const error = new Error(
          `Scene query ${id} timed out after ${this.config.requestTimeoutMs}ms`,
        );
        this.reportControlFlowDiagnostic({
          kind: 'query',
          severity: 'error',
          code: 'scene-query-timeout',
          message: error.message,
          sceneId: this.config.sceneId,
          correlationId: id,
          degradedReason: 'query-failed',
          timestamp: Date.now(),
          details: serializableDetails({ query }),
        });
        pending.reject(error);
      });
      this.pendingQueries.set(id, { resolve, reject, timeout });
      try {
        this.send({ type: 'query', query, requestId: id, payload });
      } catch (error) {
        this.clearPendingQuery(id);
        this.reportControlFlowDiagnostic({
          kind: 'query',
          severity: 'error',
          code: 'scene-query-send-failed',
          message: toError(error).message,
          sceneId: this.config.sceneId,
          correlationId: id,
          degradedReason: 'query-failed',
          timestamp: Date.now(),
          details: serializableDetails({ query }),
        });
        reject(toError(error));
      }
    });
  }

  querySelection(query: SelectionQuery, requestId?: string): Promise<SelectionQueryResult> {
    return this.query(
      'selectionQuery',
      {
        viewportId: query.viewportId,
        x: query.x,
        y: query.y,
        mask: query.mask,
        mode: query.mode,
      },
      requestId,
    ).then(normalizeSelectionQueryResult);
  }

  updateViewportCamera(
    update: SceneViewportCameraUpdate,
    requestId?: string,
  ): Promise<SceneViewportCameraAck> {
    const id = requestId ?? `viewport-camera-${this.nextViewportCameraRequestId++}`;
    return new Promise((resolve, reject) => {
      const timeout = this.createPendingTimeout(() => {
        const pending = this.clearPendingViewportCamera(id);
        if (!pending) return;
        const error = new Error(
          `Viewport camera update ${id} timed out after ${this.config.requestTimeoutMs}ms`,
        );
        this.reportControlFlowDiagnostic({
          kind: 'command',
          severity: 'error',
          code: 'viewport-camera-timeout',
          message: error.message,
          sceneId: update.sceneId ?? this.config.sceneId,
          viewportId: update.viewportId,
          correlationId: id,
          commandState: 'timeout',
          revision: update.sceneRevision,
          timestamp: Date.now(),
        });
        pending.reject(error);
      });
      this.pendingViewportCameras.set(id, { resolve, reject, timeout });
      try {
        this.send({ type: 'viewportCamera', requestId: id, ...cameraUpdateToMessage(update) });
      } catch (error) {
        this.clearPendingViewportCamera(id);
        reject(toError(error));
      }
    });
  }

  sendViewportCameraLatest(update: SceneViewportCameraUpdate, requestId?: string): void {
    this.send({
      type: 'viewportCamera',
      ...(requestId ? { requestId } : {}),
      ...cameraUpdateToMessage(update),
    });
  }

  resync(sceneId = this.config.sceneId): void {
    this.send({ type: 'resync', sceneId });
  }

  requestKeyframe(viewportId?: string): void {
    this.send({ type: 'requestKeyframe', viewportId });
  }

  sendViewportCommand(command: ViewportCommand): Promise<ViewportEvent> {
    const requestId = command.correlationId;
    return new Promise((resolve, reject) => {
      const timeout = this.createPendingTimeout(() => {
        const pending = this.clearPendingQuery(requestId);
        if (!pending) return;
        const error = new Error(
          `Viewport command ${command.correlationId} timed out after ${this.config.requestTimeoutMs}ms`,
        );
        this.reportControlFlowDiagnostic({
          kind: 'command',
          severity: 'error',
          code: 'viewport-command-timeout',
          message: error.message,
          sceneId: command.sceneId,
          viewportId: command.viewportId,
          seq: command.seq,
          correlationId: command.correlationId,
          commandState: 'timeout',
          revision: command.baseRevision,
          timestamp: Date.now(),
        });
        pending.reject(error);
        this.requestResyncAfterPendingTimeout(command.sceneId);
      });
      this.pendingQueries.set(requestId, {
        resolve: (result) => {
          if (isViewportEvent(result)) {
            resolve(result);
            return;
          }
          reject(new Error('Invalid viewport event result'));
        },
        reject,
        timeout,
      });
      this.reportControlFlowDiagnostic({
        kind: 'command',
        severity: 'info',
        code: 'viewport-command-queued',
        message: 'Viewport command queued for scene-control transport.',
        sceneId: command.sceneId,
        viewportId: command.viewportId,
        seq: command.seq,
        correlationId: command.correlationId,
        commandState: 'queued',
        revision: command.baseRevision,
        timestamp: Date.now(),
      });
      try {
        this.send({ type: 'viewportCommand', requestId, command });
        this.reportControlFlowDiagnostic({
          kind: 'command',
          severity: 'info',
          code: 'viewport-command-sent',
          message: 'Viewport command sent over scene-control transport.',
          sceneId: command.sceneId,
          viewportId: command.viewportId,
          seq: command.seq,
          correlationId: command.correlationId,
          commandState: 'sent',
          revision: command.baseRevision,
          timestamp: Date.now(),
        });
      } catch (error) {
        this.clearPendingQuery(requestId);
        this.reportControlFlowDiagnostic({
          kind: 'command',
          severity: 'error',
          code: 'viewport-command-send-failed',
          message: toError(error).message,
          sceneId: command.sceneId,
          viewportId: command.viewportId,
          seq: command.seq,
          correlationId: command.correlationId,
          commandState: 'error',
          degradedReason: 'control-disconnected',
          timestamp: Date.now(),
        });
        reject(toError(error));
      }
    });
  }

  heartbeat(nonce?: string): void {
    this.send({ type: 'heartbeat', nonce });
  }

  getPendingAckCount(): number {
    return this.pendingAcks.size;
  }

  getConnectionState(): ViewportControlConnectionState {
    return this.connectionState;
  }

  isOpen(): boolean {
    return this.socket?.readyState === WS_OPEN;
  }

  private createSocket(url: string): SceneControlWebSocketLike {
    if (this.config.webSocketFactory) {
      return this.config.webSocketFactory(url);
    }
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not available; provide webSocketFactory');
    }
    return createNativeWebSocket(url);
  }

  private send(message: Record<string, unknown>): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WS_OPEN) {
      throw new Error('Scene control socket is not open');
    }
    socket.send(JSON.stringify(stripUndefined(message)));
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      this.reportError(new Error('Scene control message must be text JSON'));
      return;
    }

    const message = parseJsonObject(data);
    if (!message) {
      this.reportError(new Error('Invalid scene control JSON message'));
      return;
    }

    switch (message.type) {
      case 'ready':
        this.handleReady(message);
        break;
      case 'ack':
        this.handleAck(message.ack);
        break;
      case 'delta':
        this.handleDelta(message.delta);
        break;
      case 'snapshot':
        this.handleSnapshot(readSnapshotMessagePayload(message));
        break;
      case 'queryResult':
        this.handleQueryResult(message);
        break;
      case 'viewportCameraAck':
        this.handleViewportCameraAck(message);
        break;
      case 'renderFrameMeta':
        this.handleRenderFrameMeta(message.meta);
        break;
      case 'viewportMetadata':
        this.handleViewportMetadata(message.event ?? message);
        break;
      case 'viewportEvent':
        this.handleViewportEvent(message);
        break;
      case 'characterPreviewState':
        this.handleCharacterPreviewState(message.state ?? message.payload ?? message);
        break;
      case 'heartbeat':
        break;
      case 'error':
        this.handleErrorMessage(message);
        break;
      default:
        this.reportError(new Error(`Unsupported scene control message: ${String(message.type)}`));
    }
  }

  private handleReady(value: unknown): void {
    const ready = readSceneControlReadyMessage(value);
    if (!ready) {
      this.reportError(new Error('Invalid scene control ready message'));
      return;
    }
    this.config.onReady?.(ready);
  }

  private handleAck(value: unknown): void {
    const ack = readSceneCommandAck(value);
    if (!ack) {
      this.reportError(new Error('Invalid scene command ack'));
      return;
    }
    const pending = this.pendingAcks.get(ack.seq);
    if (pending) {
      this.clearPendingAck(ack.seq);
      pending.resolve(ack);
    }
    const ackState =
      ack.status === 'applied' ? 'ack' : ack.status === 'superseded' ? 'superseded' : 'error';
    const ackCode =
      ack.status === 'applied'
        ? 'scene-command-ack'
        : ack.status === 'superseded'
          ? 'scene-command-superseded'
          : 'scene-command-rejected';
    this.reportControlFlowDiagnostic({
      kind: 'command',
      severity: ack.status === 'applied' ? 'info' : 'warning',
      code: ackCode,
      message:
        ack.status === 'applied'
          ? 'Scene command acknowledged.'
          : ack.status === 'superseded'
            ? (ack.error ?? 'Scene command was superseded by a newer command.')
            : (ack.error ?? 'Scene command was not applied.'),
      sceneId: this.config.sceneId,
      seq: ack.seq,
      commandState: ackState,
      degradedReason: ack.status === 'rejected' ? 'command-rejected' : undefined,
      revision: ack.revision,
      appliedSeq: ack.appliedSeq,
      timestamp: Date.now(),
    });
    if (ack.status === 'applied') {
      this.reportAckBeforeFrameForSceneAck(ack);
      this.rememberControlProgress(ack.revision, ack.appliedSeq);
    }
    this.config.onAck?.(ack);
  }

  private handleDelta(value: unknown): void {
    const delta = readSceneDelta(value);
    if (!delta) {
      this.reportError(new Error('Invalid scene delta'));
      return;
    }
    if (!this.shouldApplyDelta(delta)) {
      this.reportControlFlowDiagnostic({
        kind: 'snapshot',
        severity: 'warning',
        code: 'scene-delta-stale-or-gapped',
        message: 'Scene delta was stale or gapped and triggered resync handling.',
        sceneId: this.config.sceneId,
        revision: delta.revision,
        appliedSeq: delta.appliedSeq,
        degradedReason: 'snapshot-stale',
        timestamp: Date.now(),
      });
      return;
    }
    this.rememberAppliedRevision(delta.revision);
    this.config.onDelta?.(delta);
  }

  private handleSnapshot(value: unknown): void {
    const snapshot = readSceneSnapshot(value);
    if (!snapshot) {
      this.reportError(new Error('Invalid scene snapshot'));
      return;
    }
    this.rememberAppliedRevision(snapshot.revision);
    this.config.onSnapshot?.(snapshot);
  }

  private handleQueryResult(message: SceneControlSocketMessage): void {
    if (isRecord(message.snapshot)) {
      this.handleSnapshot(message.snapshot);
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    if (!requestId) return;

    const pending = this.pendingQueries.get(requestId);
    if (!pending) return;
    this.clearPendingQuery(requestId);
    pending.resolve(message.result ?? message.snapshot ?? message);
  }

  private handleViewportEvent(message: SceneControlSocketMessage): void {
    const event = readViewportEvent(message.event ?? message);
    if (!event) {
      this.reportError(new Error('Invalid viewport event'));
      return;
    }
    const requestId = readString(message.requestId);
    if (requestId) {
      const pending = this.pendingQueries.get(requestId);
      if (pending) {
        this.clearPendingQuery(requestId);
        pending.resolve(event);
      }
    }
    if (event.status === 'error') {
      this.reportControlFlowDiagnostic({
        kind: 'command',
        severity: 'error',
        code: 'viewport-command-rejected',
        message: event.error?.message ?? 'Viewport command was rejected.',
        sceneId: event.sceneId,
        viewportId: event.viewportId,
        seq: event.ackSeq,
        commandState: 'error',
        degradedReason: 'command-rejected',
        revision: event.revision,
        appliedSeq: event.appliedSeq,
        timestamp: Date.now(),
      });
    } else if (event.ackSeq > 0) {
      this.reportControlFlowDiagnostic({
        kind: 'command',
        severity: 'info',
        code: 'viewport-command-ack',
        message: 'Viewport command acknowledged.',
        sceneId: event.sceneId,
        viewportId: event.viewportId,
        seq: event.ackSeq,
        commandState: 'ack',
        revision: event.revision,
        appliedSeq: event.appliedSeq,
        timestamp: Date.now(),
      });
      this.reportAckBeforeFrameForViewportEvent(event);
      this.rememberControlProgress(event.revision, event.appliedSeq ?? event.ackSeq);
    }
    this.config.onViewportEvent?.(event);
  }

  private handleViewportCameraAck(message: SceneControlSocketMessage): void {
    const ack = message as SceneViewportCameraAck;
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    if (!requestId) return;

    const pending = this.pendingViewportCameras.get(requestId);
    if (!pending) return;
    this.clearPendingViewportCamera(requestId);
    if (ack.status === 'rejected') {
      pending.reject(
        new SceneViewportCameraRejectedError(ack.error ?? 'Viewport camera update rejected'),
      );
      return;
    }
    pending.resolve(ack);
  }

  private handleRenderFrameMeta(value: unknown): void {
    const meta = readRenderFrameMeta(value);
    if (!meta) {
      this.reportError(new Error('Invalid render frame metadata'));
      return;
    }
    const diagnostics =
      isRecord(value) && isRecord(value.diagnostics) ? value.diagnostics : undefined;
    const metadataState = readString(diagnostics?.metadataState);
    const metadataDelayMs = readFiniteNumber(diagnostics?.metadataDelayMs);
    if (metadataState === 'delayed' || metadataDelayMs !== undefined) {
      this.reportControlFlowDiagnostic({
        kind: 'metadata',
        severity: 'warning',
        code: 'scene-control-render-frame-meta-delayed',
        message: 'Render frame metadata indicates delayed viewport alignment data.',
        sceneId: meta.sceneId,
        viewportId: meta.viewportId,
        streamId: meta.streamId,
        revision: meta.sceneRevision,
        appliedSeq: meta.appliedSeq,
        metadataState: 'delayed',
        degradedReason: 'metadata-delayed',
        timestamp: Date.now(),
        details: serializableDetails({
          frameId: meta.frameId,
          ptsUs: meta.ptsUs,
          metadataDelayMs,
        }),
      });
    }
    this.reportStaleRenderFrameMeta(meta);
    this.rememberFrameMeta(meta);
    this.config.onRenderFrameMeta?.(meta);
  }

  private handleViewportMetadata(value: unknown): void {
    const event = readViewportMetadataEvent(value);
    if (!event) {
      this.reportError(new Error('Invalid viewport metadata event'));
      return;
    }
    this.rememberViewportMetadata(event);
    this.config.onViewportMetadata?.(event);
    this.reportControlFlowDiagnostic({
      kind: 'metadata',
      severity: 'info',
      code: 'scene-control-viewport-metadata',
      message: 'Viewport metadata received through scene-control.',
      sceneId: event.sceneId,
      viewportId: event.viewportId,
      streamId: event.meta.streamId,
      revision: event.revision,
      appliedSeq: event.appliedSeq,
      metadataState: 'fresh',
      timestamp: Date.now(),
      details: serializableDetails({
        frameId: event.meta.frameId,
        ptsUs: event.meta.ptsUs,
      }),
    });
  }

  private handleCharacterPreviewState(value: unknown): void {
    if (!isCharacterPreviewModeStatePayload(value)) {
      this.reportError(new Error('Invalid character preview mode state'));
      return;
    }
    this.config.onCharacterPreviewState?.(value);
  }

  private shouldApplyDelta(delta: SceneDelta): boolean {
    const value = delta.revision;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.reportError(new Error('Scene delta revision must be a finite number'));
      this.resync();
      return false;
    }

    if (this.lastKnownRevision === undefined) {
      return true;
    }

    if (value <= this.lastKnownRevision) {
      if (hasDeltaOnlyEnvironmentDiagnostics(delta) && value === this.lastKnownRevision) {
        return true;
      }
      return false;
    }

    if (value > this.lastKnownRevision + 1) {
      this.resync();
      return false;
    }

    return true;
  }

  private rememberAppliedRevision(value: unknown): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
      this.lastKnownRevision = Math.max(this.lastKnownRevision ?? 0, value);
    }
  }

  private rememberControlProgress(revision: number, appliedSeq: number): void {
    this.latestControlRevision = Math.max(this.latestControlRevision ?? 0, revision);
    this.latestControlAppliedSeq = Math.max(this.latestControlAppliedSeq ?? 0, appliedSeq);
  }

  private rememberFrameMeta(meta: RenderFrameMeta): void {
    const sceneId = meta.sceneId ?? this.config.sceneId;
    if (sceneId) {
      this.latestFrameMetaByScene.set(sceneId, meta);
      this.latestFrameMetaByViewport.set(frameMetaViewportKey(sceneId, meta.viewportId), meta);
    }
  }

  private rememberViewportMetadata(event: ViewportMetadataEvent): void {
    const meta = renderFrameMetaFromViewportMetadata(event);
    this.latestFrameMetaByScene.set(event.sceneId, meta);
    this.latestFrameMetaByViewport.set(frameMetaViewportKey(event.sceneId, event.viewportId), meta);
    this.rememberControlProgress(event.revision, event.appliedSeq);
  }

  private reportAckBeforeFrameForSceneAck(ack: SceneCommandAck): void {
    const sceneId = this.config.sceneId;
    if (!sceneId) return;
    const latest = this.latestFrameMetaByScene.get(sceneId);
    if (isFrameMetaCompatible(latest, ack.revision, ack.appliedSeq)) return;

    this.reportControlFlowDiagnostic({
      kind: 'metadata',
      severity: 'info',
      code: 'scene-command-ack-before-frame',
      message: 'Scene command acknowledgement arrived before compatible render frame metadata.',
      sceneId,
      seq: ack.seq,
      revision: ack.revision,
      appliedSeq: ack.appliedSeq,
      metadataState: 'ack-before-frame',
      degradedReason: 'ack-before-frame',
      timestamp: Date.now(),
      details: serializableDetails({
        lastFrameRevision: latest?.sceneRevision,
        lastFrameAppliedSeq: latest?.appliedSeq,
        expectedRevision: ack.revision,
        expectedAppliedSeq: ack.appliedSeq,
      }),
    });
  }

  private reportAckBeforeFrameForViewportEvent(event: ViewportEvent): void {
    if (!event.viewportId) return;
    const expectedAppliedSeq = event.appliedSeq ?? event.ackSeq;
    const latest = this.latestFrameMetaByViewport.get(
      frameMetaViewportKey(event.sceneId, event.viewportId),
    );
    if (isFrameMetaCompatible(latest, event.revision, expectedAppliedSeq)) return;

    this.reportControlFlowDiagnostic({
      kind: 'metadata',
      severity: 'info',
      code: 'viewport-command-ack-before-frame',
      message: 'Viewport command acknowledgement arrived before compatible render frame metadata.',
      sceneId: event.sceneId,
      viewportId: event.viewportId,
      seq: event.ackSeq,
      revision: event.revision,
      appliedSeq: expectedAppliedSeq,
      metadataState: 'ack-before-frame',
      degradedReason: 'ack-before-frame',
      timestamp: Date.now(),
      details: serializableDetails({
        lastFrameRevision: latest?.sceneRevision,
        lastFrameAppliedSeq: latest?.appliedSeq,
        expectedRevision: event.revision,
        expectedAppliedSeq,
      }),
    });
  }

  private reportStaleRenderFrameMeta(meta: RenderFrameMeta): void {
    const expectedRevision = this.latestControlRevision;
    const expectedAppliedSeq = this.latestControlAppliedSeq;
    const staleRevision = expectedRevision !== undefined && meta.sceneRevision < expectedRevision;
    const staleAppliedSeq =
      expectedAppliedSeq !== undefined && meta.appliedSeq < expectedAppliedSeq;
    if (!staleRevision && !staleAppliedSeq) return;

    this.reportControlFlowDiagnostic({
      kind: 'metadata',
      severity: 'warning',
      code: 'scene-control-render-frame-meta-stale',
      message: 'Render frame metadata is older than the latest acknowledged control state.',
      sceneId: meta.sceneId ?? this.config.sceneId,
      viewportId: meta.viewportId,
      streamId: meta.streamId,
      revision: meta.sceneRevision,
      appliedSeq: meta.appliedSeq,
      metadataState: 'stale',
      degradedReason: 'metadata-stale',
      timestamp: Date.now(),
      details: serializableDetails({
        expectedRevision,
        expectedAppliedSeq,
        frameId: meta.frameId,
        ptsUs: meta.ptsUs,
      }),
    });
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingAcks.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingAcks.clear();
    for (const pending of this.pendingViewportCameras.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingViewportCameras.clear();
    for (const pending of this.pendingQueries.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingQueries.clear();
  }

  private clearPendingAck(seq: number): PendingAck | undefined {
    const pending = this.pendingAcks.get(seq);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(seq);
    }
    return pending;
  }

  private clearPendingQuery(requestId: string): PendingQuery | undefined {
    const pending = this.pendingQueries.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingQueries.delete(requestId);
    }
    return pending;
  }

  private clearPendingViewportCamera(requestId: string): PendingViewportCamera | undefined {
    const pending = this.pendingViewportCameras.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingViewportCameras.delete(requestId);
    }
    return pending;
  }

  private createPendingTimeout(onTimeout: () => void): ReturnType<typeof setTimeout> {
    return setTimeout(onTimeout, this.config.requestTimeoutMs);
  }

  private requestResyncAfterPendingTimeout(sceneId = this.config.sceneId): void {
    if (!sceneId) return;
    try {
      this.resync(sceneId);
      this.reportControlFlowDiagnostic({
        kind: 'snapshot',
        severity: 'warning',
        code: 'scene-control-resync-after-timeout',
        message: 'Scene control requested an authoritative refresh after a timed-out command.',
        sceneId,
        commandState: 'resyncing',
        degradedReason: 'snapshot-stale',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.reportError(toError(error));
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private reportError(error: Error): void {
    this.config.onError?.(error);
  }

  private reportControlFlowDiagnostic(diagnostic: ViewportControlFlowDiagnostic): void {
    this.config.onControlFlowDiagnostic?.(diagnostic);
  }

  private setConnectionState(state: ViewportControlConnectionState): void {
    this.connectionState = state;
  }

  private handleErrorMessage(message: SceneControlSocketMessage): void {
    const error = new Error(String(message.error ?? 'Scene control error'));
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    if (requestId) {
      const pending = this.pendingQueries.get(requestId);
      if (pending) {
        this.clearPendingQuery(requestId);
        pending.reject(error);
        this.reportControlFlowDiagnostic({
          kind: 'query',
          severity: 'error',
          code: 'scene-query-failed',
          message: error.message,
          sceneId: this.config.sceneId,
          correlationId: requestId,
          degradedReason: 'query-failed',
          timestamp: Date.now(),
        });
      }
      const pendingViewportCamera = this.pendingViewportCameras.get(requestId);
      if (pendingViewportCamera) {
        this.clearPendingViewportCamera(requestId);
        pendingViewportCamera.reject(error);
      }
    } else if (this.pendingViewportCameras.size > 0) {
      for (const pending of this.pendingViewportCameras.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      this.pendingViewportCameras.clear();
    }
    this.reportError(error);
  }
}

function normalizeRequestTimeoutMs(value: number | undefined): number {
  if (value !== undefined && Number.isFinite(value) && value > 0) {
    return value;
  }
  return DEFAULT_REQUEST_TIMEOUT_MS;
}

function serializableDetails(
  value: Record<string, string | number | boolean | undefined>,
): ViewportSerializableRecord | undefined {
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined && (typeof entry[1] !== 'number' || Number.isFinite(entry[1])),
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function frameMetaViewportKey(sceneId: string, viewportId: string): string {
  return `${sceneId}:${viewportId}`;
}

function isFrameMetaCompatible(
  meta: RenderFrameMeta | undefined,
  expectedRevision: number,
  expectedAppliedSeq: number,
): boolean {
  return (
    meta !== undefined &&
    meta.sceneRevision >= expectedRevision &&
    meta.appliedSeq >= expectedAppliedSeq
  );
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function cameraUpdateToMessage(update: SceneViewportCameraUpdate): Record<string, unknown> {
  return stripUndefined({
    sceneId: update.sceneId,
    sceneRevision: update.sceneRevision,
    viewportId: update.viewportId,
    position: update.position,
    target: update.target,
    up: update.up,
    fovY: update.fovY,
    resolution: update.resolution,
    streamProfile: update.streamProfile,
    profileTtlMs: update.profileTtlMs,
  });
}

function readSceneControlReadyMessage(value: unknown): SceneControlReadyMessage | null {
  if (!isRecord(value) || value.type !== 'ready') return null;
  const ready: SceneControlReadyMessage = { type: 'ready' };
  const protocol = readString(value.protocol);
  if (protocol !== undefined) ready.protocol = protocol;
  const serverRevision = readFiniteNumber(value.serverRevision);
  if (serverRevision !== undefined) ready.serverRevision = serverRevision;
  const lastClientRevision = readFiniteNumber(value.lastClientRevision);
  if (lastClientRevision !== undefined) ready.lastClientRevision = lastClientRevision;
  return ready;
}

function readSceneCommandAck(value: unknown): SceneCommandAck | null {
  if (!isRecord(value)) return null;
  const seq = readFiniteNumber(value.seq);
  const appliedSeq = readFiniteNumber(value.appliedSeq);
  const baseRevision = readFiniteNumber(value.baseRevision);
  const revision = readFiniteNumber(value.revision);
  const status = value.status;
  if (
    seq === undefined ||
    appliedSeq === undefined ||
    baseRevision === undefined ||
    revision === undefined ||
    (status !== 'applied' && status !== 'rejected' && status !== 'superseded')
  ) {
    return null;
  }
  const ack: SceneCommandAck = { seq, appliedSeq, baseRevision, revision, status };
  const error = readString(value.error);
  if (error !== undefined) ack.error = error;
  return ack;
}

function readSceneDelta(value: unknown): SceneDelta | null {
  return isSceneDelta(value) ? value : null;
}

function readViewportEvent(value: unknown): ViewportEvent | null {
  return isViewportEvent(value) ? value : null;
}

function readViewportMetadataEvent(value: unknown): ViewportMetadataEvent | null {
  return isViewportMetadataEvent(value) ? value : null;
}

function renderFrameMetaFromViewportMetadata(event: ViewportMetadataEvent): RenderFrameMeta {
  return {
    streamId: event.meta.streamId,
    viewportId: event.meta.viewportId,
    frameId: event.meta.frameId,
    ptsUs: event.meta.ptsUs,
    durationUs: event.meta.durationUs,
    isKeyframe: false,
    sceneRevision: event.meta.sceneRevision ?? event.meta.revision,
    appliedSeq: event.meta.appliedSeq,
    sceneId: event.meta.sceneId,
    frameTimestamp: event.meta.frameTimestamp,
    viewTransform: [...event.meta.viewTransform],
    projectionJson:
      event.meta.projection === undefined ? undefined : JSON.stringify(event.meta.projection),
    diagnostics: event.meta.diagnostics,
  };
}

function readSceneSnapshot(value: unknown): SceneSnapshot | null {
  if (typeof value === 'string') {
    return readSceneSnapshot(parseJsonObject(value));
  }
  if (!isRecord(value)) return null;

  const nodes = Array.isArray(value.nodes)
    ? value.nodes
        .map(readSceneNodeSnapshot)
        .filter((node): node is SceneNodeSnapshot => node !== null)
    : [];
  const animations = Array.isArray(value.animations)
    ? value.animations
        .map(readAnimationClipInfo)
        .filter((clip): clip is SceneAnimationClipInfo => clip !== null)
    : [];

  const snapshot: SceneSnapshot = {
    sceneId: readString(value.sceneId) ?? readString(value.scene_id) ?? 'default',
    revision: readFiniteNumber(value.revision) ?? 0,
    nodes,
    animations,
  };

  const activeCamera = readSceneCameraState(value.activeCamera ?? value.active_camera);
  if (activeCamera !== undefined) {
    snapshot.activeCamera = activeCamera;
  }
  const environment = readEnvironmentPatch(value.environment);
  if (environment !== undefined) {
    snapshot.environment = environment;
  }

  return snapshot;
}

function readSnapshotMessagePayload(message: SceneControlSocketMessage): unknown {
  if (message.snapshot !== undefined) {
    return message.snapshot;
  }
  if (message.result !== undefined) {
    return message.result;
  }
  return message;
}

function isSceneDelta(value: unknown): value is SceneDelta {
  if (!isRecord(value)) return false;
  if (readFiniteNumber(value.revision) === undefined) return false;
  if (value.appliedSeq !== undefined && readFiniteNumber(value.appliedSeq) === undefined) {
    return false;
  }
  return (
    isOptionalRecordArray(value.updatedTransforms) &&
    isOptionalRecordArray(value.updatedMorphWeights) &&
    isOptionalRecord(value.animationState) &&
    isOptionalRecordArray(value.addedNodes) &&
    isOptionalStringArray(value.removedNodes) &&
    isOptionalRecordArray(value.updatedHierarchy) &&
    isOptionalRecordArray(value.updatedVisibility) &&
    isOptionalRecordArray(value.updatedLayers) &&
    isOptionalRecordArray(value.updatedMaterials) &&
    isOptionalRecordArray(value.updatedAssetReferences) &&
    isOptionalRecordArray(value.updatedLights) &&
    isOptionalRecord(value.activeCamera) &&
    isOptionalRecordArray(value.updatedCameras) &&
    isOptionalRecordArray(value.topologyChanges) &&
    isOptionalRecordArray(value.modelingSessions) &&
    isOptionalRecord(value.overlay) &&
    isOptionalRecordArray(value.updatedCharacterMorphWeights) &&
    isOptionalRecordArray(value.updatedCharacterMaterials) &&
    isOptionalRecordArray(value.updatedSkeletonPose) &&
    isOptionalRecordArray(value.characterOverrides) &&
    (value.environment === null || isOptionalRecord(value.environment)) &&
    isOptionalRecordArray(value.selectedTargets) &&
    isOptionalRecordArray(value.environmentDiagnostics)
  );
}

function hasDeltaOnlyEnvironmentDiagnostics(delta: SceneDelta): boolean {
  return (
    Array.isArray(delta.environmentDiagnostics) &&
    delta.environmentDiagnostics.length > 0 &&
    delta.appliedSeq === undefined &&
    delta.updatedTransforms === undefined &&
    delta.updatedMorphWeights === undefined &&
    delta.animationState === undefined &&
    delta.addedNodes === undefined &&
    delta.removedNodes === undefined &&
    delta.updatedHierarchy === undefined &&
    delta.updatedVisibility === undefined &&
    delta.updatedLayers === undefined &&
    delta.updatedMaterials === undefined &&
    delta.updatedAssetReferences === undefined &&
    delta.updatedLights === undefined &&
    delta.activeCamera === undefined &&
    delta.updatedCameras === undefined &&
    delta.topologyChanges === undefined &&
    delta.modelingSessions === undefined &&
    delta.overlay === undefined &&
    delta.updatedCharacterMorphWeights === undefined &&
    delta.updatedCharacterMaterials === undefined &&
    delta.updatedSkeletonPose === undefined &&
    delta.characterOverrides === undefined &&
    delta.environment === undefined &&
    delta.selectedTargets === undefined
  );
}

function readEnvironmentPatch(value: unknown): EnvironmentPatch | undefined {
  if (!isRecord(value)) return undefined;
  const environmentId = readString(value.environmentId);
  const mode =
    value.mode === 'skybox' || value.mode === 'ibl' || value.mode === 'background-and-ibl'
      ? value.mode
      : undefined;
  if (!environmentId || !mode) return undefined;
  const patch: EnvironmentPatch = {
    environmentId,
    mode,
    rotationDeg: readFiniteNumber(value.rotationDeg) ?? 0,
    intensity: readFiniteNumber(value.intensity) ?? 1,
    exposure: readFiniteNumber(value.exposure) ?? 0,
    visibleAsBackground: readBoolean(value.visibleAsBackground) ?? true,
  };
  if (isRecord(value.source)) {
    const id = readString(value.source.id);
    if (id) {
      patch.source = {
        id,
        uri: readString(value.source.uri),
        kind: readString(value.source.kind),
      };
    }
  }
  if (isRecord(value.backgroundColor)) {
    patch.backgroundColor = {
      x: readFiniteNumber(value.backgroundColor.x) ?? 0,
      y: readFiniteNumber(value.backgroundColor.y) ?? 0,
      z: readFiniteNumber(value.backgroundColor.z) ?? 0,
      w: readFiniteNumber(value.backgroundColor.w) ?? 1,
    };
  }
  return patch;
}

function readSceneNodeSnapshot(value: unknown): SceneNodeSnapshot | null {
  if (!isRecord(value)) return null;

  const nodeId = readString(value.nodeId) ?? readString(value.node_id) ?? readString(value.id);
  if (!nodeId) return null;

  const transform = isRecord(value.transform) ? value.transform : value;
  const node: SceneNodeSnapshot = {
    nodeId,
    name: readString(value.name) ?? nodeId,
    transform: {
      position: readVec3(transform.position, { x: 0, y: 0, z: 0 }),
      rotation: readQuat(transform.rotation, { x: 0, y: 0, z: 0, w: 1 }),
      scale: readVec3(transform.scale, { x: 1, y: 1, z: 1 }),
    },
    children: readStringArray(value.children),
    visible: readBoolean(value.visible) ?? true,
    kind: readString(value.kind) ?? inferSceneNodeKind(value),
  };

  const parentId = readString(value.parentId) ?? readString(value.parent_id);
  if (parentId) {
    node.parentId = parentId;
  }

  const layerMask = readFiniteNumber(value.layerMask) ?? readFiniteNumber(value.layer_mask);
  if (layerMask !== undefined) {
    node.layerMask = layerMask;
  }

  const mesh = readAssetHandle(value.mesh, 'mesh');
  if (mesh !== undefined) {
    node.mesh = mesh;
  }

  const material = readAssetHandle(value.material, 'material');
  if (material !== undefined) {
    node.material = material;
  }

  const bounds = readBounds3(value.bounds);
  if (bounds !== undefined) {
    node.bounds = bounds;
  }

  const worldBounds = readBounds3(value.worldBounds ?? value.world_bounds);
  if (worldBounds !== undefined) {
    node.worldBounds = worldBounds;
  }

  if (Array.isArray(value.primitives)) {
    const primitives = value.primitives
      .map(readMeshPrimitiveSnapshot)
      .filter((primitive): primitive is SceneMeshPrimitiveSnapshot => primitive !== null);
    if (primitives.length > 0) {
      node.primitives = primitives;
    }
  }
  const characterId = readString(value.characterId) ?? readString(value.character_id);
  if (characterId !== undefined) {
    node.characterId = characterId;
  }
  const regionDescriptors = readCharacterRegionDescriptorSet(
    value.regionDescriptors ?? value.region_descriptors,
  );
  if (regionDescriptors !== undefined) {
    node.regionDescriptors = regionDescriptors;
  }
  const light = readLightPatch(value.light);
  if (light !== undefined) {
    node.light = light;
  }

  return node;
}

function readLightPatch(value: unknown): LightPatch | undefined {
  if (!isRecord(value)) return undefined;
  const nodeId = readString(value.nodeId);
  const kind = readString(value.kind);
  if (!nodeId || !kind) return undefined;
  const light: LightPatch = {
    nodeId,
    kind,
    color: readVec3(value.color, { x: 1, y: 1, z: 1 }),
    intensity: readFiniteNumber(value.intensity) ?? 1,
  };
  const range = readFiniteNumber(value.range);
  if (range !== undefined) light.range = range;
  const innerConeAngle = readFiniteNumber(value.innerConeAngle);
  if (innerConeAngle !== undefined) light.innerConeAngle = innerConeAngle;
  const outerConeAngle = readFiniteNumber(value.outerConeAngle);
  if (outerConeAngle !== undefined) light.outerConeAngle = outerConeAngle;
  if (isRecord(value.shadow)) {
    light.shadow = {
      enabled: readBoolean(value.shadow.enabled) ?? false,
      resolution: readFiniteNumber(value.shadow.resolution),
      bias: readFiniteNumber(value.shadow.bias),
    };
  }
  return light;
}

function readMeshPrimitiveSnapshot(value: unknown): SceneMeshPrimitiveSnapshot | null {
  if (!isRecord(value)) return null;
  const submeshId = readString(value.submeshId) ?? readString(value.submesh_id);
  const primitiveId = readString(value.primitiveId) ?? readString(value.primitive_id);
  if (!submeshId || !primitiveId) return null;

  const primitive: SceneMeshPrimitiveSnapshot = {
    submeshId,
    primitiveId,
  };
  const mesh = readAssetHandle(value.mesh, 'mesh');
  if (mesh !== undefined) {
    primitive.mesh = mesh;
  }
  const material = readAssetHandle(value.material, 'material');
  if (material !== undefined) {
    primitive.material = material;
  }
  const materialSlotId =
    readString(value.materialSlotId) ??
    readString(value.material_slot_id) ??
    readString(value.materialSlot);
  if (materialSlotId !== undefined) {
    primitive.materialSlotId = materialSlotId;
  }
  return primitive;
}

function readAnimationClipInfo(value: unknown): SceneAnimationClipInfo | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  if (!name) return null;
  return {
    name,
    duration: readFiniteNumber(value.duration) ?? 0,
  };
}

function readSceneCameraState(value: unknown): SceneCameraState | undefined {
  if (!isRecord(value)) return undefined;

  const camera: SceneCameraState = {
    cameraId:
      readString(value.cameraId) ?? readString(value.camera_id) ?? readString(value.id) ?? 'camera',
    position: readVec3(value.position, { x: 0, y: 0, z: 0 }),
    target: readVec3(value.target, { x: 0, y: 0, z: -1 }),
    up: readVec3(value.up, { x: 0, y: 1, z: 0 }),
    fov: readFiniteNumber(value.fov) ?? readFiniteNumber(value.fovY) ?? 45,
  };

  const near = readFiniteNumber(value.near);
  if (near !== undefined) {
    camera.near = near;
  }
  const far = readFiniteNumber(value.far);
  if (far !== undefined) {
    camera.far = far;
  }

  return camera;
}

function readBounds3(value: unknown): SceneBounds3 | undefined {
  if (!isRecord(value)) return undefined;
  return {
    min: readVec3(value.min, { x: 0, y: 0, z: 0 }),
    max: readVec3(value.max, { x: 0, y: 0, z: 0 }),
  };
}

function readAssetHandle(
  value: unknown,
  fallbackKind: 'mesh' | 'material',
): SceneAssetHandle | undefined {
  if (!isRecord(value)) return undefined;
  const id = readString(value.id);
  if (!id) return undefined;
  const handle = {
    id,
    kind: readString(value.kind) ?? fallbackKind,
  };
  const uri = readString(value.uri);
  return uri === undefined ? handle : { ...handle, uri };
}

function readVec3(value: unknown, fallback: SceneVec3): SceneVec3 {
  if (Array.isArray(value)) {
    return {
      x: readFiniteNumber(value[0]) ?? fallback.x,
      y: readFiniteNumber(value[1]) ?? fallback.y,
      z: readFiniteNumber(value[2]) ?? fallback.z,
    };
  }
  if (isRecord(value)) {
    return {
      x: readFiniteNumber(value.x) ?? fallback.x,
      y: readFiniteNumber(value.y) ?? fallback.y,
      z: readFiniteNumber(value.z) ?? fallback.z,
    };
  }
  return fallback;
}

function readQuat(value: unknown, fallback: SceneQuat): SceneQuat {
  if (Array.isArray(value)) {
    return {
      x: readFiniteNumber(value[0]) ?? fallback.x,
      y: readFiniteNumber(value[1]) ?? fallback.y,
      z: readFiniteNumber(value[2]) ?? fallback.z,
      w: readFiniteNumber(value[3]) ?? fallback.w,
    };
  }
  if (isRecord(value)) {
    return {
      x: readFiniteNumber(value.x) ?? fallback.x,
      y: readFiniteNumber(value.y) ?? fallback.y,
      z: readFiniteNumber(value.z) ?? fallback.z,
      w: readFiniteNumber(value.w) ?? fallback.w,
    };
  }
  return fallback;
}

function inferSceneNodeKind(value: Record<string, unknown>): string {
  if (readBoolean(value.hasMesh ?? value.has_mesh) === true || isRecord(value.mesh)) {
    return 'mesh';
  }
  if (readBoolean(value.hasLight ?? value.has_light) === true) {
    return 'light';
  }
  if (readBoolean(value.hasCamera ?? value.has_camera) === true) {
    return 'camera';
  }
  return 'node';
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

function isOptionalRecordArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isRecord));
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function createNativeWebSocket(url: string): SceneControlWebSocketLike {
  const socket = new WebSocket(url);
  let onopen: ((event: unknown) => void) | null = null;
  let onmessage: ((event: { data: unknown }) => void) | null = null;
  let onerror: ((event: unknown) => void) | null = null;
  let onclose: ((event: unknown) => void) | null = null;

  socket.onopen = (event) => onopen?.(event);
  socket.onmessage = (event) => onmessage?.({ data: event.data });
  socket.onerror = (event) => onerror?.(event);
  socket.onclose = (event) => onclose?.(event);

  return {
    get readyState() {
      return socket.readyState;
    },
    get onopen() {
      return onopen;
    },
    set onopen(handler) {
      onopen = handler;
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(handler) {
      onmessage = handler;
    },
    get onerror() {
      return onerror;
    },
    set onerror(handler) {
      onerror = handler;
    },
    get onclose() {
      return onclose;
    },
    set onclose(handler) {
      onclose = handler;
    },
    send(data: string) {
      socket.send(data);
    },
    close(code?: number, reason?: string) {
      socket.close(code, reason);
    },
  };
}
