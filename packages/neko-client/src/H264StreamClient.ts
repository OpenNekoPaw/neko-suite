/**
 * H264StreamClient - H.264 stream decoder using WebCodecs
 *
 * Connects to neko-engine's frame server via WebSocket,
 * receives H.264 NAL units, and decodes them using WebCodecs.
 *
 * Features:
 * - Hardware-accelerated H.264 decoding (WebCodecs)
 * - Performance statistics (decode time, latency, bitrate monitoring)
 * - Automatic reconnection with exponential backoff
 * - Keyframe-aware seek support
 *
 * Packet format (from Rust frame server):
 * [pts_us: i64 LE (8B)] [dts_us: i64 LE (8B)] [is_keyframe: u8 (1B)] [duration_us: i64 LE (8B)] [NAL data...]
 * PTS, DTS, and duration are in microseconds.
 */

import type {
  RenderFrameMeta,
  RenderStreamDescriptor,
  EngineRenderFrameDiagnostics,
  ViewportControlFlowDiagnostic,
  ViewportSerializableRecord,
} from '@neko/shared';
import { getLogger } from './utils/logger';
import {
  descriptorSceneId,
  parseJsonObject,
  readFiniteNumber,
  readRenderFrameDiagnostics,
  readRenderFrameMeta,
  trimOldestMapEntry,
} from './utils/wireReaders';

const logger = getLogger('H264');

const H264_HEADER_SIZE = 8 + 8 + 1 + 8; // pts(8) + dts(8) + is_keyframe(1) + duration(8) = 25 bytes
const DEFAULT_H264_BACKPRESSURE_POLICY: H264BackpressurePolicy = {
  maxDecodeQueueDepth: 4,
  dropDeltaFramesWhenBacklogged: false,
  preserveKeyframes: true,
  keyframeRequestDropThreshold: 30,
};

interface ParsedH264Packet {
  pts: number;
  dts: number;
  isKeyframe: boolean;
  duration: number;
  nalData: Uint8Array;
}

function parseH264Packet(data: ArrayBuffer): ParsedH264Packet | null {
  if (data.byteLength < H264_HEADER_SIZE) return null;

  const view = new DataView(data);

  const ptsLow = view.getUint32(0, true);
  const ptsHigh = view.getInt32(4, true);
  const pts = ptsLow + ptsHigh * 0x100000000;

  const dtsLow = view.getUint32(8, true);
  const dtsHigh = view.getInt32(12, true);
  const dts = dtsLow + dtsHigh * 0x100000000;

  const isKeyframe = view.getUint8(16) === 1;
  const durationLow = view.getUint32(17, true);
  const durationHigh = view.getInt32(21, true);
  const duration = durationLow + durationHigh * 0x100000000;
  const nalData = new Uint8Array(data, H264_HEADER_SIZE);

  return { pts, dts, isKeyframe, duration, nalData };
}

function decodeBase64Bytes(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const bufferCtor = globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding: 'base64'): Uint8Array };
  };
  if (bufferCtor.Buffer) {
    return bufferCtor.Buffer.from(value, 'base64');
  }

  throw new Error('Base64 decoder not available for H.264 init data');
}

function validateRenderStreamDescriptor(descriptor: RenderStreamDescriptor): void {
  if (descriptor.container !== 'h264-annexb' && descriptor.container !== 'h264-avcc') {
    throw new Error(`Unsupported 3D H.264 container: ${String(descriptor.container)}`);
  }
  if (descriptor.frameHeader !== 'neko-h264-v1') {
    throw new Error(`Unsupported 3D H.264 frame header: ${String(descriptor.frameHeader)}`);
  }
  if (!descriptor.codecString) {
    throw new Error('RenderStreamDescriptor.codecString is required');
  }
}

export function createRenderFrameMetaFromDescriptor(
  descriptor: RenderStreamDescriptor,
  packet: Pick<ParsedH264Packet, 'pts' | 'duration' | 'isKeyframe'>,
  frameId: number,
): RenderFrameMeta {
  const diagnostics = descriptor.qualityTier
    ? {
        qualityTier: descriptor.qualityTier,
      }
    : undefined;

  const meta: RenderFrameMeta = {
    streamId: descriptor.streamId,
    sceneId: descriptorSceneId(descriptor),
    viewportId: descriptor.viewportId,
    frameId,
    ptsUs: packet.pts,
    durationUs: packet.duration,
    isKeyframe: packet.isKeyframe,
    sceneRevision: descriptor.initialRevision,
    appliedSeq: 0,
    frameTimestamp: packet.pts / 1000,
    viewTransform: [1, 0, 0, 1, 0, 0],
  };
  if (diagnostics) {
    meta.diagnostics = diagnostics;
  }
  return meta;
}

// =============================================================================
// Types
// =============================================================================

export interface H264StreamClientConfig {
  /** WebSocket URL (e.g., ws://127.0.0.1:PORT/v1/streams/STREAM_ID) */
  websocketUrl: string;
  /** Engine 3D render stream descriptor. Required for Route A viewports. */
  descriptor?: RenderStreamDescriptor;
  /** Video width for decoder config */
  width: number;
  /** Video height for decoder config */
  height: number;
  /** Legacy codec override for non-3D callers without a descriptor */
  codecString?: string;
  /** Callback when a frame is decoded */
  onFrame?: (frame: VideoFrame, meta?: RenderFrameMeta) => void;
  /** Callback when packet metadata is aligned to a decoded frame */
  onFrameMeta?: (meta: RenderFrameMeta) => void;
  /** Callback for transport/metadata diagnostics that should not affect decode flow */
  onControlFlowDiagnostic?: (diagnostic: ViewportControlFlowDiagnostic) => void;
  /** Local budget for frame metadata delay diagnostics. Defaults to 100ms. */
  metadataDelayBudgetMs?: number;
  /** Callback on connection state change */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback when a packet is received (for bitrate monitoring) */
  onPacketReceived?: (sizeBytes: number) => void;
  /** Callback when the stream ends normally (EOF, close code 1000) */
  onStreamEnd?: () => void;
  /** Decode-stage backpressure. Callers opt in to lossy delta-frame drops for realtime streams. */
  backpressure?: H264BackpressurePolicy;
}

export interface H264StreamClientStats {
  packetsReceived: number;
  framesDecoded: number;
  framesDropped: number;
  framesDroppedBeforeDecode: number;
  isConnected: boolean;
  isDecoderReady: boolean;
  avgDecodeTimeMs: number;
  avgLatencyMs: number;
  decodeQueueDepth: number;
  hardwareAcceleration: boolean;
}

export interface H264FrameMetaExpectation {
  readonly sceneId?: string;
  readonly viewportId?: string;
  readonly streamId?: string;
  readonly revision?: number;
  readonly appliedSeq?: number;
  readonly seq?: number;
  readonly correlationId?: string;
  readonly timestamp?: number;
}

export interface H264BackpressurePolicy {
  readonly maxDecodeQueueDepth: number;
  readonly dropDeltaFramesWhenBacklogged: boolean;
  readonly preserveKeyframes: boolean;
  readonly keyframeRequestDropThreshold?: number;
  readonly latestOnly?: boolean;
}

interface PendingFrameMetaExpectation extends H264FrameMetaExpectation {
  readonly id: string;
  readonly createdAt: number;
}

interface DecodeFrameTiming {
  readonly packetToDecodeSubmitMs?: number;
  readonly packetToDecodeOutputMs?: number;
  readonly decodeSubmitToOutputMs?: number;
}

interface PacketByteSample {
  readonly bytes: number;
  readonly atMs: number;
}

type NormalizedH264StreamClientConfig = H264StreamClientConfig & {
  width: number;
  height: number;
  codecString: string;
  onFrame: (frame: VideoFrame, meta?: RenderFrameMeta) => void;
  onFrameMeta: (meta: RenderFrameMeta) => void;
  onControlFlowDiagnostic: (diagnostic: ViewportControlFlowDiagnostic) => void;
  metadataDelayBudgetMs: number;
  onConnectionChange: (connected: boolean) => void;
  onError: (error: Error) => void;
  onPacketReceived: (sizeBytes: number) => void;
  onStreamEnd: () => void;
  backpressure: H264BackpressurePolicy;
};

type H264AvcBitstreamFormat = 'annexb' | 'avc';
type H264HardwareAcceleration = 'no-preference' | 'prefer-hardware' | 'prefer-software';

type H264VideoDecoderConfig = VideoDecoderConfig & {
  avc?: {
    format: H264AvcBitstreamFormat;
  };
  latencyMode?: 'quality' | 'realtime';
};

function normalizeHardwareAccelerationPreference(value: unknown): H264HardwareAcceleration {
  switch (value) {
    case 'no-preference':
    case 'prefer-hardware':
    case 'prefer-software':
      return value;
    default:
      return 'prefer-hardware';
  }
}

// =============================================================================
// H264StreamClient
// =============================================================================

export class H264StreamClient {
  private config: NormalizedH264StreamClientConfig;
  private ws: WebSocket | null = null;
  private decoder: VideoDecoder | null = null;
  private disposed = false;
  private readonly descriptor: RenderStreamDescriptor | undefined;
  private readonly codecString: string;
  private readonly decoderDescription: Uint8Array | undefined;
  private nextFrameId = 1;

  private stats: H264StreamClientStats = {
    packetsReceived: 0,
    framesDecoded: 0,
    framesDropped: 0,
    framesDroppedBeforeDecode: 0,
    isConnected: false,
    isDecoderReady: false,
    avgDecodeTimeMs: 0,
    avgLatencyMs: 0,
    decodeQueueDepth: 0,
    hardwareAcceleration: false,
  };

  /** Whether we're waiting for a keyframe after seek/reset */
  private waitingForKeyframe = false;

  // Performance tracking (sliding window)
  private readonly maxSamples = 60;
  private decodeStartTimes: Map<number, number> = new Map(); // pts -> submitTime
  private decodeTimeSamples: number[] = [];
  private latencySamples: number[] = [];
  private droppedBeforeDecodeSinceLastFrame = 0;
  private consecutiveDroppedDeltaFrames = 0;
  private pendingFrames: Map<number, number> = new Map(); // pts -> receiveTime
  private pendingFrameMeta: Map<number, RenderFrameMeta> = new Map();
  private pendingSidebandFrameMeta: Map<number, RenderFrameMeta> = new Map();
  private pendingSidebandFrameMetaReceivedAt: Map<number, number> = new Map();
  private pendingFrameDiagnostics: Map<number, EngineRenderFrameDiagnostics> = new Map();
  private pendingPacketReceivedAt: Map<number, number> = new Map();
  private packetByteSamples: PacketByteSample[] = [];
  private decodedFrameTimestamps: Map<number, number> = new Map();
  private lastDecodeOutputAt: number | undefined;
  private currentDecodeOutputBurstStartedAt: number | undefined;
  private currentDecodeOutputBurstCount = 0;
  private latestFrameMeta: RenderFrameMeta | undefined;
  private readonly pendingFrameMetaExpectations = new Map<string, PendingFrameMetaExpectation>();
  private nextFrameMetaExpectationId = 1;

  // Reconnection
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // EOF detection: if no packets arrive for this long, consider stream ended.
  // Keep short (500ms) to avoid freezing when one video in a diff ends
  // before the other. Normal inter-packet gaps are ~33ms at 30fps.
  private static readonly EOF_TIMEOUT_MS = 500;
  private eofTimer: ReturnType<typeof setTimeout> | null = null;
  private streamEndFired = false;

  constructor(config: H264StreamClientConfig) {
    if (config.descriptor) {
      validateRenderStreamDescriptor(config.descriptor);
    }

    const descriptorWidth = config.descriptor?.width;
    const descriptorHeight = config.descriptor?.height;
    const initData = config.descriptor?.initData;

    this.config = {
      websocketUrl: config.websocketUrl,
      descriptor: config.descriptor,
      width: descriptorWidth ?? config.width,
      height: descriptorHeight ?? config.height,
      codecString: config.codecString ?? config.descriptor?.codecString ?? 'avc1.42001f',
      onFrame: config.onFrame ?? (() => {}),
      onFrameMeta: config.onFrameMeta ?? (() => {}),
      onControlFlowDiagnostic: config.onControlFlowDiagnostic ?? (() => {}),
      metadataDelayBudgetMs: config.metadataDelayBudgetMs ?? 100,
      onConnectionChange: config.onConnectionChange ?? (() => {}),
      onError: config.onError ?? (() => {}),
      onPacketReceived: config.onPacketReceived ?? (() => {}),
      onStreamEnd: config.onStreamEnd ?? (() => {}),
      backpressure: normalizeBackpressurePolicy(config.backpressure),
    };
    this.descriptor = config.descriptor;
    this.codecString = this.config.codecString;
    this.decoderDescription =
      initData?.format === 'avcc-record' && initData.data
        ? decodeBase64Bytes(initData.data)
        : undefined;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async connect(): Promise<void> {
    if (this.disposed) return;

    await this.initDecoder();
    this.setupWebSocket();
  }

  dispose(): void {
    this.disposed = true;
    this.clearEofTimer();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.close();
      } catch {
        // Ignore
      }
      this.decoder = null;
    }

    this.pendingFrames.clear();
    this.decodeStartTimes.clear();
    this.pendingFrameMeta.clear();
    this.pendingSidebandFrameMeta.clear();
    this.pendingSidebandFrameMetaReceivedAt.clear();
    this.pendingFrameDiagnostics.clear();
    this.pendingPacketReceivedAt.clear();
    this.packetByteSamples = [];
    this.decodedFrameTimestamps.clear();
    this.latestFrameMeta = undefined;
    this.pendingFrameMetaExpectations.clear();
    this.decodeTimeSamples = [];
    this.latencySamples = [];
    this.droppedBeforeDecodeSinceLastFrame = 0;
    this.consecutiveDroppedDeltaFrames = 0;
    this.stats.isConnected = false;
    this.stats.isDecoderReady = false;
  }

  getStats(): H264StreamClientStats {
    return { ...this.stats };
  }

  updateBackpressurePolicy(policy: H264BackpressurePolicy): void {
    this.config.backpressure = normalizeBackpressurePolicy(policy);
  }

  expectCompatibleFrameMeta(expectation: H264FrameMetaExpectation): string {
    const id = expectation.correlationId ?? `frame-meta-${this.nextFrameMetaExpectationId++}`;
    if (
      expectation.revision === undefined &&
      expectation.appliedSeq === undefined &&
      expectation.viewportId === undefined &&
      expectation.streamId === undefined
    ) {
      return id;
    }

    const now = performance.now();
    const pending: PendingFrameMetaExpectation = {
      ...expectation,
      id,
      createdAt: expectation.timestamp ?? now,
    };
    if (isRenderFrameMetaCompatibleWithExpectation(this.latestFrameMeta, pending)) {
      return id;
    }
    this.pendingFrameMetaExpectations.set(id, pending);
    this.reportControlFlowDiagnostic({
      kind: 'metadata',
      severity: 'info',
      code: 'render-frame-meta-ack-before-frame',
      message: 'Control acknowledgement arrived before compatible render frame metadata.',
      sceneId: pending.sceneId ?? this.latestFrameMeta?.sceneId,
      viewportId: pending.viewportId ?? this.latestFrameMeta?.viewportId,
      streamId: pending.streamId ?? this.latestFrameMeta?.streamId,
      seq: pending.seq,
      correlationId: pending.correlationId,
      revision: pending.revision,
      appliedSeq: pending.appliedSeq,
      metadataState: 'ack-before-frame',
      degradedReason: 'ack-before-frame',
      timestamp: now,
      details: finiteDetails({
        lastFrameRevision: this.latestFrameMeta?.sceneRevision,
        lastFrameAppliedSeq: this.latestFrameMeta?.appliedSeq,
        expectedRevision: pending.revision,
        expectedAppliedSeq: pending.appliedSeq,
        ageMs: now - pending.createdAt,
      }),
    });
    return id;
  }

  // =========================================================================
  // WebCodecs Decoder
  // =========================================================================

  private async initDecoder(): Promise<void> {
    if (typeof VideoDecoder === 'undefined') {
      this.config.onError(new Error('WebCodecs VideoDecoder not available'));
      return;
    }

    const support = await VideoDecoder.isConfigSupported(this.decoderConfig());

    if (!support.supported) {
      this.config.onError(new Error(`H.264 codec not supported: ${this.codecString}`));
      return;
    }

    this.stats.hardwareAcceleration = true;
    this.createDecoder();
  }

  private createDecoder(): void {
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.close();
      } catch {
        /* ignore */
      }
    }

    this.decoder = new VideoDecoder({
      output: (frame) => this.handleDecodedFrame(frame),
      error: (error) => {
        logger.error('Decoder error', error);
        this.stats.isDecoderReady = false;
        this.config.onError(error);
      },
    });

    this.decoder.configure({
      ...this.decoderConfig(),
      optimizeForLatency: true,
    });

    this.stats.isDecoderReady = true;
    this.waitingForKeyframe = true;
  }

  /**
   * Reset decoder state after seek.
   * Recreates the decoder so it starts clean from the next keyframe.
   */
  resetDecoder(): void {
    if (this.disposed) return;
    logger.info('Resetting decoder for seek');

    // Clear EOF timer — seek will resume the stream
    this.clearEofTimer();

    // Reset framesDecoded so the caller can detect when post-seek frames
    // start arriving (e.g. to freeze wall-clock until first new frame).
    this.stats.framesDecoded = 0;

    // Fast path: reset() + reconfigure avoids tearing down the HW context
    if (this.decoder && this.decoder.state === 'configured') {
      try {
        this.decoder.reset();
        this.decoder.configure({
          ...this.decoderConfig(),
          optimizeForLatency: true,
        });
        this.waitingForKeyframe = true;
        this.stats.isDecoderReady = true;
        logger.info('Decoder reset via fast path');
        return;
      } catch {
        logger.warn('Fast reset failed, falling back to createDecoder');
      }
    }

    this.createDecoder();
  }

  // =========================================================================
  // WebSocket
  // =========================================================================

  private setupWebSocket(): void {
    if (this.disposed) return;

    try {
      this.ws = new WebSocket(this.config.websocketUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.stats.isConnected = true;
        this.reconnectAttempts = 0;
        this.config.onConnectionChange(true);
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.handlePacket(event.data);
          return;
        }
        if (typeof event.data === 'string') {
          this.handleTextMessage(event.data);
        }
      };

      this.ws.onclose = (event) => {
        this.stats.isConnected = false;
        this.config.onConnectionChange(false);
        // Close code 1000 = normal closure (stream ended / EOF)
        if (event.code === 1000) {
          this.config.onStreamEnd();
          return; // Don't reconnect on normal EOF
        }
        this.tryReconnect();
      };

      this.ws.onerror = (event) => {
        logger.error('WebSocket error', event);
        this.config.onError(new Error('WebSocket connection error'));
      };
    } catch (error) {
      logger.error('WebSocket setup failed', error);
      this.config.onError(error instanceof Error ? error : new Error(String(error)));
      this.tryReconnect();
    }
  }

  private handlePacket(data: ArrayBuffer): void {
    this.stats.packetsReceived++;
    const receiveTime = performance.now();

    // Reset EOF timer — we got a packet, stream is still active
    this.resetEofTimer();

    // Notify packet size for bitrate monitoring
    this.config.onPacketReceived(data.byteLength);
    this.recordPacketBytes(data.byteLength, receiveTime);

    const packet = parseH264Packet(data);
    if (!packet) return;
    this.pendingPacketReceivedAt.set(packet.pts, receiveTime);
    const meta = this.createFrameMeta(packet);
    if (meta) {
      this.pendingFrameMeta.set(packet.pts, meta);
    }

    if (!this.decoder || this.decoder.state !== 'configured') {
      this.stats.framesDropped++;
      return;
    }

    // After seek/reset, wait for a keyframe before feeding delta frames
    if (this.waitingForKeyframe) {
      if (!packet.isKeyframe) {
        this.dropPacketBeforeDecode(packet, { waitForKeyframe: false });
        return;
      }
      this.waitingForKeyframe = false;
      logger.info('Keyframe received, decoding resumed');
    }

    this.updateDecodeQueueDepth();
    if (this.shouldDropPacketBeforeDecode(packet)) {
      this.dropPacketBeforeDecode(packet);
      return;
    }

    // Track timing for performance stats
    this.pendingFrames.set(packet.pts, receiveTime);
    this.decodeStartTimes.set(packet.pts, performance.now());

    try {
      const chunk = new EncodedVideoChunk({
        type: packet.isKeyframe ? 'key' : 'delta',
        timestamp: packet.pts,
        duration: packet.duration,
        data: packet.nalData,
      });
      this.decoder.decode(chunk);
    } catch (error) {
      this.stats.framesDropped++;
      logger.warn('Decode error', error);
    }
  }

  private handleDecodedFrame(frame: VideoFrame): void {
    if (this.disposed) {
      frame.close();
      return;
    }
    this.stats.framesDecoded++;
    const frameDecodedAt = performance.now();
    const previousDecodeOutputAt = this.lastDecodeOutputAt;
    const decodeOutputIntervalMs =
      previousDecodeOutputAt !== undefined ? frameDecodedAt - previousDecodeOutputAt : undefined;
    this.lastDecodeOutputAt = frameDecodedAt;
    const decodeOutputBurst = this.recordDecodeOutputBurst(frameDecodedAt);
    this.decodedFrameTimestamps.set(frame.timestamp, frameDecodedAt);
    trimOldestMapEntry(this.decodedFrameTimestamps, 100);

    const decodeTiming = this.consumeDecodeFrameTiming(frame.timestamp, frameDecodedAt);
    this.updateDecodeQueueDepth();

    const meta = this.pendingFrameMeta.get(frame.timestamp);
    if (meta) {
      this.pendingFrameMeta.delete(frame.timestamp);
      const diagnostics = this.pendingFrameDiagnostics.get(frame.timestamp);
      this.pendingFrameDiagnostics.delete(frame.timestamp);
      const packetReceivedAt = this.pendingPacketReceivedAt.get(frame.timestamp);
      this.pendingPacketReceivedAt.delete(frame.timestamp);
      const sidebandReceivedAt = this.pendingSidebandFrameMetaReceivedAt.get(frame.timestamp);
      this.pendingSidebandFrameMetaReceivedAt.delete(frame.timestamp);
      const metadataDelayMs =
        sidebandReceivedAt !== undefined && packetReceivedAt !== undefined
          ? sidebandReceivedAt - packetReceivedAt
          : undefined;
      if (metadataDelayMs !== undefined && metadataDelayMs > this.config.metadataDelayBudgetMs) {
        this.reportControlFlowDiagnostic({
          kind: 'metadata',
          severity: 'warning',
          code: 'render-frame-meta-delayed',
          message: 'Render frame metadata arrived after the configured metadata delay budget.',
          streamId: meta.streamId,
          viewportId: meta.viewportId,
          revision: meta.sceneRevision,
          appliedSeq: meta.appliedSeq,
          metadataState: 'delayed',
          degradedReason: 'metadata-delayed',
          timestamp: frameDecodedAt,
          details: finiteDetails({
            ptsUs: meta.ptsUs,
            frameId: meta.frameId,
            delayMs: metadataDelayMs,
            budgetMs: this.config.metadataDelayBudgetMs,
          }),
        });
      }
      const enrichedMeta = mergeRenderFrameDiagnostics(meta, {
        ...this.streamDiagnostics(),
        ...(diagnostics ?? {}),
        decodeSubmitToOutputMs: decodeTiming.decodeSubmitToOutputMs,
        decodeTimeMs: decodeTiming.decodeSubmitToOutputMs,
        packetToDecodeSubmitMs: decodeTiming.packetToDecodeSubmitMs,
        packetToDecodeOutputMs: decodeTiming.packetToDecodeOutputMs,
        decodeOutputLagFrames: frameLatencyToFrames(
          decodeTiming.packetToDecodeOutputMs,
          meta.durationUs,
        ),
        queueDepth: this.stats.decodeQueueDepth,
        webcodecsDecodeQueueSize: this.decoder?.decodeQueueSize ?? 0,
        pendingDecodeFrames: this.decodeStartTimes.size,
        decodeOutputIntervalMs,
        decodeOutputBurst,
        droppedBeforeDecode: this.consumeDroppedBeforeDecodeSinceLastFrame(),
      });
      this.latestFrameMeta = enrichedMeta;
      this.reconcileFrameMetaExpectations(enrichedMeta, frameDecodedAt);
      this.config.onFrameMeta(enrichedMeta);
      this.config.onFrame(frame, enrichedMeta);
    } else {
      const packetReceivedAt = this.pendingPacketReceivedAt.get(frame.timestamp);
      this.pendingPacketReceivedAt.delete(frame.timestamp);
      this.reportControlFlowDiagnostic({
        kind: 'metadata',
        severity: 'warning',
        code: 'render-frame-meta-missing',
        message: 'Decoded video frame has no compatible render frame metadata.',
        streamId: this.descriptor?.streamId,
        viewportId: this.descriptor?.viewportId,
        metadataState: 'missing',
        degradedReason: 'metadata-missing',
        timestamp: frameDecodedAt,
        details: finiteDetails({
          ptsUs: frame.timestamp,
          ageMs: packetReceivedAt !== undefined ? frameDecodedAt - packetReceivedAt : undefined,
        }),
      });
      // Pass frame to scheduler (caller is responsible for closing)
      this.config.onFrame(frame);
    }
    if (this.pendingFrameMeta.size > 100) {
      const oldest = Math.min(...this.pendingFrameMeta.keys());
      this.pendingFrameMeta.delete(oldest);
    }
    if (this.pendingFrameDiagnostics.size > 100) {
      const oldest = Math.min(...this.pendingFrameDiagnostics.keys());
      this.pendingFrameDiagnostics.delete(oldest);
    }
    trimOldestMapEntry(this.pendingPacketReceivedAt, 100);
  }

  private consumeDecodeFrameTiming(
    frameTimestamp: number,
    frameDecodedAt: number,
  ): DecodeFrameTiming {
    const decodeStart = this.decodeStartTimes.get(frameTimestamp);
    const receiveTime = this.pendingFrames.get(frameTimestamp);
    this.decodeStartTimes.delete(frameTimestamp);
    this.pendingFrames.delete(frameTimestamp);

    const decodeSubmitToOutputMs =
      decodeStart !== undefined ? frameDecodedAt - decodeStart : undefined;
    const packetToDecodeOutputMs =
      receiveTime !== undefined ? frameDecodedAt - receiveTime : undefined;
    const packetToDecodeSubmitMs =
      receiveTime !== undefined && decodeStart !== undefined
        ? decodeStart - receiveTime
        : undefined;

    if (decodeSubmitToOutputMs !== undefined) {
      this.decodeTimeSamples.push(decodeSubmitToOutputMs);
      if (this.decodeTimeSamples.length > this.maxSamples) {
        this.decodeTimeSamples.shift();
      }
      this.stats.avgDecodeTimeMs =
        this.decodeTimeSamples.reduce((a, b) => a + b, 0) / this.decodeTimeSamples.length;
    }

    if (packetToDecodeOutputMs !== undefined) {
      this.latencySamples.push(packetToDecodeOutputMs);
      if (this.latencySamples.length > this.maxSamples) {
        this.latencySamples.shift();
      }
      this.stats.avgLatencyMs =
        this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
    }

    if (this.decodeStartTimes.size > 100) {
      const oldest = Math.min(...this.decodeStartTimes.keys());
      this.decodeStartTimes.delete(oldest);
    }
    if (this.pendingFrames.size > 100) {
      const oldest = Math.min(...this.pendingFrames.keys());
      this.pendingFrames.delete(oldest);
    }

    return {
      packetToDecodeSubmitMs,
      packetToDecodeOutputMs,
      decodeSubmitToOutputMs,
    };
  }

  private recordPacketBytes(bytes: number, atMs: number): void {
    this.packetByteSamples.push({ bytes, atMs });
    const windowStart = atMs - 1000;
    while (
      this.packetByteSamples.length > 0 &&
      this.packetByteSamples[0] !== undefined &&
      this.packetByteSamples[0].atMs < windowStart
    ) {
      this.packetByteSamples.shift();
    }
  }

  private transportBitrateBps(nowMs = performance.now()): number {
    const windowStart = nowMs - 1000;
    const bytes = this.packetByteSamples
      .filter((sample) => sample.atMs >= windowStart)
      .reduce((total, sample) => total + sample.bytes, 0);
    return Math.round(bytes * 8);
  }

  private streamDiagnostics(): EngineRenderFrameDiagnostics {
    const descriptor = this.descriptor;
    return {
      streamWidth: descriptor?.width ?? this.config.width,
      streamHeight: descriptor?.height ?? this.config.height,
      codedWidth: descriptor?.codedWidth ?? descriptor?.width ?? this.config.width,
      codedHeight: descriptor?.codedHeight ?? descriptor?.height ?? this.config.height,
      scheduledWidth: descriptor?.scheduledWidth,
      scheduledHeight: descriptor?.scheduledHeight,
      scheduledFps: descriptor?.scheduledFps,
      gopSize: descriptor?.gopSize ?? descriptor?.h264?.gopSize,
      transportBitrateBps: this.transportBitrateBps(),
      codecString: this.codecString,
      codecProfile: descriptor?.profile,
      codecLevel: descriptor?.level,
      latencyMode: descriptor?.latencyMode,
      postProcessEnabled: descriptor?.postProcessEnabled,
      helperPassesEnabled: descriptor?.helperPassesEnabled,
      qualityTier: descriptor?.qualityTier,
    };
  }

  private decoderConfig(): H264VideoDecoderConfig {
    const config: H264VideoDecoderConfig = {
      codec: this.codecString,
      codedWidth: this.descriptor?.codedWidth ?? this.config.width,
      codedHeight: this.descriptor?.codedHeight ?? this.config.height,
      hardwareAcceleration: normalizeHardwareAccelerationPreference(
        this.descriptor?.h264?.decoderPreference,
      ),
      description: this.decoderDescription,
      latencyMode: this.descriptor?.latencyMode === 'quality' ? 'quality' : 'realtime',
    };
    if (this.descriptor) {
      config.avc = {
        format: this.descriptor.container === 'h264-annexb' ? 'annexb' : 'avc',
      };
    }
    return config;
  }

  private createFrameMeta(packet: ParsedH264Packet): RenderFrameMeta | null {
    const sidebandMeta = this.pendingSidebandFrameMeta.get(packet.pts);
    if (sidebandMeta) {
      this.pendingSidebandFrameMeta.delete(packet.pts);
      this.nextFrameId = Math.max(this.nextFrameId, sidebandMeta.frameId + 1);
      return sidebandMeta;
    }

    if (!this.descriptor) return null;
    return createRenderFrameMetaFromDescriptor(this.descriptor, packet, this.nextFrameId++);
  }

  private updateDecodeQueueDepth(): void {
    if (!this.decoder) return;
    this.stats.decodeQueueDepth = this.effectiveDecodeQueueDepth();
  }

  private recordDecodeOutputBurst(frameDecodedAt: number): number {
    if (
      this.currentDecodeOutputBurstStartedAt === undefined ||
      frameDecodedAt - this.currentDecodeOutputBurstStartedAt > 1
    ) {
      this.currentDecodeOutputBurstStartedAt = frameDecodedAt;
      this.currentDecodeOutputBurstCount = 1;
      return this.currentDecodeOutputBurstCount;
    }

    this.currentDecodeOutputBurstCount++;
    return this.currentDecodeOutputBurstCount;
  }

  private shouldDropPacketBeforeDecode(packet: ParsedH264Packet): boolean {
    const policy = this.config.backpressure;
    if (!policy.dropDeltaFramesWhenBacklogged && policy.latestOnly !== true) {
      return false;
    }
    if (packet.isKeyframe && policy.preserveKeyframes) {
      return false;
    }
    if (!this.decoder) {
      return false;
    }
    return this.effectiveDecodeQueueDepth() > policy.maxDecodeQueueDepth;
  }

  private effectiveDecodeQueueDepth(): number {
    return Math.max(this.decoder?.decodeQueueSize ?? 0, this.decodeStartTimes.size);
  }

  private dropPacketBeforeDecode(
    packet: ParsedH264Packet,
    options: { readonly waitForKeyframe?: boolean } = {},
  ): void {
    this.stats.framesDropped++;
    this.stats.framesDroppedBeforeDecode++;
    this.droppedBeforeDecodeSinceLastFrame++;
    this.pendingFrameMeta.delete(packet.pts);
    this.pendingFrameDiagnostics.delete(packet.pts);
    this.pendingPacketReceivedAt.delete(packet.pts);
    this.pendingSidebandFrameMeta.delete(packet.pts);
    this.pendingSidebandFrameMetaReceivedAt.delete(packet.pts);

    if (packet.isKeyframe) {
      this.consecutiveDroppedDeltaFrames = 0;
      this.reportDecodeBackpressureDiagnostic('keyframe', 1, undefined);
      return;
    }

    this.consecutiveDroppedDeltaFrames++;
    if (options.waitForKeyframe !== false) {
      this.waitingForKeyframe = true;
    }
    const threshold = this.config.backpressure.keyframeRequestDropThreshold;
    if (threshold !== undefined && this.consecutiveDroppedDeltaFrames >= threshold) {
      this.reportDecodeBackpressureDiagnostic(
        'delta',
        this.consecutiveDroppedDeltaFrames,
        threshold,
      );
      this.consecutiveDroppedDeltaFrames = 0;
    }
  }

  private reportDecodeBackpressureDiagnostic(
    frameKind: 'delta' | 'keyframe',
    droppedFrames: number,
    threshold: number | undefined,
  ): void {
    this.reportControlFlowDiagnostic({
      kind: 'metadata',
      severity: 'warning',
      code: 'decode-backpressure',
      message: 'Decoded stream is backlogged; dropped stale frames before WebCodecs.',
      streamId: this.descriptor?.streamId,
      viewportId: this.descriptor?.viewportId,
      metadataState: 'delayed',
      degradedReason: 'video-backpressure',
      timestamp: performance.now(),
      details: finiteDetails({
        decodeQueueDepth: this.stats.decodeQueueDepth,
        droppedDeltaFrames: frameKind === 'delta' ? droppedFrames : undefined,
        droppedKeyframes: frameKind === 'keyframe' ? droppedFrames : undefined,
        threshold,
      }),
    });
  }

  private consumeDroppedBeforeDecodeSinceLastFrame(): number {
    const dropped = this.droppedBeforeDecodeSinceLastFrame;
    this.droppedBeforeDecodeSinceLastFrame = 0;
    this.consecutiveDroppedDeltaFrames = 0;
    return dropped;
  }

  private handleTextMessage(data: string): void {
    const message = parseJsonObject(data);
    if (!message) {
      return;
    }

    if (message.type === 'renderFrameMeta') {
      const meta = readRenderFrameMeta(message.meta);
      if (!meta) {
        return;
      }
      const receivedAt = performance.now();
      const decodedAt = this.decodedFrameTimestamps.get(meta.ptsUs);
      if (decodedAt !== undefined) {
        this.reportControlFlowDiagnostic({
          kind: 'metadata',
          severity: 'warning',
          code: 'render-frame-meta-after-frame',
          message: 'Render frame metadata arrived after the matching video frame was decoded.',
          streamId: meta.streamId,
          viewportId: meta.viewportId,
          revision: meta.sceneRevision,
          appliedSeq: meta.appliedSeq,
          metadataState: 'delayed',
          degradedReason: 'video-backpressure',
          timestamp: receivedAt,
          details: finiteDetails({
            ptsUs: meta.ptsUs,
            frameId: meta.frameId,
            ageMs: receivedAt - decodedAt,
          }),
        });
      }
      this.pendingSidebandFrameMeta.set(meta.ptsUs, meta);
      this.pendingSidebandFrameMetaReceivedAt.set(meta.ptsUs, receivedAt);
      if (this.pendingFrameMeta.has(meta.ptsUs)) {
        this.pendingFrameMeta.set(meta.ptsUs, meta);
      }
      trimOldestMapEntry(this.pendingSidebandFrameMeta, 100);
      trimOldestMapEntry(this.pendingSidebandFrameMetaReceivedAt, 100);
      return;
    }

    if (message.type !== 'renderFrameDiagnostics') {
      return;
    }

    const ptsUs = readFiniteNumber(message.ptsUs);
    const diagnostics = readRenderFrameDiagnostics(message.diagnostics);
    if (ptsUs === undefined || !diagnostics) {
      return;
    }
    const existing = this.pendingFrameDiagnostics.get(ptsUs);
    this.pendingFrameDiagnostics.set(ptsUs, {
      ...existing,
      ...diagnostics,
    });
    trimOldestMapEntry(this.pendingFrameDiagnostics, 100);
  }

  private reportControlFlowDiagnostic(diagnostic: ViewportControlFlowDiagnostic): void {
    this.config.onControlFlowDiagnostic(diagnostic);
  }

  private reconcileFrameMetaExpectations(meta: RenderFrameMeta, timestamp: number): void {
    for (const [id, expectation] of this.pendingFrameMetaExpectations) {
      if (!isRenderFrameMetaRelevantToExpectation(meta, expectation)) {
        continue;
      }
      if (isRenderFrameMetaCompatibleWithExpectation(meta, expectation)) {
        this.pendingFrameMetaExpectations.delete(id);
        continue;
      }
      this.reportControlFlowDiagnostic({
        kind: 'metadata',
        severity: 'warning',
        code: 'render-frame-meta-stale',
        message: 'Render frame metadata is older than the expected control acknowledgement state.',
        sceneId: meta.sceneId ?? expectation.sceneId,
        viewportId: meta.viewportId,
        streamId: meta.streamId,
        seq: expectation.seq,
        correlationId: expectation.correlationId,
        revision: meta.sceneRevision,
        appliedSeq: meta.appliedSeq,
        metadataState: 'stale',
        degradedReason: 'metadata-stale',
        timestamp,
        details: finiteDetails({
          frameId: meta.frameId,
          ptsUs: meta.ptsUs,
          expectedRevision: expectation.revision,
          expectedAppliedSeq: expectation.appliedSeq,
          ageMs: timestamp - expectation.createdAt,
        }),
      });
    }
  }

  private tryReconnect(): void {
    if (this.disposed || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(100 * Math.pow(2, this.reconnectAttempts), 5000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.setupWebSocket();
    }, delay);
  }

  /**
   * Reset the EOF timeout timer. Called on every packet received.
   * If no packets arrive for EOF_TIMEOUT_MS, fires onStreamEnd once.
   */
  private resetEofTimer(): void {
    if (this.eofTimer) clearTimeout(this.eofTimer);
    // Only start EOF timer after we've received at least one packet
    if (this.stats.packetsReceived > 0) {
      this.eofTimer = setTimeout(() => {
        this.eofTimer = null;
        if (!this.disposed && !this.streamEndFired) {
          this.streamEndFired = true;
          logger.debug(`EOF detected (no packets for ${H264StreamClient.EOF_TIMEOUT_MS}ms)`);
          this.config.onStreamEnd();
        }
      }, H264StreamClient.EOF_TIMEOUT_MS);
    }
  }

  /** Clear EOF timer (called on dispose and seek reset) */
  private clearEofTimer(): void {
    if (this.eofTimer) {
      clearTimeout(this.eofTimer);
      this.eofTimer = null;
    }
    this.streamEndFired = false;
  }
}

function mergeRenderFrameDiagnostics(
  meta: RenderFrameMeta,
  diagnostics: EngineRenderFrameDiagnostics,
): RenderFrameMeta {
  return {
    ...meta,
    diagnostics: {
      ...meta.diagnostics,
      ...diagnostics,
    },
  };
}

function normalizeBackpressurePolicy(
  policy: H264BackpressurePolicy | undefined,
): H264BackpressurePolicy {
  if (!policy) {
    return DEFAULT_H264_BACKPRESSURE_POLICY;
  }
  return {
    maxDecodeQueueDepth: Math.max(0, Math.floor(policy.maxDecodeQueueDepth)),
    dropDeltaFramesWhenBacklogged: policy.dropDeltaFramesWhenBacklogged,
    preserveKeyframes: policy.preserveKeyframes,
    keyframeRequestDropThreshold:
      typeof policy.keyframeRequestDropThreshold === 'number'
        ? Math.max(1, Math.floor(policy.keyframeRequestDropThreshold))
        : undefined,
    latestOnly: policy.latestOnly === true,
  };
}

function finiteDetails(
  value: Record<string, number | undefined>,
): ViewportSerializableRecord | undefined {
  const entries = Object.entries(value).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function frameLatencyToFrames(
  latencyMs: number | undefined,
  durationUs: number,
): number | undefined {
  if (
    typeof latencyMs !== 'number' ||
    !Number.isFinite(latencyMs) ||
    latencyMs < 0 ||
    !Number.isFinite(durationUs) ||
    durationUs <= 0
  ) {
    return undefined;
  }
  return latencyMs / (durationUs / 1000);
}

function isRenderFrameMetaCompatibleWithExpectation(
  meta: RenderFrameMeta | undefined,
  expectation: H264FrameMetaExpectation,
): boolean {
  if (!meta || !isRenderFrameMetaRelevantToExpectation(meta, expectation)) {
    return false;
  }
  if (expectation.revision !== undefined && meta.sceneRevision < expectation.revision) {
    return false;
  }
  if (expectation.appliedSeq !== undefined && meta.appliedSeq < expectation.appliedSeq) {
    return false;
  }
  return true;
}

function isRenderFrameMetaRelevantToExpectation(
  meta: RenderFrameMeta,
  expectation: H264FrameMetaExpectation,
): boolean {
  return (
    (expectation.streamId === undefined || meta.streamId === expectation.streamId) &&
    (expectation.viewportId === undefined || meta.viewportId === expectation.viewportId) &&
    (expectation.sceneId === undefined ||
      meta.sceneId === undefined ||
      meta.sceneId === expectation.sceneId)
  );
}
