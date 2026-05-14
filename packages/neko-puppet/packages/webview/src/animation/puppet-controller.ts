/**
 * PuppetController — drives 2D puppet rendering via neko-engine HTTP API
 *
 * Loads puppet files (INP legacy / MOC3) through the engine backend (runtime-puppet crate),
 * manages parameter-driven deformation, and provides vertex data
 * for WebGL2 rendering in the puppet editor.
 *
 * Data flow:
 *   Puppet file → EngineClient.loadPuppet() → PuppetSnapshot (textures, meshes, params)
 *   Parameter change → EngineClient.setPuppetParameter() → recomputed vertices
 *   Tick → EngineClient.tickPuppet() → PuppetDelta (deformed meshes)
 */

import { H264StreamClient, type EngineClient } from '@neko/neko-client';
import type { EditorKeyframeTrack, ParameterCurveInfo, EasingType } from '@neko/shared';
import type {
  AnimationClipInfo,
  DeformedMesh,
  ParameterInfo,
  PuppetDelta,
  PuppetSnapshot,
} from './types';

/** Interface for puppet controller (enables testing/mocking) */
export interface IPuppetController {
  /** Load an INP puppet file */
  load(data: ArrayBuffer): Promise<PuppetSnapshot>;

  /** Set a parameter value (triggers deformation) */
  setParameter(name: string, value: number): Promise<void>;

  /** Get all parameter definitions */
  getParameters(): Promise<ParameterInfo[]>;

  /** Advance physics and get deformed mesh data */
  tick(deltaMs?: number): Promise<DeformedMesh[]>;

  /** Get current deformed meshes without advancing physics */
  getMeshes(): Promise<DeformedMesh[]>;

  /** Get the last loaded snapshot */
  getSnapshot(): PuppetSnapshot | null;

  /** Whether a puppet is currently loaded */
  isLoaded(): boolean;

  /** Get all available animation clip descriptions */
  getAnimations(): Promise<AnimationClipInfo[]>;

  /** Play a named animation clip */
  playAnimation(name: string, loop?: boolean): Promise<void>;

  /** Stop the current animation */
  stopAnimation(): Promise<void>;

  /** Seek the current animation to a time position (milliseconds) */
  seekAnimation(timeMs: number): Promise<void>;

  /**
   * Open a WebSocket connection to the 60fps puppet delta stream.
   * Calls onDelta for each received PuppetDelta message.
   * Returns a cleanup function that closes the WebSocket.
   */
  connectStream(onDelta: (delta: PuppetDelta) => void): () => void;

  /** Disconnect the active stream (no-op if not connected) */
  disconnectStream(): void;

  /**
   * Start a managed preview stream for the editor.
   * Connects the WebSocket, invokes onDelta for each frame,
   * and calls onStatusChange when connection state changes.
   * Automatically reconnects on unexpected disconnect while active.
   */
  startPreviewStream(
    onDelta: (delta: PuppetDelta) => void,
    onStatusChange?: (connected: boolean) => void,
    onFrame?: (frame: VideoFrame) => void,
  ): void;

  /** Stop the managed preview stream */
  stopPreviewStream(): void;

  /** Whether the preview stream is currently active */
  isStreaming(): boolean;

  // ── Keyframe CRUD ──────────────────────────────────────────────────────────

  /** Get keyframe tracks for a named animation clip */
  getKeyframeTracks(clipName: string): Promise<EditorKeyframeTrack[]>;

  /** Add a keyframe to a parameter curve; returns the new keyframe ID */
  addKeyframe(clipName: string, paramName: string, timeMs: number, value: number): Promise<string>;

  /** Remove a keyframe from a parameter curve */
  removeKeyframe(clipName: string, paramName: string, keyframeId: string): Promise<void>;

  /** Update a keyframe's time, value, or easing */
  updateKeyframe(
    clipName: string,
    paramName: string,
    keyframeId: string,
    updates: { timeMs?: number; value?: number; easing?: EasingType },
  ): Promise<void>;

  /** Create a new empty animation clip */
  createClip(name: string, durationMs: number): Promise<void>;

  /** Crossfade from the current animation to another clip */
  crossfadeTo(clipName: string, fadeDurationMs: number, loop?: boolean): Promise<void>;
}

/** Concrete implementation using EngineClient HTTP dispatch */
export class PuppetController implements IPuppetController {
  private snapshot: PuppetSnapshot | null = null;
  private activeStream: WebSocket | null = null;
  private activeH264Stream: H264StreamClient | null = null;
  private previewActive = false;
  private previewOnDelta: ((delta: PuppetDelta) => void) | null = null;
  private previewOnFrame: ((frame: VideoFrame) => void) | null = null;
  private previewOnStatus: ((connected: boolean) => void) | null = null;

  constructor(private readonly engine: EngineClient) {}

  async load(data: ArrayBuffer): Promise<PuppetSnapshot> {
    const raw = await this.engine.loadPuppet(data);
    this.snapshot = raw as unknown as PuppetSnapshot;
    return this.snapshot;
  }

  async setParameter(name: string, value: number): Promise<void> {
    await this.engine.setPuppetParameter(name, value);
  }

  async getParameters(): Promise<ParameterInfo[]> {
    const raw = await this.engine.getPuppetParameters();
    return raw as unknown as ParameterInfo[];
  }

  async tick(deltaMs?: number): Promise<DeformedMesh[]> {
    const raw = await this.engine.tickPuppet(deltaMs);
    const delta = raw as unknown as PuppetDelta;
    return delta.deformed_meshes;
  }

  async getMeshes(): Promise<DeformedMesh[]> {
    const raw = await this.engine.getPuppetMeshes();
    return raw as unknown as DeformedMesh[];
  }

  getSnapshot(): PuppetSnapshot | null {
    return this.snapshot;
  }

  isLoaded(): boolean {
    return this.snapshot !== null;
  }

  async getAnimations(): Promise<AnimationClipInfo[]> {
    const raw = await this.engine.getPuppetAnimations();
    return raw as unknown as AnimationClipInfo[];
  }

  async playAnimation(name: string, loop = false): Promise<void> {
    await this.engine.playPuppetAnimation(name, loop);
  }

  async stopAnimation(): Promise<void> {
    await this.engine.stopPuppetAnimation();
  }

  async seekAnimation(timeMs: number): Promise<void> {
    await this.engine.seekPuppetAnimation(timeMs);
  }

  connectStream(onDelta: (delta: PuppetDelta) => void): () => void {
    this.disconnectStream();

    const ws = this.engine.openPuppetStream();
    this.activeStream = ws;

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const delta = JSON.parse(event.data as string) as PuppetDelta;
        onDelta(delta);
      } catch {
        // Ignore malformed messages
      }
    });

    return () => this.disconnectStream();
  }

  disconnectStream(): void {
    if (this.activeH264Stream) {
      this.activeH264Stream.dispose();
      this.activeH264Stream = null;
    }
    if (this.activeStream) {
      this.activeStream.close();
      this.activeStream = null;
    }
  }

  startPreviewStream(
    onDelta: (delta: PuppetDelta) => void,
    onStatusChange?: (connected: boolean) => void,
    onFrame?: (frame: VideoFrame) => void,
  ): void {
    this.stopPreviewStream();

    this.previewActive = true;
    this.previewOnDelta = onDelta;
    this.previewOnFrame = onFrame ?? null;
    this.previewOnStatus = onStatusChange ?? null;

    void this.openPreferredPreviewStream();
  }

  stopPreviewStream(): void {
    this.previewActive = false;
    this.previewOnDelta = null;
    this.previewOnFrame = null;
    this.previewOnStatus = null;
    this.disconnectStream();
  }

  isStreaming(): boolean {
    const jsonStreamOpen = this.activeStream?.readyState === WebSocket.OPEN;
    return this.previewActive && (jsonStreamOpen || this.activeH264Stream !== null);
  }

  // ── Keyframe CRUD ────────────────────────────────────────────────────────

  async getKeyframeTracks(clipName: string): Promise<EditorKeyframeTrack[]> {
    const raw = await this.engine.getPuppetKeyframeTracks(clipName);
    const curves = raw as unknown as ParameterCurveInfo[];
    return curves.map((c) => ({
      property: c.param_name,
      label: c.param_name,
      min: 0,
      max: 1,
      defaultValue: 0,
      keyframes: c.keyframes.map((kf) => ({
        id: kf.id,
        timeMs: kf.time_ms,
        value: kf.value,
        easing: (kf.easing as EasingType) || 'linear',
      })),
    }));
  }

  async addKeyframe(
    clipName: string,
    paramName: string,
    timeMs: number,
    value: number,
  ): Promise<string> {
    const result = await this.engine.addPuppetKeyframe(clipName, paramName, timeMs, value);
    return result.id;
  }

  async removeKeyframe(clipName: string, paramName: string, keyframeId: string): Promise<void> {
    await this.engine.removePuppetKeyframe(clipName, paramName, keyframeId);
  }

  async updateKeyframe(
    clipName: string,
    paramName: string,
    keyframeId: string,
    updates: { timeMs?: number; value?: number; easing?: EasingType },
  ): Promise<void> {
    await this.engine.updatePuppetKeyframe(clipName, paramName, keyframeId, {
      timeMs: updates.timeMs,
      value: updates.value,
      easing: updates.easing,
    });
  }

  async createClip(name: string, durationMs: number): Promise<void> {
    await this.engine.createPuppetClip(name, durationMs);
  }

  async crossfadeTo(clipName: string, fadeDurationMs: number, loop = false): Promise<void> {
    await this.engine.crossfadePuppetAnimation(clipName, fadeDurationMs, loop);
  }

  /** Internal: open the WebSocket and wire up reconnect on unexpected close */
  private async openPreferredPreviewStream(): Promise<void> {
    if (!this.previewActive) return;

    if (this.previewOnFrame && (await canUseH264Preview())) {
      this.openH264PreviewStream();
      return;
    }

    this.openPreviewWs();
  }

  private openH264PreviewStream(): void {
    this.disconnectStream();

    const handle = this.engine.createPuppetH264StreamHandle();
    let fallbackStarted = false;
    const startJsonFallback = () => {
      if (!this.previewActive || fallbackStarted) return;
      fallbackStarted = true;
      this.activeH264Stream?.dispose();
      this.activeH264Stream = null;
      this.openPreviewWs();
    };

    const stream = new H264StreamClient({
      websocketUrl: handle.wsUrl,
      width: handle.width,
      height: handle.height,
      codecString: handle.codecString,
      onFrame: (frame) => {
        if (!this.previewActive) {
          frame.close();
          return;
        }
        this.previewOnFrame?.(frame);
      },
      onConnectionChange: (connected) => {
        this.previewOnStatus?.(connected);
        if (!connected) {
          startJsonFallback();
        }
      },
      onError: () => {
        startJsonFallback();
      },
      onStreamEnd: () => {
        startJsonFallback();
      },
    });

    this.activeH264Stream = stream;
    void stream.connect().catch(() => {
      startJsonFallback();
    });
  }

  private openPreviewWs(): void {
    this.disconnectStream();

    const ws = this.engine.openPuppetStream();
    this.activeStream = ws;

    ws.addEventListener('open', () => {
      this.previewOnStatus?.(true);
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      if (!this.previewActive) return;
      try {
        const delta = JSON.parse(event.data as string) as PuppetDelta;
        this.previewOnDelta?.(delta);
      } catch {
        // Ignore malformed frames
      }
    });

    ws.addEventListener('close', () => {
      this.previewOnStatus?.(false);
      // Reconnect if the stream was closed unexpectedly while still active
      if (this.previewActive) {
        setTimeout(() => {
          if (this.previewActive) this.openPreviewWs();
        }, 500);
      }
    });

    ws.addEventListener('error', () => {
      // The 'close' handler will fire after 'error', which handles reconnect
    });
  }
}

async function canUseH264Preview(): Promise<boolean> {
  if (typeof VideoDecoder === 'undefined') return false;
  try {
    const support = await VideoDecoder.isConfigSupported({
      codec: 'avc1.42001f',
      hardwareAcceleration: 'prefer-hardware',
    });
    return support.supported === true;
  } catch {
    return false;
  }
}
