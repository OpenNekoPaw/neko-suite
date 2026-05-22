import type {
  CharacterPreviewModeStatePayload,
  RenderFrameMeta,
  SceneCommandAck,
  SceneCommandEnvelope,
  SceneDelta,
  SceneSnapshot,
  ViewportCommand,
  ViewportEvent,
} from '@neko/shared';
import { isCharacterPreviewModeStatePayload, isViewportEvent } from '@neko/shared';
import {
  isRecord,
  parseJsonObject,
  readBoolean,
  readFiniteNumber,
  readRenderFrameMeta,
  readString,
  readStringArray,
} from './utils/wireReaders';

type SceneControlMessageHandler<T> = (message: T) => void;
type SceneControlErrorHandler = (error: Error) => void;
type SceneNodeSnapshot = SceneSnapshot['nodes'][number];
type SceneAnimationClipInfo = SceneSnapshot['animations'][number];
type SceneCameraState = NonNullable<SceneSnapshot['activeCamera']>;
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
  webSocketFactory?: SceneControlWebSocketFactory;
  onReady?: SceneControlMessageHandler<SceneControlReadyMessage>;
  onAck?: SceneControlMessageHandler<SceneCommandAck>;
  onDelta?: SceneControlMessageHandler<SceneDelta>;
  onSnapshot?: SceneControlMessageHandler<SceneSnapshot>;
  onRenderFrameMeta?: SceneControlMessageHandler<RenderFrameMeta>;
  onViewportEvent?: SceneControlMessageHandler<ViewportEvent>;
  onCharacterPreviewState?: SceneControlMessageHandler<CharacterPreviewModeStatePayload>;
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
}

interface PendingViewportCamera {
  resolve: (ack: SceneViewportCameraAck) => void;
  reject: (error: Error) => void;
}

interface PendingQuery {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

interface SceneControlSocketMessage {
  type?: unknown;
  [key: string]: unknown;
}

const WS_OPEN = 1;
const DEFAULT_RECONNECT_DELAY_MS = 500;

export class SceneControlSocket {
  private readonly config: Required<
    Pick<SceneControlSocketConfig, 'reconnect' | 'reconnectDelayMs'>
  > &
    Omit<SceneControlSocketConfig, 'reconnect' | 'reconnectDelayMs'>;
  private socket: SceneControlWebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private lastKnownRevision: number | undefined;
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
    };
  }

  connect(): void {
    this.manuallyClosed = false;
    this.clearReconnectTimer();
    const socket = this.createSocket(this.config.url);
    this.socket = socket;

    socket.onopen = () => {
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
      this.reportError(new Error('Scene control WebSocket error'));
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      if (this.manuallyClosed || this.socket !== null) {
        return;
      }
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
  }

  sendHello(lastRevision?: number): void {
    this.send({ type: 'hello', lastRevision });
  }

  subscribe(sceneId = this.config.sceneId): void {
    this.send({ type: 'subscribe', sceneId });
  }

  sendCommand(envelope: SceneCommandEnvelope): Promise<SceneCommandAck> {
    return new Promise((resolve, reject) => {
      this.pendingAcks.set(envelope.seq, { resolve, reject });
      try {
        this.send({ type: 'command', envelope });
      } catch (error) {
        this.pendingAcks.delete(envelope.seq);
        reject(toError(error));
      }
    });
  }

  query(query: string, payload?: Record<string, unknown>, requestId?: string): Promise<unknown> {
    const id = requestId ?? `query-${this.nextQueryId++}`;
    return new Promise((resolve, reject) => {
      this.pendingQueries.set(id, { resolve, reject });
      try {
        this.send({ type: 'query', query, requestId: id, payload });
      } catch (error) {
        this.pendingQueries.delete(id);
        reject(toError(error));
      }
    });
  }

  updateViewportCamera(
    update: SceneViewportCameraUpdate,
    requestId?: string,
  ): Promise<SceneViewportCameraAck> {
    const id = requestId ?? `viewport-camera-${this.nextViewportCameraRequestId++}`;
    return new Promise((resolve, reject) => {
      this.pendingViewportCameras.set(id, { resolve, reject });
      try {
        this.send({ type: 'viewportCamera', requestId: id, ...cameraUpdateToMessage(update) });
      } catch (error) {
        this.pendingViewportCameras.delete(id);
        reject(toError(error));
      }
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
      this.pendingQueries.set(requestId, {
        resolve: (result) => {
          if (isViewportEvent(result)) {
            resolve(result);
            return;
          }
          reject(new Error('Invalid viewport event result'));
        },
        reject,
      });
      try {
        this.send({ type: 'viewportCommand', requestId, command });
      } catch (error) {
        this.pendingQueries.delete(requestId);
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
      this.pendingAcks.delete(ack.seq);
      pending.resolve(ack);
    }
    this.config.onAck?.(ack);
  }

  private handleDelta(value: unknown): void {
    const delta = readSceneDelta(value);
    if (!delta) {
      this.reportError(new Error('Invalid scene delta'));
      return;
    }
    if (!this.shouldApplyDelta(delta.revision)) {
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
    this.pendingQueries.delete(requestId);
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
        this.pendingQueries.delete(requestId);
        pending.resolve(event);
      }
    }
    this.config.onViewportEvent?.(event);
  }

  private handleViewportCameraAck(message: SceneControlSocketMessage): void {
    const ack = message as SceneViewportCameraAck;
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    if (!requestId) return;

    const pending = this.pendingViewportCameras.get(requestId);
    if (!pending) return;
    this.pendingViewportCameras.delete(requestId);
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
    this.config.onRenderFrameMeta?.(meta);
  }

  private handleCharacterPreviewState(value: unknown): void {
    if (!isCharacterPreviewModeStatePayload(value)) {
      this.reportError(new Error('Invalid character preview mode state'));
      return;
    }
    this.config.onCharacterPreviewState?.(value);
  }

  private shouldApplyDelta(value: unknown): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.reportError(new Error('Scene delta revision must be a finite number'));
      this.resync();
      return false;
    }

    if (this.lastKnownRevision === undefined) {
      return true;
    }

    if (value <= this.lastKnownRevision) {
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

  private rejectPending(error: Error): void {
    for (const pending of this.pendingAcks.values()) {
      pending.reject(error);
    }
    this.pendingAcks.clear();
    for (const pending of this.pendingViewportCameras.values()) {
      pending.reject(error);
    }
    this.pendingViewportCameras.clear();
    for (const pending of this.pendingQueries.values()) {
      pending.reject(error);
    }
    this.pendingQueries.clear();
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

  private handleErrorMessage(message: SceneControlSocketMessage): void {
    const error = new Error(String(message.error ?? 'Scene control error'));
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    if (requestId) {
      const pending = this.pendingQueries.get(requestId);
      if (pending) {
        this.pendingQueries.delete(requestId);
        pending.reject(error);
      }
      const pendingViewportCamera = this.pendingViewportCameras.get(requestId);
      if (pendingViewportCamera) {
        this.pendingViewportCameras.delete(requestId);
        pendingViewportCamera.reject(error);
      }
    } else if (this.pendingViewportCameras.size > 0) {
      for (const pending of this.pendingViewportCameras.values()) {
        pending.reject(error);
      }
      this.pendingViewportCameras.clear();
    }
    this.reportError(error);
  }
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
    isOptionalRecordArray(value.characterOverrides)
  );
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

  return node;
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
): SceneNodeSnapshot['mesh'] | SceneNodeSnapshot['material'] | undefined {
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
