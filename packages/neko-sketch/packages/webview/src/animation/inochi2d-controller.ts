/**
 * Inochi2DController — drives 2D puppet rendering via neko-engine HTTP API
 *
 * Loads INP files through the engine backend (native-puppet crate),
 * manages parameter-driven deformation, and provides vertex data
 * for WebGL2 rendering in the sketch canvas.
 *
 * Data flow:
 *   INP file → EngineClient.loadPuppet() → PuppetSnapshot (textures, meshes, params)
 *   Parameter change → EngineClient.setPuppetParameter() → recomputed vertices
 *   Tick → EngineClient.tickPuppet() → PuppetDelta (deformed meshes)
 */

import type { EngineClient } from '@neko/neko-client';
import type {
  AnimationClipInfo,
  DeformedMesh,
  ParameterInfo,
  PuppetDelta,
  PuppetSnapshot,
} from './types';

/** Interface for puppet controller (enables testing/mocking) */
export interface IInochi2DController {
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
  ): void;

  /** Stop the managed preview stream */
  stopPreviewStream(): void;

  /** Whether the preview stream is currently active */
  isStreaming(): boolean;
}

/** Concrete implementation using EngineClient HTTP dispatch */
export class Inochi2DController implements IInochi2DController {
  private snapshot: PuppetSnapshot | null = null;
  private activeStream: WebSocket | null = null;
  private previewActive = false;
  private previewOnDelta: ((delta: PuppetDelta) => void) | null = null;
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
    if (this.activeStream) {
      this.activeStream.close();
      this.activeStream = null;
    }
  }

  startPreviewStream(
    onDelta: (delta: PuppetDelta) => void,
    onStatusChange?: (connected: boolean) => void,
  ): void {
    this.stopPreviewStream();

    this.previewActive = true;
    this.previewOnDelta = onDelta;
    this.previewOnStatus = onStatusChange ?? null;

    this.openPreviewWs();
  }

  stopPreviewStream(): void {
    this.previewActive = false;
    this.previewOnDelta = null;
    this.previewOnStatus = null;
    this.disconnectStream();
  }

  isStreaming(): boolean {
    return this.previewActive && this.activeStream?.readyState === WebSocket.OPEN;
  }

  /** Internal: open the WebSocket and wire up reconnect on unexpected close */
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
