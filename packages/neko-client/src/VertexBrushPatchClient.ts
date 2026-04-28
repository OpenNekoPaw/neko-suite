import type { VertexBrushPatch } from '@neko/shared';

export interface BrushPatchWebSocketLike {
  readonly readyState: number;
  send(data: ArrayBuffer): void;
  addEventListener?(type: 'open', listener: () => void): void;
  close?(): void;
}

export type BrushPatchWebSocketFactory = (url: string) => BrushPatchWebSocketLike;

export interface VertexBrushPatchClientConfig {
  websocketUrl: string;
  webSocketFactory?: BrushPatchWebSocketFactory;
  maxInFlight?: number;
  onBackpressure?: (droppedSeq: number) => void;
}

interface QueuedPatch {
  patch: VertexBrushPatch;
  frame: ArrayBuffer;
}

const WS_OPEN = 1;
const DEFAULT_MAX_IN_FLIGHT = 4;

export class VertexBrushPatchClient {
  private readonly maxInFlight: number;
  private readonly socket: BrushPatchWebSocketLike;
  private readonly queuedByStroke = new Map<string, QueuedPatch>();
  private inFlight = 0;

  constructor(private readonly config: VertexBrushPatchClientConfig) {
    this.maxInFlight = config.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
    this.socket = this.createSocket(config.websocketUrl);
    this.socket.addEventListener?.('open', () => this.flushQueued());
  }

  sendPatch(patch: VertexBrushPatch): void {
    const frame = encodeVertexBrushPatchFrame(patch);
    if (this.socket.readyState !== WS_OPEN) {
      this.queuePatch({ patch, frame });
      return;
    }
    if (this.inFlight >= this.maxInFlight) {
      this.queuePatch({ patch, frame });
      return;
    }
    this.sendFrame(frame);
  }

  acknowledge(seq: number): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    for (const [strokeId, queued] of this.queuedByStroke) {
      if (queued.patch.seq <= seq) {
        this.queuedByStroke.delete(strokeId);
        continue;
      }
      this.queuedByStroke.delete(strokeId);
      this.sendFrame(queued.frame);
      break;
    }
  }

  getQueuedPatchCount(): number {
    return this.queuedByStroke.size;
  }

  getInFlightCount(): number {
    return this.inFlight;
  }

  dispose(): void {
    this.queuedByStroke.clear();
    this.socket.close?.();
  }

  private queuePatch(queued: QueuedPatch): void {
    const previous = this.queuedByStroke.get(queued.patch.strokeId);
    if (previous) {
      this.config.onBackpressure?.(previous.patch.seq);
    }
    this.queuedByStroke.set(queued.patch.strokeId, queued);
  }

  private flushQueued(): void {
    while (this.socket.readyState === WS_OPEN && this.inFlight < this.maxInFlight) {
      const next = this.queuedByStroke.values().next().value as QueuedPatch | undefined;
      if (!next) return;
      this.queuedByStroke.delete(next.patch.strokeId);
      this.sendFrame(next.frame);
    }
  }

  private sendFrame(frame: ArrayBuffer): void {
    if (this.socket.readyState !== WS_OPEN) {
      return;
    }
    this.socket.send(frame);
    this.inFlight += 1;
  }

  private createSocket(url: string): BrushPatchWebSocketLike {
    if (this.config.webSocketFactory) {
      return this.config.webSocketFactory(url);
    }
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not available; provide webSocketFactory');
    }
    return new WebSocket(url) as unknown as BrushPatchWebSocketLike;
  }
}

export function encodeVertexBrushPatchFrame(patch: VertexBrushPatch): ArrayBuffer {
  const header = {
    protocol: 'neko-vertex-brush-v1',
    sessionId: patch.sessionId,
    meshId: patch.meshId,
    topologyVersion: patch.topologyVersion,
    strokeId: patch.strokeId,
    seq: patch.seq,
    encoding: patch.encoding,
    sparseIndices: patch.sparseIndices,
    affectedStart: patch.affectedStart,
    affectedCount: patch.affectedCount,
    payloadByteLength: patch.payload.byteLength,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const frame = new Uint8Array(4 + headerBytes.byteLength + patch.payload.byteLength);
  new DataView(frame.buffer).setUint32(0, headerBytes.byteLength, false);
  frame.set(headerBytes, 4);
  frame.set(patch.payload, 4 + headerBytes.byteLength);
  return frame.buffer;
}
