import type {
  RenderFrameMeta,
  SceneCommandAck,
  SceneCommandEnvelope,
  SceneDelta,
  SceneSnapshot,
} from '@neko/shared';

type SceneControlMessageHandler<T> = (message: T) => void;
type SceneControlErrorHandler = (error: Error) => void;

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
  onError?: SceneControlErrorHandler;
}

export interface SceneControlReadyMessage {
  type: 'ready';
  protocol?: string;
  serverRevision?: number;
  lastClientRevision?: number;
}

interface PendingAck {
  resolve: (ack: SceneCommandAck) => void;
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
  private readonly pendingQueries = new Map<string, PendingQuery>();
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
    socket.onerror = () => this.reportError(new Error('Scene control WebSocket error'));
    socket.onclose = () => {
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

  resync(sceneId = this.config.sceneId): void {
    this.send({ type: 'resync', sceneId });
  }

  requestKeyframe(viewportId?: string): void {
    this.send({ type: 'requestKeyframe', viewportId });
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
        this.config.onReady?.(message as SceneControlReadyMessage);
        break;
      case 'ack':
        this.handleAck(message.ack);
        break;
      case 'delta':
        this.handleDelta(message.delta);
        break;
      case 'snapshot':
        this.handleSnapshot(message.snapshot);
        break;
      case 'queryResult':
        this.handleQueryResult(message);
        break;
      case 'renderFrameMeta':
        this.handleRenderFrameMeta(message.meta);
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

  private handleAck(value: unknown): void {
    if (!isRecord(value)) {
      this.reportError(new Error('Invalid scene command ack'));
      return;
    }
    const ack = value as unknown as SceneCommandAck;
    const pending = this.pendingAcks.get(ack.seq);
    if (pending) {
      this.pendingAcks.delete(ack.seq);
      pending.resolve(ack);
    }
    this.config.onAck?.(ack);
  }

  private handleDelta(value: unknown): void {
    if (!isRecord(value)) {
      this.reportError(new Error('Invalid scene delta'));
      return;
    }
    const delta = value as unknown as SceneDelta;
    if (!this.shouldApplyDelta(delta.revision)) {
      return;
    }
    this.rememberAppliedRevision(delta.revision);
    this.config.onDelta?.(delta);
  }

  private handleSnapshot(value: unknown): void {
    if (!isRecord(value)) {
      this.reportError(new Error('Invalid scene snapshot'));
      return;
    }
    const snapshot = value as unknown as SceneSnapshot;
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

  private handleRenderFrameMeta(value: unknown): void {
    if (!isRecord(value)) {
      this.reportError(new Error('Invalid render frame metadata'));
      return;
    }
    const meta = value as unknown as RenderFrameMeta;
    this.config.onRenderFrameMeta?.(meta);
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
    }
    this.reportError(error);
  }
}

function parseJsonObject(data: string): SceneControlSocketMessage | null {
  try {
    const value: unknown = JSON.parse(data);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
