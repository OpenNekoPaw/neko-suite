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
    expect(socket.getConnectionState()).toBe('connecting');
    const firstSocket = socketAt(sockets, 0);
    firstSocket.open();

    expect(socket.getConnectionState()).toBe('connected');
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

  it('rejects timed-out scene commands and requests authoritative resync', async () => {
    vi.useFakeTimers();
    const fake = new FakeWebSocket();
    const diagnostics: string[] = [];
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      sceneId: 'scene-a',
      reconnect: false,
      requestTimeoutMs: 25,
      webSocketFactory: () => fake,
      onControlFlowDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    socket.connect();
    fake.open();

    const promise = socket.sendCommand({
      seq: 11,
      baseRevision: 4,
      command: {
        type: 'transform',
        payloadJson: '{}',
      },
    });
    const assertion = expect(promise).rejects.toThrow('Scene command 11 timed out');

    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(socket.getPendingAckCount()).toBe(0);
    expect(diagnostics).toEqual(
      expect.arrayContaining(['scene-command-timeout', 'scene-control-resync-after-timeout']),
    );
    expect(parseSent(fake, 3)).toEqual({ type: 'resync', sceneId: 'scene-a' });
    vi.useRealTimers();
  });

  it('rejects timed-out viewport commands without waiting forever', async () => {
    vi.useFakeTimers();
    const fake = new FakeWebSocket();
    const diagnostics: string[] = [];
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      sceneId: 'scene-a',
      reconnect: false,
      requestTimeoutMs: 25,
      webSocketFactory: () => fake,
      onControlFlowDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    socket.connect();
    fake.open();

    const promise = socket.sendViewportCommand({
      protocolVersion: 1,
      domain: 'viewport',
      action: 'viewport:transform',
      sceneId: 'scene-a',
      viewportId: 'main',
      seq: 12,
      correlationId: 'transform-12',
      timestamp: 100,
      source: 'user',
      baseRevision: 4,
      payload: {},
    });
    const assertion = expect(promise).rejects.toThrow(
      'Viewport command transform-12 timed out',
    );

    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(diagnostics).toEqual(
      expect.arrayContaining(['viewport-command-timeout', 'scene-control-resync-after-timeout']),
    );
    expect(parseSent(fake, 3)).toEqual({ type: 'resync', sceneId: 'scene-a' });
    vi.useRealTimers();
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

  it('reports superseded scene command acknowledgements distinctly from rejection', async () => {
    const fake = new FakeWebSocket();
    const diagnostics: string[] = [];
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      sceneId: 'scene-a',
      reconnect: false,
      webSocketFactory: () => fake,
      onControlFlowDiagnostic: (diagnostic) => {
        diagnostics.push(`${diagnostic.code}:${diagnostic.commandState ?? 'none'}`);
      },
    });
    socket.connect();
    fake.open();

    const promise = socket.sendCommand({
      seq: 9,
      baseRevision: 4,
      command: {
        type: 'transform',
        payloadJson: '{}',
      },
    });
    const ack: Awaited<ReturnType<SceneControlSocket['sendCommand']>> = {
      seq: 9,
      appliedSeq: 8,
      baseRevision: 4,
      revision: 5,
      status: 'superseded',
      error: 'coalesced by newer transform',
    };
    fake.emit({ type: 'ack', ack });

    await expect(promise).resolves.toEqual(ack);
    expect(diagnostics).toContain('scene-command-superseded:superseded');
    expect(diagnostics).not.toContain('scene-command-rejected:error');
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

  it('normalizes minimal legacy snapshots before notifying listeners', () => {
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

    fake.emit({
      type: 'snapshot',
      snapshot: {
        revision: 5,
        nodes: [
          {
            id: 'mesh-1',
            parent_id: '',
            position: [1, 2, 3],
            has_mesh: true,
          },
        ],
      },
    });

    expect(onSnapshot).toHaveBeenCalledWith({
      sceneId: 'default',
      revision: 5,
      nodes: [
        expect.objectContaining({
          nodeId: 'mesh-1',
          name: 'mesh-1',
          children: [],
          visible: true,
          kind: 'mesh',
          transform: expect.objectContaining({
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          }),
        }),
      ],
      animations: [],
    });
  });

  it('accepts flattened and string-encoded snapshot messages', () => {
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

    fake.emit({
      type: 'snapshot',
      sceneId: 'flat-scene',
      revision: 6,
      nodes: [{ nodeId: 'flat-node', name: 'Flat Node', children: [], visible: true }],
      animations: [],
    });
    fake.emit({
      type: 'snapshot',
      snapshot: JSON.stringify({
        sceneId: 'string-scene',
        revision: 7,
        nodes: [{ id: 'string-node' }],
      }),
    });

    expect(onSnapshot).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sceneId: 'flat-scene',
        revision: 6,
        nodes: [expect.objectContaining({ nodeId: 'flat-node' })],
      }),
    );
    expect(onSnapshot).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sceneId: 'string-scene',
        revision: 7,
        nodes: [expect.objectContaining({ nodeId: 'string-node' })],
        animations: [],
      }),
    );
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

  it('sends viewport protocol commands and resolves viewport events', async () => {
    const fake = new FakeWebSocket();
    const onViewportEvent = vi.fn();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
      onViewportEvent,
    });
    socket.connect();
    fake.open();

    const promise = socket.sendViewportCommand({
      protocolVersion: 1,
      domain: 'scene',
      action: 'scene:model:characterPreview:setMode',
      sceneId: 'scene-a',
      viewportId: 'main',
      seq: 12,
      correlationId: 'preview-12',
      timestamp: 100,
      source: 'user',
      baseRevision: 4,
      payload: {
        characterId: 'character-a',
        modeId: 'face',
        viewportId: 'main',
      },
    });

    expect(parseSent(fake, 1)).toEqual(
      expect.objectContaining({
        type: 'viewportCommand',
        requestId: 'preview-12',
      }),
    );

    const event = {
      protocolVersion: 1,
      domain: 'scene',
      event: 'scene:model:characterPreview:setMode',
      sceneId: 'scene-a',
      viewportId: 'main',
      ackSeq: 12,
      revision: 4,
      timestamp: 120,
      status: 'ack',
      appliedSeq: 12,
      payload: {
        characterId: 'character-a',
        modeId: 'face',
        viewportId: 'main',
        status: 'applied',
        sceneRevision: 4,
        cameraPreset: 'face-closeup',
        renderPreset: 'face-detail',
        playback: { state: 'idle' },
        diagnostics: [],
      },
    };
    fake.emit({ type: 'viewportEvent', requestId: 'preview-12', event });

    await expect(promise).resolves.toEqual(event);
    expect(onViewportEvent).toHaveBeenCalledWith(event);
  });

  it('validates character preview state messages', () => {
    const fake = new FakeWebSocket();
    const onCharacterPreviewState = vi.fn();
    const onError = vi.fn();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
      onCharacterPreviewState,
      onError,
    });
    socket.connect();
    fake.open();

    const state = {
      characterId: 'character-a',
      modeId: 'voice-pack',
      viewportId: 'main',
      status: 'applied',
      sceneRevision: 8,
      cameraPreset: 'voice-performance',
      renderPreset: 'voice-lipsync',
      playback: { state: 'unavailable' },
      diagnostics: [{ code: 'missing-voice-pack', severity: 'warning' }],
    };
    fake.emit({ type: 'characterPreviewState', state });
    fake.emit({ type: 'characterPreviewState', state: { ...state, modeId: 'profile' } });

    expect(onCharacterPreviewState).toHaveBeenCalledWith(state);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('validates render frame metadata and defaults fields omitted by older engines', () => {
    const fake = new FakeWebSocket();
    const onRenderFrameMeta = vi.fn();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
      onRenderFrameMeta,
    });
    socket.connect();
    fake.open();

    fake.emit({
      type: 'renderFrameMeta',
      meta: {
        streamId: 'stream-main',
        viewportId: 'viewport-main',
        frameId: 10,
        ptsUs: 50_000,
        durationUs: 16_666,
        isKeyframe: true,
        sceneRevision: 40,
        appliedSeq: 12,
      },
    });

    expect(onRenderFrameMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        frameTimestamp: 50,
        viewTransform: [1, 0, 0, 1, 0, 0],
      }),
    );
  });

  it('accepts scene-control viewport metadata events as the P1 metadata path', () => {
    const fake = new FakeWebSocket();
    const onViewportMetadata = vi.fn();
    const onDiagnostic = vi.fn();
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      reconnect: false,
      webSocketFactory: () => fake,
      onViewportMetadata,
      onControlFlowDiagnostic: onDiagnostic,
    });
    socket.connect();
    fake.open();

    const event = {
      protocolVersion: 1,
      type: 'viewportMetadata',
      sceneId: 'scene-a',
      viewportId: 'main',
      revision: 12,
      appliedSeq: 21,
      timestamp: 1770000000050,
      transport: 'scene-control',
      cadence: 'ack-correlated',
      meta: {
        protocolVersion: 1,
        streamId: 'stream-main',
        sceneId: 'scene-a',
        viewportId: 'main',
        frameId: 21,
        ptsUs: 66_666,
        durationUs: 16_666,
        frameTimestamp: 1770000000048,
        revision: 12,
        sceneRevision: 12,
        appliedSeq: 21,
        viewTransform: [1, 0, 0, 1, 0, 0],
      },
    };
    fake.emit({ type: 'viewportMetadata', event });

    expect(onViewportMetadata).toHaveBeenCalledWith(event);
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'scene-control-viewport-metadata',
        metadataState: 'fresh',
        revision: 12,
        appliedSeq: 21,
      }),
    );
  });

  it('reports connection, ack-before-frame, stale metadata, and metadata delay diagnostics', async () => {
    const fake = new FakeWebSocket();
    const diagnostics: string[] = [];
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      sceneId: 'scene-a',
      reconnect: false,
      webSocketFactory: () => fake,
      onControlFlowDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    socket.connect();
    fake.open();

    const promise = socket.sendCommand({
      seq: 21,
      baseRevision: 10,
      command: {
        type: 'transform',
        payloadJson: '{}',
      },
    });
    fake.emit({
      type: 'ack',
      ack: {
        seq: 21,
        appliedSeq: 21,
        baseRevision: 10,
        revision: 12,
        status: 'applied',
      },
    });

    await expect(promise).resolves.toMatchObject({ status: 'applied' });

    fake.emit({
      type: 'renderFrameMeta',
      meta: {
        streamId: 'stream-main',
        sceneId: 'scene-a',
        viewportId: 'main',
        frameId: 22,
        ptsUs: 66_666,
        durationUs: 16_666,
        isKeyframe: true,
        sceneRevision: 11,
        appliedSeq: 20,
        diagnostics: {
          metadataState: 'delayed',
          metadataDelayMs: 140,
        },
      },
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        'scene-control-connecting',
        'scene-control-connected',
        'scene-command-queued',
        'scene-command-sent',
        'scene-command-ack',
        'scene-command-ack-before-frame',
        'scene-control-render-frame-meta-delayed',
        'scene-control-render-frame-meta-stale',
      ]),
    );
  });

  it('reports control failure while callers can keep video transport state separate', async () => {
    const fake = new FakeWebSocket();
    const diagnostics: string[] = [];
    const socket = new SceneControlSocket({
      url: 'ws://scene-control',
      sceneId: 'scene-a',
      reconnect: false,
      webSocketFactory: () => fake,
      onControlFlowDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    socket.connect();
    fake.open();

    const promise = socket.sendCommand({
      seq: 31,
      baseRevision: 2,
      command: {
        type: 'transform',
        payloadJson: '{}',
      },
    });
    fake.emit({
      type: 'ack',
      ack: {
        seq: 31,
        appliedSeq: 0,
        baseRevision: 2,
        revision: 3,
        status: 'rejected',
        error: 'unsupported transform',
      },
    });

    await expect(promise).resolves.toMatchObject({ status: 'rejected' });

    fake.emit({
      type: 'renderFrameMeta',
      meta: {
        streamId: 'stream-main',
        sceneId: 'scene-a',
        viewportId: 'main',
        frameId: 32,
        ptsUs: 83_333,
        durationUs: 16_666,
        isKeyframe: true,
        sceneRevision: 3,
        appliedSeq: 30,
      },
    });

    expect(diagnostics).toContain('scene-command-rejected');
    expect(diagnostics).not.toContain('scene-control-render-frame-meta-stale');
  });
});
