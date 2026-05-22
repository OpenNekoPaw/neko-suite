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
import type {
  EditorKeyframeTrack,
  EasingType,
  NkpNativeProjectData,
  PuppetCommand,
  PuppetCommandAck,
  ParameterCurveInfo,
  PuppetAuxiliaryJsonData,
} from '@neko/shared';
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

  /** Load an INP/MOC3 puppet from an engine-resolved local source. */
  loadSource(source: string): Promise<PuppetSnapshot>;

  /** Load a native .nkp v2 project. */
  loadNativeProject(project: NkpNativeProjectData): Promise<PuppetSnapshot>;

  /** Load Live2D auxiliary JSON after the MOC3 source has been loaded. */
  loadAuxiliary(auxiliary: PuppetAuxiliaryJsonData): Promise<void>;

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

  /** Apply a native puppet command with optimistic revision metadata. */
  applyNativeCommand(
    seq: number,
    baseRevision: number,
    command: PuppetCommand,
    transactionId?: string,
  ): Promise<PuppetCommandAck>;
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
    this.snapshot = readPuppetSnapshot(raw);
    return this.snapshot;
  }

  async loadSource(source: string): Promise<PuppetSnapshot> {
    const raw = await this.engine.loadPuppetSource(source);
    this.snapshot = readPuppetSnapshot(raw);
    return this.snapshot;
  }

  async loadNativeProject(project: NkpNativeProjectData): Promise<PuppetSnapshot> {
    const raw = await this.engine.loadNativePuppetProject(project);
    this.snapshot = readPuppetSnapshot(raw);
    return this.snapshot;
  }

  async loadAuxiliary(auxiliary: PuppetAuxiliaryJsonData): Promise<void> {
    await this.engine.loadPuppetAuxiliary(auxiliary);
  }

  async setParameter(name: string, value: number): Promise<void> {
    await this.engine.setPuppetParameter(name, value);
  }

  async getParameters(): Promise<ParameterInfo[]> {
    const raw = await this.engine.getPuppetParameters();
    return readParameterInfoArray(raw);
  }

  async tick(deltaMs?: number): Promise<DeformedMesh[]> {
    const raw = await this.engine.tickPuppet(deltaMs);
    const delta = readPuppetDelta(raw);
    return delta.deformed_meshes;
  }

  async getMeshes(): Promise<DeformedMesh[]> {
    const raw = await this.engine.getPuppetMeshes();
    return readDeformedMeshArray(raw);
  }

  getSnapshot(): PuppetSnapshot | null {
    return this.snapshot;
  }

  isLoaded(): boolean {
    return this.snapshot !== null;
  }

  async getAnimations(): Promise<AnimationClipInfo[]> {
    const raw = await this.engine.getPuppetAnimations();
    return readAnimationClipInfoArray(raw);
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
        const delta = readPuppetDelta(JSON.parse(event.data as string) as unknown);
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
    const curves = readParameterCurveInfoArray(raw);
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

  async applyNativeCommand(
    seq: number,
    baseRevision: number,
    command: PuppetCommand,
    transactionId?: string,
  ): Promise<PuppetCommandAck> {
    return this.engine.applyPuppetCommandOrThrow({
      seq,
      baseRevision,
      transactionId,
      command,
    });
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
        const delta = readPuppetDelta(JSON.parse(event.data as string) as unknown);
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

function readPuppetSnapshot(value: unknown): PuppetSnapshot {
  if (isPuppetSnapshot(value)) return value;
  throw new Error('Invalid puppet snapshot response');
}

function readParameterInfoArray(value: unknown): ParameterInfo[] {
  if (isArrayOf(value, isParameterInfo)) return value;
  throw new Error('Invalid puppet parameters response');
}

function readPuppetDelta(value: unknown): PuppetDelta {
  if (isPuppetDelta(value)) return value;
  throw new Error('Invalid puppet delta response');
}

function readDeformedMeshArray(value: unknown): DeformedMesh[] {
  if (isArrayOf(value, isDeformedMesh)) return value;
  throw new Error('Invalid puppet meshes response');
}

function readAnimationClipInfoArray(value: unknown): AnimationClipInfo[] {
  if (isArrayOf(value, isAnimationClipInfo)) return value;
  throw new Error('Invalid puppet animations response');
}

function readParameterCurveInfoArray(value: unknown): ParameterCurveInfo[] {
  if (isArrayOf(value, isParameterCurveInfo)) return value;
  throw new Error('Invalid puppet keyframe tracks response');
}

function isPuppetSnapshot(value: unknown): value is PuppetSnapshot {
  if (!isRecord(value)) return false;
  return (
    (value.format === undefined ||
      value.format === 'inp' ||
      value.format === 'moc3' ||
      value.format === 'native') &&
    isArrayOf(value.nodes, isPuppetNodeSnapshot) &&
    isArrayOf(value.parameters, isParameterInfo) &&
    isArrayOf(value.meshes, isMeshSnapshot)
  );
}

function isPuppetDelta(value: unknown): value is PuppetDelta {
  if (!isRecord(value)) return false;
  return (
    isArrayOf(value.deformed_meshes, isDeformedMesh) &&
    (value.animation_time_ms === undefined || typeof value.animation_time_ms === 'number') &&
    (value.animation_playing === undefined || typeof value.animation_playing === 'boolean')
  );
}

function isPuppetNodeSnapshot(value: unknown): value is PuppetSnapshot['nodes'][number] {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.node_type === 'string' &&
    isVec2(value.position) &&
    typeof value.rotation === 'number' &&
    isVec2(value.scale) &&
    typeof value.z_order === 'number' &&
    typeof value.opacity === 'number' &&
    (value.parent_id === null || typeof value.parent_id === 'string') &&
    typeof value.has_mesh === 'boolean'
  );
}

function isParameterInfo(value: unknown): value is ParameterInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.min === 'number' &&
    typeof value.max === 'number' &&
    typeof value.default === 'number' &&
    typeof value.current === 'number'
  );
}

function isMeshSnapshot(value: unknown): value is PuppetSnapshot['meshes'][number] {
  if (!isRecord(value)) return false;
  const textureIndex = value.texture_index;
  return (
    typeof value.node_id === 'string' &&
    isArrayOf(value.vertices, isVec2) &&
    isArrayOf(value.uvs, isVec2) &&
    Array.isArray(value.indices) &&
    value.indices.every((index) => Number.isInteger(index) && index >= 0) &&
    (textureIndex === null ||
      (typeof textureIndex === 'number' && Number.isInteger(textureIndex) && textureIndex >= 0))
  );
}

function isDeformedMesh(value: unknown): value is DeformedMesh {
  if (!isRecord(value)) return false;
  return (
    typeof value.node_id === 'string' &&
    isArrayOf(value.vertices, isVec2) &&
    typeof value.blend_mode === 'string' &&
    typeof value.opacity === 'number' &&
    typeof value.z_order === 'number'
  );
}

function isAnimationClipInfo(value: unknown): value is AnimationClipInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.duration_ms === 'number' &&
    typeof value.loop_default === 'boolean'
  );
}

function isParameterCurveInfo(value: unknown): value is ParameterCurveInfo {
  if (!isRecord(value)) return false;
  return typeof value.param_name === 'string' && isArrayOf(value.keyframes, isKeyframeInfo);
}

function isKeyframeInfo(value: unknown): value is ParameterCurveInfo['keyframes'][number] {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.time_ms === 'number' &&
    typeof value.value === 'number' &&
    typeof value.easing === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isVec2(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}
