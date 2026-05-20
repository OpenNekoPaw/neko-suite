import { describe, expect, it, vi } from 'vitest';
import { SceneControlSocket, type SceneControlWebSocketLike } from '../SceneControlSocket';

class FakeWebSocket implements SceneControlWebSocketLike {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  emit(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

function parseSent(socket: FakeWebSocket, index: number): Record<string, unknown> {
  return JSON.parse(socket.sent[index] ?? '{}') as Record<string, unknown>;
}

function socketAt(sockets: readonly FakeWebSocket[], index: number): FakeWebSocket {
  const socket = sockets[index];
  if (!socket) {
    throw new Error(`Missing fake socket at index ${index}`);
  }
  return socket;
}

describe('SceneControlSocket', () => {
  it('sends hello and subscribe on open', () => {
    const sockets: FakeWebSocket[] = [];
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      sceneId: 'scene-a',
      reconnect: false,
      webSocketFactory: () => {
        const fake = new FakeWebSocket();
        sockets.push(fake);
        return fake;
      },
    });

    socket.connect();
    const firstSocket = socketAt(sockets, 0);
    firstSocket.open();

    expect(parseSent(firstSocket, 0)).toEqual({ type: 'hello' });
    expect(parseSent(firstSocket, 1)).toEqual({ type: 'subscribe', sceneId: 'scene-a' });
  });

  it('tracks pending command ack', async () => {
    const fake = new FakeWebSocket();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
    });
    socket.connect();
    fake.open();

    const envelope: Parameters<SceneControlSocket['sendCommand']>[0] = {
      seq: 7,
      baseRevision: 0,
      command: {
        type: 'transform',
        payloadJson: '{}',
      },
    };
    const promise = socket.sendCommand(envelope);
    expect(socket.getPendingAckCount()).toBe(1);

    const ack: Awaited<ReturnType<SceneControlSocket['sendCommand']>> = {
      seq: 7,
      appliedSeq: 7,
      baseRevision: 0,
      revision: 1,
      status: 'applied',
    };
    fake.emit({ type: 'ack', ack });

    await expect(promise).resolves.toEqual(ack);
    expect(socket.getPendingAckCount()).toBe(0);
  });

  it('resolves rejected command ack without applying a local delta', async () => {
    const fake = new FakeWebSocket();
    const onAck = vi.fn();
    const onDelta = vi.fn();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
      onAck,
      onDelta,
    });
    socket.connect();
    fake.open();

    const promise = socket.sendCommand({
      seq: 8,
      baseRevision: 4,
      command: {
        type: 'transform',
        payloadJson: '{}',
      },
    });
    const ack: Awaited<ReturnType<SceneControlSocket['sendCommand']>> = {
      seq: 8,
      appliedSeq: 0,
      baseRevision: 4,
      revision: 4,
      status: 'rejected',
      error: 'stale command',
    };
    fake.emit({ type: 'ack', ack });

    await expect(promise).resolves.toEqual(ack);
    expect(onAck).toHaveBeenCalledWith(ack);
    expect(onDelta).not.toHaveBeenCalled();
  });

  it('resyncs after reconnect with last known revision', async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      sceneId: 'scene-a',
      reconnect: true,
      reconnectDelayMs: 10,
      webSocketFactory: () => {
        const fake = new FakeWebSocket();
        sockets.push(fake);
        return fake;
      },
    });

    socket.connect();
    const firstSocket = socketAt(sockets, 0);
    firstSocket.open();
    const snapshot = {
      sceneId: 'scene-a',
      revision: 5,
      nodes: [],
      animations: [],
    };
    firstSocket.emit({ type: 'snapshot', snapshot });
    firstSocket.close();

    await vi.advanceTimersByTimeAsync(10);
    const secondSocket = socketAt(sockets, 1);
    secondSocket.open();

    expect(parseSent(secondSocket, 0)).toEqual({ type: 'hello', lastRevision: 5 });
    expect(parseSent(secondSocket, 1)).toEqual({ type: 'resync', sceneId: 'scene-a' });
    vi.useRealTimers();
  });

  it('drops stale deltas', () => {
    const fake = new FakeWebSocket();
    const onDelta = vi.fn();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
      onDelta,
    });
    socket.connect();
    fake.open();

    fake.emit({
      type: 'snapshot',
      snapshot: { sceneId: 'scene-a', revision: 20, nodes: [], animations: [] },
    });
    fake.emit({ type: 'delta', delta: { revision: 18, updatedTransforms: [] } });

    expect(onDelta).not.toHaveBeenCalled();
  });

  it('requests resync when a delta revision gap is detected', () => {
    const fake = new FakeWebSocket();
    const onDelta = vi.fn();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      sceneId: 'scene-a',
      reconnect: false,
      webSocketFactory: () => fake,
      onDelta,
    });
    socket.connect();
    fake.open();

    fake.emit({
      type: 'snapshot',
      snapshot: { sceneId: 'scene-a', revision: 20, nodes: [], animations: [] },
    });
    fake.emit({ type: 'delta', delta: { revision: 23, updatedTransforms: [] } });

    expect(onDelta).not.toHaveBeenCalled();
    expect(parseSent(fake, 2)).toEqual({ type: 'resync', sceneId: 'scene-a' });
  });

  it('uses queryResult snapshots as snapshot fallback', () => {
    const fake = new FakeWebSocket();
    const onSnapshot = vi.fn();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
      onSnapshot,
    });
    socket.connect();
    fake.open();

    const snapshot = { sceneId: 'scene-a', revision: 30, nodes: [], animations: [] };
    fake.emit({ type: 'queryResult', snapshot });

    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('sends viewport-scoped query payloads and resolves queryResult by request id', async () => {
    const fake = new FakeWebSocket();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
    });
    socket.connect();
    fake.open();

    const promise = socket.query('hitTest', { viewportId: 'side', x: 0.25, y: 0.75 }, 'hit-1');
    expect(parseSent(fake, 1)).toEqual({
      type: 'query',
      query: 'hitTest',
      requestId: 'hit-1',
      payload: { viewportId: 'side', x: 0.25, y: 0.75 },
    });

    const result = {
      viewportId: 'side',
      revision: 4,
      nodeId: 'mesh_1',
      depth: 1,
      worldPosition: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    };
    fake.emit({ type: 'queryResult', requestId: 'hit-1', query: 'hitTest', result });

    await expect(promise).resolves.toEqual(result);
  });

  it('sends viewport camera updates and resolves ack by request id', async () => {
    const fake = new FakeWebSocket();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
    });
    socket.connect();
    fake.open();

    const promise = socket.updateViewportCamera(
      {
        sceneId: 'scene-a',
        sceneRevision: 8,
        viewportId: 'main',
        position: [0, 1, 5],
        target: [0, 0, 0],
        resolution: { width: 960, height: 540, pixelRatio: 1.25 },
      },
      'camera-1',
    );

    expect(parseSent(fake, 1)).toEqual({
      type: 'viewportCamera',
      requestId: 'camera-1',
      sceneId: 'scene-a',
      sceneRevision: 8,
      viewportId: 'main',
      position: [0, 1, 5],
      target: [0, 0, 0],
      resolution: { width: 960, height: 540, pixelRatio: 1.25 },
    });

    const ack = {
      type: 'viewportCameraAck',
      requestId: 'camera-1',
      sceneId: 'scene-a',
      viewportId: 'main',
      status: 'applied',
      revision: 9,
      acceptedRevision: 9,
    } as const;
    fake.emit(ack);

    await expect(promise).resolves.toEqual(ack);
  });

  it('rejects viewport camera updates when engine reports rejection', async () => {
    const fake = new FakeWebSocket();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
    });
    socket.connect();
    fake.open();

    const promise = socket.updateViewportCamera(
      {
        viewportId: 'main',
        position: [0, 0, 0],
        target: [0, 0, 0],
      },
      'camera-2',
    );
    fake.emit({
      type: 'viewportCameraAck',
      requestId: 'camera-2',
      viewportId: 'main',
      status: 'rejected',
      error: 'camera position and target must be distinct',
    });

    await expect(promise).rejects.toThrow('camera position and target must be distinct');
  });

  it('rejects pending viewport camera updates on generic scene control errors', async () => {
    const fake = new FakeWebSocket();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
    });
    socket.connect();
    fake.open();

    const promise = socket.updateViewportCamera({
      viewportId: 'main',
      position: [0, 1, 5],
      target: [0, 0, 0],
    });
    fake.emit({ type: 'error', error: 'unsupported scene control message: viewportCamera' });

    await expect(promise).rejects.toThrow('unsupported scene control message');
  });
});
