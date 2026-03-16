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

import { getLogger } from './utils/logger';

const logger = getLogger('H264');

const H264_HEADER_SIZE = 8 + 8 + 1 + 8; // pts(8) + dts(8) + is_keyframe(1) + duration(8) = 25 bytes

function parseH264Packet(data: ArrayBuffer): {
  pts: number;
  dts: number;
  isKeyframe: boolean;
  nalData: Uint8Array;
} | null {
  if (data.byteLength < H264_HEADER_SIZE) return null;

  const view = new DataView(data);

  const ptsLow = view.getUint32(0, true);
  const ptsHigh = view.getInt32(4, true);
  const pts = ptsLow + ptsHigh * 0x100000000;

  const dtsLow = view.getUint32(8, true);
  const dtsHigh = view.getInt32(12, true);
  const dts = dtsLow + dtsHigh * 0x100000000;

  const isKeyframe = view.getUint8(16) === 1;
  // Skip duration field (8 bytes at offset 17)
  const nalData = new Uint8Array(data, H264_HEADER_SIZE);

  return { pts, dts, isKeyframe, nalData };
}

// =============================================================================
// Types
// =============================================================================

export interface H264StreamClientConfig {
  /** WebSocket URL (e.g., ws://127.0.0.1:PORT/v1/streams/STREAM_ID) */
  websocketUrl: string;
  /** Video width for decoder config */
  width: number;
  /** Video height for decoder config */
  height: number;
  /** Callback when a frame is decoded */
  onFrame?: (frame: VideoFrame) => void;
  /** Callback on connection state change */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback when a packet is received (for bitrate monitoring) */
  onPacketReceived?: (sizeBytes: number) => void;
  /** Callback when the stream ends normally (EOF, close code 1000) */
  onStreamEnd?: () => void;
}

export interface H264StreamClientStats {
  packetsReceived: number;
  framesDecoded: number;
  framesDropped: number;
  isConnected: boolean;
  isDecoderReady: boolean;
  avgDecodeTimeMs: number;
  avgLatencyMs: number;
  hardwareAcceleration: boolean;
}

// =============================================================================
// H264StreamClient
// =============================================================================

export class H264StreamClient {
  private config: Required<H264StreamClientConfig>;
  private ws: WebSocket | null = null;
  private decoder: VideoDecoder | null = null;
  private disposed = false;

  private stats: H264StreamClientStats = {
    packetsReceived: 0,
    framesDecoded: 0,
    framesDropped: 0,
    isConnected: false,
    isDecoderReady: false,
    avgDecodeTimeMs: 0,
    avgLatencyMs: 0,
    hardwareAcceleration: false,
  };

  /** Whether we're waiting for a keyframe after seek/reset */
  private waitingForKeyframe = false;

  // Performance tracking (sliding window)
  private readonly maxSamples = 60;
  private decodeStartTimes: Map<number, number> = new Map(); // pts -> submitTime
  private decodeTimeSamples: number[] = [];
  private latencySamples: number[] = [];
  private pendingFrames: Map<number, number> = new Map(); // pts -> receiveTime

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
    this.config = {
      websocketUrl: config.websocketUrl,
      width: config.width,
      height: config.height,
      onFrame: config.onFrame ?? (() => {}),
      onConnectionChange: config.onConnectionChange ?? (() => {}),
      onError: config.onError ?? (() => {}),
      onPacketReceived: config.onPacketReceived ?? (() => {}),
      onStreamEnd: config.onStreamEnd ?? (() => {}),
    };
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
    this.decodeTimeSamples = [];
    this.latencySamples = [];
    this.stats.isConnected = false;
    this.stats.isDecoderReady = false;
  }

  getStats(): H264StreamClientStats {
    return { ...this.stats };
  }

  // =========================================================================
  // WebCodecs Decoder
  // =========================================================================

  /** Codec string — H.264 Baseline Profile Level 3.1 (matches neko-engine preview encoder) */
  private readonly codecString = 'avc1.42001f';

  private async initDecoder(): Promise<void> {
    if (typeof VideoDecoder === 'undefined') {
      this.config.onError(new Error('WebCodecs VideoDecoder not available'));
      return;
    }

    const support = await VideoDecoder.isConfigSupported({
      codec: this.codecString,
      hardwareAcceleration: 'prefer-hardware',
    });

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
      codec: this.codecString,
      hardwareAcceleration: 'prefer-hardware',
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
          codec: this.codecString,
          hardwareAcceleration: 'prefer-hardware',
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

    const packet = parseH264Packet(data);
    if (!packet) return;

    if (!this.decoder || this.decoder.state !== 'configured') {
      this.stats.framesDropped++;
      return;
    }

    // After seek/reset, wait for a keyframe before feeding delta frames
    if (this.waitingForKeyframe) {
      if (!packet.isKeyframe) {
        this.stats.framesDropped++;
        return;
      }
      this.waitingForKeyframe = false;
      logger.info('Keyframe received, decoding resumed');
    }

    // Track timing for performance stats
    this.pendingFrames.set(packet.pts, receiveTime);
    this.decodeStartTimes.set(packet.pts, performance.now());

    try {
      const chunk = new EncodedVideoChunk({
        type: packet.isKeyframe ? 'key' : 'delta',
        timestamp: packet.pts,
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

    // Calculate decode time (submit -> output)
    const decodeStart = this.decodeStartTimes.get(frame.timestamp);
    if (decodeStart !== undefined) {
      this.decodeStartTimes.delete(frame.timestamp);
      const decodeTime = performance.now() - decodeStart;
      this.decodeTimeSamples.push(decodeTime);
      if (this.decodeTimeSamples.length > this.maxSamples) {
        this.decodeTimeSamples.shift();
      }
      this.stats.avgDecodeTimeMs =
        this.decodeTimeSamples.reduce((a, b) => a + b, 0) / this.decodeTimeSamples.length;
    }

    // Prevent memory leak in tracking maps
    if (this.decodeStartTimes.size > 100) {
      const oldest = Math.min(...this.decodeStartTimes.keys());
      this.decodeStartTimes.delete(oldest);
    }

    // Calculate latency
    const receiveTime = this.pendingFrames.get(frame.timestamp);
    if (receiveTime !== undefined) {
      this.pendingFrames.delete(frame.timestamp);
      const latency = performance.now() - receiveTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > this.maxSamples) {
        this.latencySamples.shift();
      }
      this.stats.avgLatencyMs =
        this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
    }

    if (this.pendingFrames.size > 100) {
      const oldest = Math.min(...this.pendingFrames.keys());
      this.pendingFrames.delete(oldest);
    }

    // Pass frame to scheduler (caller is responsible for closing)
    this.config.onFrame(frame);
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
