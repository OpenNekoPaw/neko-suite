/**
 * EngineClient — HTTP/WS client for neko-engine Frame Server
 *
 * Environment-agnostic: works in both Extension Host (Node.js 18+)
 * and Webview (browser).  Uses only fetch() + WebSocket — zero
 * vscode dependency.  Port is injected via constructor.
 *
 * Usage (Extension Host):
 *   const { port } = await vscode.commands.executeCommand('neko.engine.ensureFrameServer');
 *   const client = new EngineClient(port);
 *
 * Usage (Webview — port received via postMessage):
 *   const client = new EngineClient(port);
 *   const info = await client.probe('videos', '/path/to/file.mp4');
 */

import { getLogger } from './utils/logger';
import type {
  ActionRequest,
  ActionResponse,
  RawProbeData,
  RawWaveformData,
  ProbeResult,
  WaveformResult,
  StreamHandle,
  DiffResult,
  Resolution,
  LoudnessAnalysis,
  SilenceAnalysis,
  EffectPresetInfo,
  EffectApplyResult,
  ShaderParamDef,
  AudioInputDevice,
  RecordStartResult,
  RecordingResult,
  MonitorData,
  CameraDevice,
  CameraCaptureOptions,
  MidiPort,
  MidiConnectResult,
  GamepadInfo,
  GamepadConnectResult,
} from './engine/types';
import { transformDiffResponse } from './engine/responseTransform';

export interface EngineClientConfig {
  /** Request timeout in milliseconds (default: 120_000 for long diff operations) */
  timeout?: number;
}

/** A timestamped segment from Whisper transcription. */
export interface TranscribeSegment {
  start: number;
  end: number;
  text: string;
}

/** Response from the `models:transcribe` action. */
export interface TranscribeResponse {
  text: string;
  segments: TranscribeSegment[];
  language: string | null;
  durationSecs: number | null;
}

const logger = getLogger('EngineClient');

export class EngineClient {
  readonly port: number;
  private readonly timeout: number;

  constructor(port: number, config?: EngineClientConfig) {
    this.port = port;
    this.timeout = config?.timeout ?? 120_000;
  }

  // =========================================================================
  // URL helpers
  // =========================================================================

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get wsBaseUrl(): string {
    return `ws://127.0.0.1:${this.port}/v1/streams`;
  }

  getStreamWsUrl(streamId: string): string {
    return `${this.wsBaseUrl}/${streamId}`;
  }

  // =========================================================================
  // Low-level dispatch
  // =========================================================================

  /**
   * Generic dispatch — POST /v1/dispatch
   * All convenience methods delegate here.
   */
  async dispatch(req: ActionRequest): Promise<ActionResponse> {
    const body = JSON.stringify({
      group: req.group,
      action: req.action,
      id: req.id ?? '',
      source: req.source ?? undefined,
      sessionId: req.sessionId ?? undefined,
      streamId: req.streamId ?? undefined,
      options: req.options ?? {},
      body: req.body ?? null,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/v1/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Engine HTTP ${res.status}: ${res.statusText}`);
      }

      return (await res.json()) as ActionResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  // =========================================================================
  // Convenience methods
  // =========================================================================

  /**
   * Probe media metadata.
   * Dispatches `videos:probe` or `audios:probe`.
   * Transforms the Rust nested response (videoStreams/audioStreams) into flat ProbeResult.
   */
  async probe(group: 'videos' | 'audios', source: string): Promise<ProbeResult> {
    const resp = await this.dispatch({
      group,
      action: 'probe',
      options: { source },
    });
    this.assertOk(resp, `${group}:probe`);

    const raw = resp.data as RawProbeData;
    const video = raw.videoStreams?.[0];
    const audio = raw.audioStreams?.[0];
    return {
      duration: raw.duration ?? 0,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      fps: video?.fps ?? 0,
      codec: video?.codec ?? '',
      format: raw.format ?? '',
      bitrate: video?.bitrate,
      hasAudio: (raw.audioStreams?.length ?? 0) > 0,
      audioCodec: audio?.codec,
      audioSampleRate: audio?.sampleRate,
      audioChannels: audio?.channels,
      audioBitrate: audio?.bitrate,
    };
  }

  /**
   * Generate waveform peaks for an audio file.
   * Dispatches `audios:waveform`.
   * Unwraps nested Rust response and downmixes multi-channel peaks to mono.
   */
  async waveform(source: string, opts?: { peaksPerSecond?: number }): Promise<WaveformResult> {
    const resp = await this.dispatch({
      group: 'audios',
      action: 'waveform',
      options: { source, ...opts },
    });
    this.assertOk(resp, 'audios:waveform');

    // Rust response: { resourceId, waveform: { sampleRate, channels, peaksPerSecond, duration, peaks: number[][] } }
    const data = resp.data as Record<string, unknown>;
    const wf = data['waveform'] as RawWaveformData | undefined;
    if (!wf) {
      throw new Error('audios:waveform returned no waveform data');
    }

    return {
      peaks: downmixPeaks(wf.peaks),
      sampleRate: wf.sampleRate,
      channels: wf.channels,
      duration: wf.duration,
      peaksPerSecond: wf.peaksPerSecond,
    };
  }

  /**
   * Diff two media files.
   * Dispatches `{group}:diff` and transforms the Rust tagged-enum response.
   * Returns typed DiffResult with flattened content (imageDiff/audioDiff/videoDiff/timelineDiff).
   * Pass a custom type parameter T for consumers using @neko/shared EngineDiffResult.
   */
  async diff<T = DiffResult>(
    group: string,
    sourceA: string,
    sourceB: string,
    options?: Record<string, unknown>,
  ): Promise<T | null> {
    const resp = await this.dispatch({
      group,
      action: 'diff',
      options: { sourceA, sourceB, ...options },
    });

    if (resp.status === 'error') {
      logger.error(`diff(${group}) failed`, resp.error?.message);
      return null;
    }

    const data = resp.data as Record<string, unknown> | undefined;
    if (!data) return null;

    return transformDiffResponse(data) as unknown as T;
  }

  /**
   * Extract a single frame from a video file.
   * Dispatches `videos:capture`.
   * Returns raw image data as ArrayBuffer, or null on failure.
   */
  async extractFrame(
    source: string,
    time: number,
    opts?: { quality?: number; format?: string },
  ): Promise<ArrayBuffer | null> {
    const resp = await this.dispatch({
      group: 'videos',
      action: 'capture',
      options: {
        source,
        time,
        quality: opts?.quality ?? 85,
        format: opts?.format ?? 'jpeg',
      },
    });

    if (resp.status === 'error') return null;

    // Engine returns base64-encoded image data
    const data = resp.data as { data?: string; base64?: string } | undefined;
    const b64 = data?.data ?? data?.base64;
    if (!b64 || typeof b64 !== 'string') return null;

    return base64ToArrayBuffer(b64);
  }

  // =========================================================================
  // Stream management
  // =========================================================================

  /**
   * Create a media stream and return its WebSocket URL + metadata.
   * Dispatches `{group}:stream`.
   * For `timelines:stream`, also returns audioStreamId/audioWsUrl.
   */
  async createStream(
    group: string,
    source: string,
    opts?: Record<string, unknown>,
  ): Promise<StreamHandle> {
    const resp = await this.dispatch({
      group,
      action: 'stream',
      options: { source, ...opts },
    });
    this.assertOk(resp, `${group}:stream`);

    const data = resp.data as Record<string, unknown> | undefined;
    const streamId =
      (data?.['videoStreamId'] as string | undefined) ??
      (data?.['streamId'] as string | undefined) ??
      (data?.['stream_id'] as string | undefined);
    if (!streamId) {
      throw new Error(`${group}:stream returned no streamId`);
    }

    const audioStreamId = data?.['audioStreamId'] as string | undefined;
    const resolution = data?.['resolution'] as Resolution | undefined;
    return {
      streamId,
      wsUrl: this.getStreamWsUrl(streamId),
      sessionId: (data?.['sessionId'] as string | undefined) ?? undefined,
      resolution,
      fps: (data?.['fps'] as number | undefined) ?? undefined,
      audioStreamId: audioStreamId ?? undefined,
      audioWsUrl: audioStreamId ? this.getStreamWsUrl(audioStreamId) : undefined,
    };
  }

  /**
   * Control an active stream (resume / pause / seek / stop / speed / quality / update / etc.).
   */
  async controlStream(
    group: string,
    streamId: string,
    action: string,
    opts?: Record<string, unknown>,
  ): Promise<ActionResponse> {
    const resp = await this.dispatch({
      group,
      action,
      options: { streamId, ...opts },
    });
    // stop/pause may return 'ok' or silently succeed
    if (resp.status === 'error') {
      logger.warn(`controlStream(${action}) warning`, resp.error?.message);
    }
    return resp;
  }

  // =========================================================================
  // Loudness analysis
  // =========================================================================

  /**
   * Analyze audio loudness per ITU-R BS.1770-4.
   * Dispatches `audios:analyze_loudness`.
   * Returns integrated LUFS, true peak, loudness range, and recommended gain.
   */
  async analyzeLoudness(source: string, targetLufs: number = -14): Promise<LoudnessAnalysis> {
    const resp = await this.dispatch({
      group: 'audios',
      action: 'analyze_loudness',
      options: { source, targetLufs },
    });
    this.assertOk(resp, 'audios:analyze_loudness');
    return resp.data as LoudnessAnalysis;
  }

  // =========================================================================
  // Silence detection
  // =========================================================================

  /**
   * Detect silence regions in an audio file.
   * Dispatches `audios:detect_silence`.
   * Returns regions where RMS is below the threshold for at least minDuration.
   */
  async detectSilence(
    source: string,
    thresholdDbfs: number = -40,
    minDuration: number = 0.5,
  ): Promise<SilenceAnalysis> {
    const resp = await this.dispatch({
      group: 'audios',
      action: 'detect_silence',
      options: { source, thresholdDbfs, minDuration },
    });
    this.assertOk(resp, 'audios:detect_silence');
    return resp.data as SilenceAnalysis;
  }

  // =========================================================================
  // Effects / Shader API
  // =========================================================================

  /**
   * List all available GPU shader presets (built-in + custom registered).
   * Dispatches `effects:list`.
   */
  async listEffects(): Promise<EffectPresetInfo[]> {
    const resp = await this.dispatch({
      group: 'effects',
      action: 'list',
      options: {},
    });
    this.assertOk(resp, 'effects:list');
    return (resp.data as EffectPresetInfo[] | undefined) ?? [];
  }

  /**
   * Get metadata for a specific shader preset.
   * Dispatches `effects:info`.
   */
  async getEffectInfo(shaderId: string): Promise<EffectPresetInfo> {
    const resp = await this.dispatch({
      group: 'effects',
      action: 'info',
      options: { shaderId },
    });
    this.assertOk(resp, 'effects:info');
    return resp.data as EffectPresetInfo;
  }

  /**
   * Apply a shader effect to a raw RGBA frame (base64-encoded).
   * Dispatches `effects:apply`.
   */
  async applyEffect(
    data: string,
    width: number,
    height: number,
    shaderId: string,
    params?: Record<string, unknown>,
  ): Promise<EffectApplyResult> {
    const resp = await this.dispatch({
      group: 'effects',
      action: 'apply',
      options: { data, width, height, shaderId, params: params ?? {} },
    });
    this.assertOk(resp, 'effects:apply');
    return resp.data as EffectApplyResult;
  }

  /**
   * Register a custom WGSL compute shader at runtime.
   * Dispatches `effects:register`.
   * The shader must have entry point `main` and use 16x16 workgroups.
   */
  async registerShader(id: string, code: string, params?: ShaderParamDef[]): Promise<void> {
    const resp = await this.dispatch({
      group: 'effects',
      action: 'register',
      options: { id, code, params: params ?? [] },
    });
    this.assertOk(resp, 'effects:register');
  }

  // =========================================================================
  // Scenes (3D) API
  // =========================================================================

  /**
   * Load a 3D model (glTF/glb/VRM) into the scene.
   * Dispatches `scenes:load`.
   * Returns the scene snapshot with all nodes and animations.
   */
  async loadModel(source: string): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'load',
      options: { source },
    });
    this.assertOk(resp, 'scenes:load');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Get the current scene graph snapshot.
   * Dispatches `scenes:snapshot`.
   */
  async getSceneSnapshot(): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'snapshot',
      options: {},
    });
    this.assertOk(resp, 'scenes:snapshot');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Update a node's transform in the scene.
   * Dispatches `scenes:transform`.
   */
  async updateSceneTransform(
    nodeId: string,
    position: [number, number, number],
    rotation: [number, number, number, number],
    scale: [number, number, number],
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'transform',
      options: { node_id: nodeId, position, rotation, scale },
    });
    this.assertOk(resp, 'scenes:transform');
  }

  /**
   * Get available animation clips.
   * Dispatches `scenes:animate`.
   */
  async getAnimationClips(): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'animate',
      options: {},
    });
    this.assertOk(resp, 'scenes:animate');
    return (resp.data as unknown[]) ?? [];
  }

  /**
   * Advance scene animation by a tick.
   * Dispatches `scenes:tick`.
   */
  async tickScene(clipName: string, time: number): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'tick',
      options: { clip_name: clipName, time },
    });
    this.assertOk(resp, 'scenes:tick');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Create a parametric shape in the 3D scene.
   * Dispatches `scenes:create_shape`.
   */
  async createShape(
    shapeType: string,
    params: Record<string, number>,
  ): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'create_shape',
      options: { type: shapeType, ...params },
    });
    this.assertOk(resp, 'scenes:create_shape');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Create extruded 3D text in the scene.
   * Dispatches `scenes:create_text`.
   */
  async createTextMesh(
    text: string,
    fontSize: number,
    extrusionDepth: number,
  ): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'create_text',
      options: { text, fontSize, extrusionDepth },
    });
    this.assertOk(resp, 'scenes:create_text');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Perform CSG boolean operation on two scene entities.
   * Dispatches `scenes:csg_boolean`.
   */
  async csgBoolean(
    entityA: string,
    entityB: string,
    operation: 'union' | 'difference' | 'intersection',
  ): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'csg_boolean',
      options: { entityA, entityB, operation },
    });
    this.assertOk(resp, 'scenes:csg_boolean');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Export the current scene to GLB binary format.
   * Returns base64-encoded GLB data.
   * Dispatches `scenes:export_gltf`.
   */
  async exportGlb(): Promise<{ data: string; byteLength: number }> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'export_gltf',
      options: {},
    });
    this.assertOk(resp, 'scenes:export_gltf');
    const result = resp.data as Record<string, unknown>;
    return {
      data: result['data'] as string,
      byteLength: result['byteLength'] as number,
    };
  }

  /**
   * Save the current scene as a .nkm project file.
   * Dispatches `scenes:save_project`.
   */
  async saveProject(path: string, editorState: unknown): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'save_project',
      options: { path, editorState },
    });
    this.assertOk(resp, 'scenes:save_project');
  }

  /**
   * Load a .nkm project file and restore the scene.
   * Dispatches `scenes:load_project`.
   */
  async loadProject(
    path: string,
  ): Promise<{ snapshot: Record<string, unknown>; editorState: unknown }> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'load_project',
      options: { path },
    });
    this.assertOk(resp, 'scenes:load_project');
    const result = resp.data as Record<string, unknown>;
    return {
      snapshot: result['snapshot'] as Record<string, unknown>,
      editorState: result['editorState'],
    };
  }

  // =========================================================================
  // 2D Puppets (Inochi2D / inox2d)
  // =========================================================================

  /**
   * Load a puppet from INP binary data.
   * Dispatches `puppets:load` with base64-encoded data in the body.
   */
  async loadPuppet(data: ArrayBuffer): Promise<Record<string, unknown>> {
    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64Data = btoa(binary);

    const resp = await this.dispatch({
      group: 'puppets',
      action: 'load',
      options: {},
      body: { data: base64Data },
    });
    this.assertOk(resp, 'puppets:load');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Get the current puppet snapshot.
   * Dispatches `puppets:snapshot`.
   */
  async getPuppetSnapshot(): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'snapshot',
      options: {},
    });
    this.assertOk(resp, 'puppets:snapshot');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Set a puppet parameter value.
   * Dispatches `puppets:param`.
   */
  async setPuppetParameter(name: string, value: number): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'param',
      options: { name, value },
    });
    this.assertOk(resp, 'puppets:param');
  }

  /**
   * Get all puppet parameter definitions.
   * Dispatches `puppets:params`.
   */
  async getPuppetParameters(): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'params',
      options: {},
    });
    this.assertOk(resp, 'puppets:params');
    return (resp.data as unknown[]) ?? [];
  }

  /**
   * Advance puppet physics simulation.
   * Dispatches `puppets:tick`.
   */
  async tickPuppet(deltaMs?: number): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'tick',
      options: { delta_ms: deltaMs },
    });
    this.assertOk(resp, 'puppets:tick');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /**
   * Get current deformed mesh data.
   * Dispatches `puppets:meshes`.
   */
  async getPuppetMeshes(): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'meshes',
      options: {},
    });
    this.assertOk(resp, 'puppets:meshes');
    return (resp.data as unknown[]) ?? [];
  }

  /**
   * Get all available animation clip descriptions.
   * Dispatches `puppets:anims`.
   */
  async getPuppetAnimations(): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'anims',
      options: {},
    });
    this.assertOk(resp, 'puppets:anims');
    return (resp.data as unknown[]) ?? [];
  }

  /**
   * Play a named animation clip.
   * Dispatches `puppets:anim_play`.
   */
  async playPuppetAnimation(name: string, loopAnim = false): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'anim_play',
      options: { name, loop_anim: loopAnim },
    });
    this.assertOk(resp, 'puppets:anim_play');
  }

  /**
   * Stop the current animation.
   * Dispatches `puppets:anim_stop`.
   */
  async stopPuppetAnimation(): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'anim_stop',
      options: {},
    });
    this.assertOk(resp, 'puppets:anim_stop');
  }

  /**
   * Seek the current animation to a time position.
   * Dispatches `puppets:anim_seek`.
   */
  async seekPuppetAnimation(timeMs: number): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'anim_seek',
      options: { time_ms: timeMs },
    });
    this.assertOk(resp, 'puppets:anim_seek');
  }

  /**
   * Open a WebSocket connection to the puppet delta stream.
   * The server pushes PuppetDelta at ~60fps while the connection is active.
   * Returns the raw WebSocket — caller is responsible for closing it.
   */
  openPuppetStream(): WebSocket {
    const url = `ws://127.0.0.1:${this.port}/v1/puppets/stream`;
    return new WebSocket(url);
  }

  // =========================================================================
  // Health
  // =========================================================================

  /**
   * Check if the Frame Server is reachable.
   */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // Audio Input / Recording
  // =========================================================================

  /** List available audio input devices */
  async listInputDevices(): Promise<AudioInputDevice[]> {
    const resp = await this.dispatch({
      group: 'audios',
      action: 'list_input_devices',
      options: {},
    });
    this.assertOk(resp, 'audios:list_input_devices');
    return (resp.data ?? []) as AudioInputDevice[];
  }

  /** Start recording from an input device */
  async recordStart(options: {
    outputPath: string;
    deviceId?: string;
    sampleRate?: number;
    channels?: number;
  }): Promise<RecordStartResult> {
    const resp = await this.dispatch({
      group: 'audios',
      action: 'record_start',
      options,
    });
    this.assertOk(resp, 'audios:record_start');
    return resp.data as RecordStartResult;
  }

  /** Stop an active recording */
  async recordStop(streamId: string): Promise<RecordingResult> {
    const resp = await this.dispatch({
      group: 'audios',
      action: 'record_stop',
      options: { streamId },
    });
    this.assertOk(resp, 'audios:record_stop');
    return resp.data as RecordingResult;
  }

  /** Get the monitor URL for real-time level data */
  getMonitorUrl(streamId: string): string {
    return `${this.baseUrl}/v1/monitor/${streamId}`;
  }

  /** Fetch current monitor data (RMS/Peak/Clipping) */
  async fetchMonitorData(streamId: string): Promise<MonitorData> {
    const res = await fetch(this.getMonitorUrl(streamId));
    if (!res.ok) throw new Error(`Monitor fetch failed: ${res.status}`);
    return (await res.json()) as MonitorData;
  }

  // =========================================================================
  // Camera
  // =========================================================================

  /** List available camera devices */
  async listCameraDevices(): Promise<CameraDevice[]> {
    const resp = await this.dispatch({
      group: 'cameras',
      action: 'list_devices',
      options: {},
    });
    this.assertOk(resp, 'cameras:list_devices');
    return (resp.data ?? []) as CameraDevice[];
  }

  /** Start camera capture */
  async startCameraCapture(opts?: CameraCaptureOptions): Promise<StreamHandle> {
    const resp = await this.dispatch({
      group: 'cameras',
      action: 'capture_start',
      options: (opts ?? {}) as Record<string, unknown>,
    });
    this.assertOk(resp, 'cameras:capture_start');
    const data = resp.data as Record<string, unknown>;
    const streamId = data.streamId as string;
    return {
      streamId,
      wsUrl: `ws://127.0.0.1:${this.port}/v1/streams/${streamId}`,
    };
  }

  /** Stop camera capture */
  async stopCameraCapture(streamId: string): Promise<void> {
    const resp = await this.dispatch({
      group: 'cameras',
      action: 'capture_stop',
      options: { streamId },
    });
    this.assertOk(resp, 'cameras:capture_stop');
  }

  // =========================================================================
  // MIDI
  // =========================================================================

  /** List available MIDI input ports */
  async listMidiPorts(): Promise<MidiPort[]> {
    const resp = await this.dispatch({
      group: 'midi',
      action: 'list_ports',
      options: {},
    });
    this.assertOk(resp, 'midi:list_ports');
    return (resp.data ?? []) as MidiPort[];
  }

  /** Connect to a MIDI port */
  async connectMidi(portId: string): Promise<MidiConnectResult> {
    const resp = await this.dispatch({
      group: 'midi',
      action: 'connect',
      options: { portId },
    });
    this.assertOk(resp, 'midi:connect');
    return resp.data as MidiConnectResult;
  }

  /** Disconnect from a MIDI port */
  async disconnectMidi(streamId: string): Promise<void> {
    const resp = await this.dispatch({
      group: 'midi',
      action: 'disconnect',
      options: { streamId },
    });
    this.assertOk(resp, 'midi:disconnect');
  }

  // =========================================================================
  // Gamepad
  // =========================================================================

  /** List connected gamepads */
  async listGamepads(): Promise<GamepadInfo[]> {
    const resp = await this.dispatch({
      group: 'gamepad',
      action: 'list',
      options: {},
    });
    this.assertOk(resp, 'gamepad:list');
    return (resp.data ?? []) as GamepadInfo[];
  }

  /** Connect to a gamepad for event streaming */
  async connectGamepad(gamepadId: string): Promise<GamepadConnectResult> {
    const resp = await this.dispatch({
      group: 'gamepad',
      action: 'connect',
      options: { gamepadId },
    });
    this.assertOk(resp, 'gamepad:connect');
    return resp.data as GamepadConnectResult;
  }

  /** Disconnect from a gamepad */
  async disconnectGamepad(streamId: string): Promise<void> {
    const resp = await this.dispatch({
      group: 'gamepad',
      action: 'disconnect',
      options: { streamId },
    });
    this.assertOk(resp, 'gamepad:disconnect');
  }

  // =========================================================================
  // Models (ONNX inference) API
  // =========================================================================

  /**
   * Register an ONNX model with the engine for inference.
   * Model files must already exist on disk (e.g., installed via neko-market).
   */
  async registerModel(
    name: string,
    modelPath: string,
    framework: string,
    task: string,
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'models',
      action: 'register',
      options: { name, path: modelPath, framework, task },
    });
    this.assertOk(resp, 'models:register');
  }

  /** Unregister a model (also unloads from memory if loaded). */
  async unregisterModel(name: string): Promise<void> {
    const resp = await this.dispatch({
      group: 'models',
      action: 'unregister',
      options: { name },
    });
    this.assertOk(resp, 'models:unregister');
  }

  /** List all registered models. */
  async listModels(): Promise<Record<string, unknown>[]> {
    const resp = await this.dispatch({
      group: 'models',
      action: 'list',
      options: {},
    });
    this.assertOk(resp, 'models:list');
    return (resp.data ?? []) as Record<string, unknown>[];
  }

  /**
   * Upscale an image using a registered ONNX model (e.g., Real-ESRGAN).
   * @param model - registered model name
   * @param input - input image file path
   * @param output - output image file path
   * @param scale - upscale factor (default: 4)
   */
  async upscale(model: string, input: string, output: string, scale = 4): Promise<void> {
    const resp = await this.dispatch({
      group: 'models',
      action: 'upscale',
      options: { model, input, output, scale },
    });
    this.assertOk(resp, 'models:upscale');
  }

  /**
   * Denoise an image using a registered ONNX model.
   * @param model - registered model name
   * @param input - input image file path
   * @param output - output image file path
   * @param strength - denoise strength 0-1 (default: 0.5)
   */
  async denoiseImage(model: string, input: string, output: string, strength = 0.5): Promise<void> {
    const resp = await this.dispatch({
      group: 'models',
      action: 'denoise',
      options: { model, input, output, strength },
    });
    this.assertOk(resp, 'models:denoise');
  }

  /**
   * Compute CLIP similarity score between an image and text.
   * @returns similarity score in [-1, 1] range
   */
  async clipScore(model: string, image: string, text: string): Promise<number> {
    const resp = await this.dispatch({
      group: 'models',
      action: 'clip',
      options: { model, image, text },
    });
    this.assertOk(resp, 'models:clip');
    return (resp.data as { score: number }).score;
  }

  /**
   * Transcribe audio to text with timestamps using a registered Whisper ONNX model.
   */
  async transcribe(model: string, audio: string): Promise<TranscribeResponse> {
    const resp = await this.dispatch({
      group: 'models',
      action: 'transcribe',
      options: { model, audio },
    });
    this.assertOk(resp, 'models:transcribe');
    const data = resp.data as TranscribeResponse;
    return {
      text: data.text,
      segments: data.segments ?? [],
      language: data.language ?? null,
      durationSecs: data.durationSecs ?? null,
    };
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private assertOk(resp: ActionResponse, label: string): void {
    if (resp.status === 'error') {
      const msg = resp.error?.message ?? `${label} failed`;
      throw new Error(msg);
    }
  }
}

// =============================================================================
// Utility
// =============================================================================

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Browser path
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  // Node.js path
  const buf = Buffer.from(base64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Downmix multi-channel peaks to mono by taking max absolute value across channels.
 */
function downmixPeaks(multiChannel: number[][]): number[] {
  if (multiChannel.length === 0) return [];
  if (multiChannel.length === 1) return multiChannel[0] ?? [];

  const len = multiChannel[0]?.length ?? 0;
  const mono = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    let max = 0;
    for (const ch of multiChannel) {
      const v = Math.abs(ch[i] ?? 0);
      if (v > max) max = v;
    }
    mono[i] = max;
  }
  return mono;
}
