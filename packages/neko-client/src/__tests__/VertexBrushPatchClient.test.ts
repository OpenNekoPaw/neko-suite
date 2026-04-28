import { describe, expect, it, vi } from 'vitest';
import {
  VertexBrushPatchClient,
  encodeVertexBrushPatchFrame,
  type BrushPatchWebSocketLike,
} from '../VertexBrushPatchClient';
import type { VertexBrushPatch } from '@neko/shared';

function patch(seq: number, strokeId = 'stroke-a'): VertexBrushPatch {
  return {
    sessionId: 'session-a',
    meshId: 'mesh-a',
    topologyVersion: 3,
    strokeId,
    seq,
    encoding: 'f32-delta',
    sparseIndices: [1, 3],
    payload: new Uint8Array([1, 2, 3, 4]),
  };
}

describe('VertexBrushPatchClient', () => {
  it('encodes metadata header and binary payload into one frame', () => {
    const frame = encodeVertexBrushPatchFrame(patch(1));
    const headerLength = new DataView(frame).getUint32(0, false);
    const header = JSON.parse(
      new TextDecoder().decode(new Uint8Array(frame, 4, headerLength)),
    ) as Record<string, unknown>;
    const payload = Array.from(new Uint8Array(frame, 4 + headerLength));

    expect(header).toMatchObject({
      protocol: 'neko-vertex-brush-v1',
      sessionId: 'session-a',
      meshId: 'mesh-a',
      topologyVersion: 3,
      seq: 1,
      payloadByteLength: 4,
    });
    expect(payload).toEqual([1, 2, 3, 4]);
  });

  it('coalesces superseded brush patches under backpressure', () => {
    const sent: ArrayBuffer[] = [];
    const socket: BrushPatchWebSocketLike = {
      readyState: 1,
      send: (data) => sent.push(data),
    };
    const onBackpressure = vi.fn();
    const client = new VertexBrushPatchClient({
      websocketUrl: 'ws://engine/modeling',
      webSocketFactory: () => socket,
      maxInFlight: 1,
      onBackpressure,
    });

    client.sendPatch(patch(1));
    client.sendPatch(patch(2));
    client.sendPatch(patch(3));

    expect(sent).toHaveLength(1);
    expect(client.getQueuedPatchCount()).toBe(1);
    expect(onBackpressure).toHaveBeenCalledWith(2);

    client.acknowledge(1);
    expect(sent).toHaveLength(2);
    expect(client.getQueuedPatchCount()).toBe(0);
  });

  it('queues patches until the modeling WebSocket opens', () => {
    const sent: ArrayBuffer[] = [];
    let openListener: (() => void) | null = null;
    const socket: BrushPatchWebSocketLike = {
      readyState: 0,
      send: (data) => sent.push(data),
      addEventListener: (_type, listener) => {
        openListener = listener;
      },
    };
    const client = new VertexBrushPatchClient({
      websocketUrl: 'ws://engine/modeling/session-a',
      webSocketFactory: () => socket,
      maxInFlight: 2,
    });

    client.sendPatch(patch(1));
    expect(sent).toHaveLength(0);
    expect(client.getQueuedPatchCount()).toBe(1);

    Object.defineProperty(socket, 'readyState', { value: 1 });
    openListener?.();

    expect(sent).toHaveLength(1);
    expect(client.getQueuedPatchCount()).toBe(0);
  });
});
