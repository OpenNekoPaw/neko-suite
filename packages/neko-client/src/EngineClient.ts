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

import { PathResolver } from '@neko/shared';
import type {
  AudioStreamDescriptor,
  PreviewManifest,
  PreviewVariant,
  PreviewVariantRequest,
  RegisterPreviewAssetRequest,
  RenderStreamDescriptor,
  SceneSnapshot,
  ViewportDescriptor,
} from '@neko/shared';
import { SceneControlSocket, type SceneControlSocketConfig } from './SceneControlSocket';
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
  DocumentProbeResult,
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

export interface PerceptionTranscribeRequest {
  readonly model: string;
  readonly audio: string;
}

export interface PerceptionSimilarityRequest {
  readonly model: string;
  readonly image: string;
  readonly text: string;
}

export interface PerceptionClassifyRequest {
  readonly model: string;
  readonly image: string;
  readonly labels: readonly string[];
}

export interface PerceptionClassifyLabelScore {
  readonly label: string;
  readonly score: number;
}

export interface PerceptionDetectShotsRequest {
  readonly video: string;
}

export interface PerceptionDetectedShot {
  readonly index: number;
  readonly start: number;
  readonly end: number | null;
  readonly confidence: number | null;
}

export interface EnginePerceptionFacade {
  transcribe(request: PerceptionTranscribeRequest): Promise<TranscribeResponse>;
  similarity(request: PerceptionSimilarityRequest): Promise<number>;
  classify(request: PerceptionClassifyRequest): Promise<readonly PerceptionClassifyLabelScore[]>;
  detectShots(request: PerceptionDetectShotsRequest): Promise<readonly PerceptionDetectedShot[]>;
}

export interface SceneCapturePreview {
  width: number;
  height: number;
  format: 'jpeg';
  mimeType: 'image/jpeg';
  encoding: 'base64';
  data: string;
  dataUrl: string;
  status: 'captured';
}

export interface SceneCaptureOptions {
  width?: number;
  height?: number;
  quality?: number;
  clipName?: string;
  time?: number;
  backgroundColor?: [number, number, number, number];
}

export interface SceneRenderStreamHandle {
  descriptor: RenderStreamDescriptor;
  wsUrl: string;
  audioWsUrl?: string;
}

const logger = getLogger('EngineClient');

type SceneNodeSnapshot = SceneSnapshot['nodes'][number];
type SceneAnimationClipInfo = SceneSnapshot['animations'][number];
type SceneCameraState = NonNullable<SceneSnapshot['activeCamera']>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toVec3(value: unknown, fallback: { x: number; y: number; z: number }) {
  if (Array.isArray(value)) {
    return {
      x: getNumber(value[0], fallback.x),
      y: getNumber(value[1], fallback.y),
      z: getNumber(value[2], fallback.z),
    };
  }
  if (isRecord(value)) {
    return {
      x: getNumber(value.x, fallback.x),
      y: getNumber(value.y, fallback.y),
      z: getNumber(value.z, fallback.z),
    };
  }
  return fallback;
}

function toQuat(value: unknown, fallback: { x: number; y: number; z: number; w: number }) {
  if (Array.isArray(value)) {
    return {
      x: getNumber(value[0], fallback.x),
      y: getNumber(value[1], fallback.y),
      z: getNumber(value[2], fallback.z),
      w: getNumber(value[3], fallback.w),
    };
  }
  if (isRecord(value)) {
    return {
      x: getNumber(value.x, fallback.x),
      y: getNumber(value.y, fallback.y),
      z: getNumber(value.z, fallback.z),
      w: getNumber(value.w, fallback.w),
    };
  }
  return fallback;
}

function normalizeSceneNodeSnapshot(value: unknown): SceneNodeSnapshot | null {
  if (!isRecord(value)) return null;

  const transform = isRecord(value.transform) ? value.transform : value;
  const nodeId = getString(value.nodeId, getString(value.id));
  if (!nodeId) return null;

  const kind = getString(
    value.kind,
    getBoolean(value.hasMesh, false)
      ? 'mesh'
      : getBoolean(value.hasLight, false)
        ? 'light'
        : getBoolean(value.hasCamera, false)
          ? 'camera'
          : 'node',
  );

  const parentValue = value.parentId ?? value.parent_id;
  const parentId =
    typeof parentValue === 'string' && parentValue.length > 0 ? parentValue : undefined;

  return {
    nodeId,
    parentId,
    name: getString(value.name, nodeId),
    transform: {
      position: toVec3(transform.position, { x: 0, y: 0, z: 0 }),
      rotation: toQuat(transform.rotation, { x: 0, y: 0, z: 0, w: 1 }),
      scale: toVec3(transform.scale, { x: 1, y: 1, z: 1 }),
    },
    children: getStringArray(value.children),
    visible: getBoolean(value.visible, true),
    layerMask: typeof value.layerMask === 'number' ? value.layerMask : undefined,
    mesh: isRecord(value.mesh)
      ? { id: getString(value.mesh.id), uri: getString(value.mesh.uri), kind: 'mesh' }
      : undefined,
    material: isRecord(value.material)
      ? { id: getString(value.material.id), uri: getString(value.material.uri), kind: 'material' }
      : undefined,
    kind,
  };
}

function normalizeAnimationClip(value: unknown): SceneAnimationClipInfo | null {
  if (!isRecord(value)) return null;
  const name = getString(value.name);
  if (!name) return null;
  return {
    name,
    duration: getNumber(value.duration),
  };
}

function normalizeCameraState(value: unknown): SceneCameraState | undefined {
  if (!isRecord(value)) return undefined;
  return {
    cameraId: getString(value.cameraId, getString(value.id, 'camera')),
    position: toVec3(value.position, { x: 0, y: 0, z: 0 }),
    target: toVec3(value.target, { x: 0, y: 0, z: -1 }),
    up: toVec3(value.up, { x: 0, y: 1, z: 0 }),
    fov: getNumber(value.fov, 45),
    near: typeof value.near === 'number' ? value.near : undefined,
    far: typeof value.far === 'number' ? value.far : undefined,
  };
}

function normalizeSceneSnapshot(value: unknown): SceneSnapshot {
  if (!isRecord(value)) {
    return { sceneId: 'default', revision: 0, nodes: [], animations: [] };
  }

  const nodes = Array.isArray(value.nodes)
    ? value.nodes
        .map(normalizeSceneNodeSnapshot)
        .filter((node): node is SceneNodeSnapshot => node !== null)
    : [];
  const animations = Array.isArray(value.animations)
    ? value.animations
        .map(normalizeAnimationClip)
        .filter((clip): clip is SceneAnimationClipInfo => clip !== null)
    : [];

  return {
    sceneId: getString(value.sceneId, getString(value.scene_id, 'default')),
    revision: getNumber(value.revision),
    nodes,
    animations,
    activeCamera: normalizeCameraState(value.activeCamera ?? value.active_camera),
  };
}

function normalizeSceneCapturePreview(value: unknown): SceneCapturePreview {
  if (!isRecord(value)) {
    throw new Error('scenes:capture returned invalid preview data');
  }

  const data = getString(value.data);
  const dataUrl = getString(value.dataUrl, data ? `data:image/jpeg;base64,${data}` : '');
  if (!data || !dataUrl) {
    throw new Error('scenes:capture returned no displayable image data');
  }

  return {
    width: getNumber(value.width),
    height: getNumber(value.height),
    format: 'jpeg',
    mimeType: 'image/jpeg',
    encoding: 'base64',
    data,
    dataUrl,
    status: 'captured',
  };
}

function normalizeAudioStreamDescriptor(value: unknown): AudioStreamDescriptor | undefined {
  if (!isRecord(value)) return undefined;
  const streamId = getString(value.streamId);
  if (!streamId) return undefined;

  return {
    streamId,
    codec: 'pcm-f32le',
    frameHeader: 'neko-pcm-v1',
    sampleRate: getNumber(value.sampleRate, 48000),
    channels: getNumber(value.channels, 2),
    isMasterClock: typeof value.isMasterClock === 'boolean' ? value.isMasterClock : undefined,
  };
}

function normalizeSceneRenderStreamDescriptor(value: unknown): RenderStreamDescriptor {
  if (!isRecord(value)) {
    throw new Error('scenes:stream returned invalid stream descriptor');
  }

  const streamId = getString(value.streamId);
  const viewportId = getString(value.viewportId);
  if (!streamId || !viewportId) {
    throw new Error('scenes:stream returned descriptor without streamId or viewportId');
  }

  return {
    streamId,
    viewportId,
    container: value.container === 'h264-avcc' ? 'h264-avcc' : 'h264-annexb',
    codecString: getString(value.codecString, 'avc1.42001f'),
    profile: typeof value.profile === 'string' ? value.profile : undefined,
    level: typeof value.level === 'string' ? value.level : undefined,
    frameHeader: 'neko-h264-v1',
    initData: isRecord(value.initData)
      ? {
          format: 'avcc-record',
          data: getString(value.initData.data),
        }
      : undefined,
    width: getNumber(value.width, 1280),
    height: getNumber(value.height, 720),
    fps: getNumber(value.fps, 30),
    colorSpace:
      value.colorSpace === 'rec709' || value.colorSpace === 'p3' ? value.colorSpace : 'srgb',
    bitDepth: getNumber(value.bitDepth, 8),
    toneMapping:
      value.toneMapping === 'reinhard' || value.toneMapping === 'none' ? value.toneMapping : 'aces',
    gopSize: typeof value.gopSize === 'number' ? value.gopSize : undefined,
    initialRevision: getNumber(value.initialRevision),
    audioStream: normalizeAudioStreamDescriptor(value.audioStream),
    qualityTier: typeof value.qualityTier === 'string' ? value.qualityTier : undefined,
    helperPassesEnabled:
      typeof value.helperPassesEnabled === 'boolean' ? value.helperPassesEnabled : undefined,
    postProcessEnabled:
      typeof value.postProcessEnabled === 'boolean' ? value.postProcessEnabled : undefined,
  };
}

function viewportDescriptorToOptions(viewport: ViewportDescriptor): Record<string, unknown> {
  return {
    viewportId: viewport.viewportId,
    sceneId: viewport.sceneId,
    cameraRef: viewport.cameraRef,
    renderMode: viewport.renderMode,
    debugView: viewport.debugView,
    resolution: viewport.resolution,
    fps: viewport.fps,
    colorSpace: viewport.colorSpace,
    toneMapping: viewport.toneMapping,
    postProcess: viewport.postProcess,
    layerMask: viewport.layerMask,
    workMode: viewport.workMode,
  };
}

export class EngineClient {
  readonly port: number;
  readonly perception: EnginePerceptionFacade;
  private readonly timeout: number;
  private pathResolver: PathResolver | null = null;

  constructor(port: number, config?: EngineClientConfig) {
    this.port = port;
    this.timeout = config?.timeout ?? 120_000;
    this.perception = createEnginePerceptionFacade(this);
  }

  /**
   * Set a PathResolver for automatic path variable expansion.
   *
   * When set, all `source` parameters passed to engine methods will be
   * resolved through the PathResolver before being sent to neko-engine.
   * This handles `${VAR}/path` → `/absolute/path` expansion.
   */
  setPathResolver(resolver: PathResolver): void {
    this.pathResolver = resolver;
  }

  /** Resolve a source path through the PathResolver if available. */
  private resolveSource(source: string): string {
    if (!this.pathResolver) return source;
    const result = this.pathResolver.resolveSource(source, '');
    return result.type === 'local' ? result.path : source;
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

  getAudioWsUrl(streamId: string): string {
    return `ws://127.0.0.1:${this.port}/v1/audio/${streamId}`;
  }

  getSceneControlWsUrl(): string {
    return `ws://127.0.0.1:${this.port}/v1/scenes/control`;
  }

  openSceneControlSocket(
    config?: Omit<SceneControlSocketConfig, 'url'> & { url?: string },
  ): SceneControlSocket {
    const socket = new SceneControlSocket({
      ...config,
      url: config?.url ?? this.getSceneControlWsUrl(),
    });
    socket.connect();
    return socket;
  }

  // =========================================================================
  // Low-level dispatch
  // =========================================================================

  /**
   * Generic dispatch — POST /v1/dispatch
   * All convenience methods delegate here.
   */
  async dispatch(req: ActionRequest): Promise<ActionResponse> {
    // Resolve path variables in source fields before sending to engine
    const resolvedSource = req.source ? this.resolveSource(req.source) : undefined;
    let options = req.options ?? {};
    if (options && typeof options === 'object' && 'source' in options) {
      const optSource = (options as Record<string, unknown>).source;
      if (typeof optSource === 'string') {
        options = { ...options, source: this.resolveSource(optSource) };
      }
    }
    // Also resolve sourceA/sourceB for diff operations
    if (options && typeof options === 'object') {
      const opts = options as Record<string, unknown>;
      if (typeof opts.sourceA === 'string') {
        options = { ...options, sourceA: this.resolveSource(opts.sourceA as string) };
      }
      if (typeof opts.sourceB === 'string') {
        options = { ...options, sourceB: this.resolveSource(opts.sourceB as string) };
      }
    }

    const body = JSON.stringify({
      group: req.group,
      action: req.action,
      id: req.id ?? '',
      source: resolvedSource,
      sessionId: req.sessionId ?? undefined,
      streamId: req.streamId ?? undefined,
      options,
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
   * Extract an encoded audio segment from an audio/video source.
   * Dispatches `audios:segment` and returns raw encoded bytes.
   */
  async extractAudioSegment(
    source: string,
    start: number,
    duration: number,
    opts?: { format?: string; sampleRate?: number; channels?: number },
  ): Promise<ArrayBuffer | null> {
    const resp = await this.dispatch({
      group: 'audios',
      action: 'segment',
      options: {
        source,
        start,
        duration,
        format: opts?.format ?? 'wav',
        ...(opts?.sampleRate != null && { sampleRate: opts.sampleRate }),
        ...(opts?.channels != null && { channels: opts.channels }),
      },
    });

    if (resp.status === 'error') return null;

    const data = resp.data as { data?: string; base64?: string; dataBase64?: string } | undefined;
    const b64 = data?.data ?? data?.base64 ?? data?.dataBase64;
    if (!b64 || typeof b64 !== 'string') return null;

    return base64ToArrayBuffer(b64);
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
    opts?: { quality?: number; format?: string; width?: number; height?: number },
  ): Promise<ArrayBuffer | null> {
    const resp = await this.dispatch({
      group: 'videos',
      action: 'capture',
      options: {
        source,
        time,
        quality: opts?.quality ?? 85,
        format: opts?.format ?? 'jpeg',
        ...(opts?.width != null && { width: opts.width }),
        ...(opts?.height != null && { height: opts.height }),
      },
    });

    if (resp.status === 'error') return null;

    // Engine returns base64-encoded image data
    const data = resp.data as { data?: string; base64?: string } | undefined;
    const b64 = data?.data ?? data?.base64;
    if (!b64 || typeof b64 !== 'string') return null;

    return base64ToArrayBuffer(b64);
  }

  /**
   * Capture an image file into encoded image bytes.
   * Dispatches `images:capture`.
   * Returns raw image data as ArrayBuffer, or null on failure.
   */
  async captureImage(
    source: string,
    opts?: { quality?: number; format?: string; width?: number; height?: number },
  ): Promise<ArrayBuffer | null> {
    const resp = await this.dispatch({
      group: 'images',
      action: 'capture',
      options: {
        source,
        quality: opts?.quality ?? 85,
        format: opts?.format ?? 'jpeg',
        ...(opts?.width != null && { width: opts.width }),
        ...(opts?.height != null && { height: opts.height }),
      },
    });

    if (resp.status === 'error') return null;

    const data = resp.data as { data?: string; base64?: string } | undefined;
    const b64 = data?.data ?? data?.base64;
    if (!b64 || typeof b64 !== 'string') return null;

    return base64ToArrayBuffer(b64);
  }

  /**
   * Get keyframe timestamps from a video file.
   * Dispatches `videos:keyframes`.
   * Returns sorted array of keyframe timestamps in seconds.
   */
  async getKeyframes(source: string): Promise<number[]> {
    const resp = await this.dispatch({
      group: 'videos',
      action: 'keyframes',
      options: { source },
    });

    if (resp.status === 'error') return [];

    const data = resp.data as { keyframes?: Array<{ time: number }> } | undefined;
    return (data?.keyframes ?? []).map((k) => k.time).sort((a, b) => a - b);
  }

  /**
   * Derive shot boundary candidates from engine keyframes.
   * This is evidence for Agent review, not an authoritative edit decision.
   */
  async detectShots(source: string): Promise<readonly PerceptionDetectedShot[]> {
    const keyframes = await this.getKeyframes(source);
    return keyframes.map((start, index) => ({
      index,
      start,
      end: keyframes[index + 1] ?? null,
      confidence: null,
    }));
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
  async loadModel(source: string): Promise<SceneSnapshot> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'load',
      options: { source },
    });
    this.assertOk(resp, 'scenes:load');
    return normalizeSceneSnapshot(resp.data);
  }

  /**
   * Get the current scene graph snapshot.
   * Dispatches `scenes:snapshot`.
   */
  async getSceneSnapshot(): Promise<SceneSnapshot> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'snapshot',
      options: {},
    });
    this.assertOk(resp, 'scenes:snapshot');
    return normalizeSceneSnapshot(resp.data);
  }

  /**
   * Capture a displayable Engine-rendered scene preview.
   * Dispatches `scenes:capture` and returns a JPEG data URL for Route C.
   */
  async captureScenePreview(options?: SceneCaptureOptions): Promise<SceneCapturePreview> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'capture',
      options: {
        width: options?.width,
        height: options?.height,
        quality: options?.quality,
        clipName: options?.clipName,
        time: options?.time,
        backgroundColor: options?.backgroundColor,
      },
    });
    this.assertOk(resp, 'scenes:capture');
    return normalizeSceneCapturePreview(resp.data);
  }

  /**
   * Start an Engine-rendered 3D viewport stream.
   * Dispatches `scenes:stream` with a shared ViewportDescriptor.
   */
  async startSceneRenderStream(viewport: ViewportDescriptor): Promise<SceneRenderStreamHandle> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'stream',
      options: viewportDescriptorToOptions(viewport),
    });
    this.assertOk(resp, 'scenes:stream');
    const descriptor = normalizeSceneRenderStreamDescriptor(resp.data);
    return {
      descriptor,
      wsUrl: this.getStreamWsUrl(descriptor.streamId),
      audioWsUrl: descriptor.audioStream
        ? this.getAudioWsUrl(descriptor.audioStream.streamId)
        : undefined,
    };
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

  async updateEditorCamera(
    position: [number, number, number],
    target: [number, number, number],
    fovY?: number,
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'update_camera',
      options: { position, target, fovY },
    });
    this.assertOk(resp, 'scenes:update_camera');
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
  async loadProject(path: string): Promise<{ snapshot: SceneSnapshot; editorState: unknown }> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'load_project',
      options: { path },
    });
    this.assertOk(resp, 'scenes:load_project');
    const result = resp.data as Record<string, unknown>;
    return {
      snapshot: normalizeSceneSnapshot(result['snapshot']),
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

  // ── Puppet Keyframe CRUD ──

  /** Get keyframe tracks for a puppet animation clip */
  async getPuppetKeyframeTracks(clipName: string): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'keyframe_tracks',
      options: { clip_name: clipName },
    });
    this.assertOk(resp, 'puppets:keyframe_tracks');
    return (resp.data ?? []) as unknown[];
  }

  /** Add a keyframe to a puppet parameter curve */
  async addPuppetKeyframe(
    clipName: string,
    paramName: string,
    timeMs: number,
    value: number,
  ): Promise<{ id: string }> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'keyframe_add',
      options: { clip_name: clipName, param_name: paramName, time_ms: timeMs, value },
    });
    this.assertOk(resp, 'puppets:keyframe_add');
    return resp.data as { id: string };
  }

  /** Remove a keyframe from a puppet parameter curve */
  async removePuppetKeyframe(
    clipName: string,
    paramName: string,
    keyframeId: string,
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'keyframe_remove',
      options: { clip_name: clipName, param_name: paramName, keyframe_id: keyframeId },
    });
    this.assertOk(resp, 'puppets:keyframe_remove');
  }

  /** Update a puppet keyframe's time and/or value */
  async updatePuppetKeyframe(
    clipName: string,
    paramName: string,
    keyframeId: string,
    updates: { timeMs?: number; value?: number; easing?: string },
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'keyframe_update',
      options: {
        clip_name: clipName,
        param_name: paramName,
        keyframe_id: keyframeId,
        ...updates,
      },
    });
    this.assertOk(resp, 'puppets:keyframe_update');
  }

  /** Create a new empty puppet animation clip */
  async createPuppetClip(name: string, durationMs: number): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'clip_create',
      options: { name, duration_ms: durationMs },
    });
    this.assertOk(resp, 'puppets:clip_create');
  }

  // ── Puppet Animation Blending ──

  /** Crossfade to a new puppet animation clip */
  async crossfadePuppetAnimation(
    clipName: string,
    fadeDurationMs: number,
    loop = false,
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'anim_crossfade',
      options: { clip_name: clipName, fade_duration_ms: fadeDurationMs, loop_anim: loop },
    });
    this.assertOk(resp, 'puppets:anim_crossfade');
  }

  /** Set blend weight for a puppet animation layer */
  async setPuppetBlendWeight(clipName: string, weight: number): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'blend_weight',
      options: { clip_name: clipName, weight },
    });
    this.assertOk(resp, 'puppets:blend_weight');
  }

  /** Get current puppet blend state */
  async getPuppetBlendState(): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'blend_state',
      options: {},
    });
    this.assertOk(resp, 'puppets:blend_state');
    return (resp.data ?? []) as unknown[];
  }

  // ── Scene Keyframe CRUD ──

  /** Get keyframe tracks for a scene animation clip */
  async getSceneKeyframeTracks(clipName: string): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'keyframe_tracks',
      options: { clip_name: clipName },
    });
    this.assertOk(resp, 'scenes:keyframe_tracks');
    return (resp.data ?? []) as unknown[];
  }

  /** Add a keyframe to a scene animation channel */
  async addSceneKeyframe(
    clipName: string,
    nodeId: string,
    property: string,
    timestamp: number,
    values: number[],
  ): Promise<{ id: string }> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'keyframe_add',
      options: { clip_name: clipName, node_id: nodeId, property, timestamp, values },
    });
    this.assertOk(resp, 'scenes:keyframe_add');
    return resp.data as { id: string };
  }

  /** Remove a keyframe from a scene animation channel */
  async removeSceneKeyframe(clipName: string, keyframeId: string): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'keyframe_remove',
      options: { clip_name: clipName, keyframe_id: keyframeId },
    });
    this.assertOk(resp, 'scenes:keyframe_remove');
  }

  /** Update a scene keyframe's timestamp and/or values */
  async updateSceneKeyframe(
    clipName: string,
    keyframeId: string,
    updates: { timestamp?: number; values?: number[]; easing?: string },
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'keyframe_update',
      options: { clip_name: clipName, keyframe_id: keyframeId, ...updates },
    });
    this.assertOk(resp, 'scenes:keyframe_update');
  }

  /** Create a new empty scene animation clip */
  async createSceneClip(name: string, duration: number): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'clip_create',
      options: { name, duration },
    });
    this.assertOk(resp, 'scenes:clip_create');
  }

  // ── Scene Animation Blending ──

  /** Crossfade to a new scene animation clip */
  async crossfadeSceneAnimation(
    clipName: string,
    fadeDuration: number,
    loop = false,
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'anim_crossfade',
      options: { clip_name: clipName, fade_duration: fadeDuration, loop_anim: loop },
    });
    this.assertOk(resp, 'scenes:anim_crossfade');
  }

  /** Set blend weight for a scene animation layer */
  async setSceneBlendWeight(clipName: string, weight: number): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'blend_weight',
      options: { clip_name: clipName, weight },
    });
    this.assertOk(resp, 'scenes:blend_weight');
  }

  /** Get current scene blend state */
  async getSceneBlendState(): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'blend_state',
      options: {},
    });
    this.assertOk(resp, 'scenes:blend_state');
    return (resp.data ?? []) as unknown[];
  }

  // ── IK Editing ──

  /** Create an IK chain between two joints */
  async createIkChain(
    rootJoint: string,
    endEffector: string,
    solver = 'fabrik',
    iterations = 10,
    tolerance = 0.001,
  ): Promise<{ id: string }> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'ik_create',
      options: {
        root_joint: rootJoint,
        end_effector: endEffector,
        solver,
        iterations,
        tolerance,
      },
    });
    this.assertOk(resp, 'scenes:ik_create');
    return resp.data as { id: string };
  }

  /** Remove an IK chain by ID */
  async removeIkChain(chainId: string): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'ik_remove',
      options: { chain_id: chainId },
    });
    this.assertOk(resp, 'scenes:ik_remove');
  }

  /** Set target position/rotation/pole for an IK chain */
  async setIkTarget(
    chainId: string,
    position: [number, number, number],
    rotation?: [number, number, number, number],
    pole?: [number, number, number],
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'ik_target',
      options: { chain_id: chainId, position, rotation, pole },
    });
    this.assertOk(resp, 'scenes:ik_target');
  }

  /** Enable or disable an IK chain */
  async setIkEnabled(chainId: string, enabled: boolean): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'ik_enable',
      options: { chain_id: chainId, enabled },
    });
    this.assertOk(resp, 'scenes:ik_enable');
  }

  /** Get all IK chains */
  async getIkChains(): Promise<unknown[]> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'ik_list',
      options: {},
    });
    this.assertOk(resp, 'scenes:ik_list');
    return (resp.data ?? []) as unknown[];
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
  // Documents API (PDF / EPUB / CBZ / DOCX)
  // =========================================================================

  /**
   * Probe a document file for metadata.
   *
   * Returns format, file size, MIME type, and for ZIP-based formats (EPUB/CBZ/DOCX)
   * the entry count and optional title/author from EPUB OPF.
   */
  async probeDocument(source: string): Promise<DocumentProbeResult> {
    const resp = await this.dispatch({
      group: 'documents',
      action: 'probe',
      options: { source },
    });
    this.assertOk(resp, 'documents:probe');
    return resp.data as DocumentProbeResult;
  }

  /**
   * Register a document file with the engine preview server.
   * Returns an opaque token used for subsequent `readDocumentRange` / `readDocumentEntry` calls.
   */
  async registerDocument(source: string): Promise<string> {
    const resolved = this.resolveSource(source);
    const res = await fetch(`${this.baseUrl}/v1/preview/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: resolved }),
    });
    if (!res.ok) {
      throw new Error(`documents:register failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { token: string };
    return body.token;
  }

  /**
   * Register any preview asset through the engine-first manifest path.
   *
   * Webviews should consume returned manifest URLs/tokens/streams rather than
   * receiving raw local file paths for Neko-owned preview media.
   */
  async registerPreviewAsset(request: RegisterPreviewAssetRequest): Promise<PreviewManifest> {
    const resolved = this.resolveSource(request.source);
    const res = await fetch(`${this.baseUrl}/v1/preview/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, source: resolved }),
    });
    if (!res.ok) {
      throw new Error(`preview:registerAsset failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as PreviewManifest;
  }

  /** Request a manifest-linked preview variant such as thumbnail or FOV crop. */
  async requestPreviewVariant(
    assetId: string,
    request: PreviewVariantRequest,
  ): Promise<PreviewVariant> {
    const res = await fetch(`${this.baseUrl}/v1/preview/assets/${assetId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new Error(`preview:requestVariant failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as PreviewVariant;
  }

  /** Unregister a preview asset and release manifest tokens/variants best-effort. */
  async unregisterPreviewAsset(assetIdOrToken: string): Promise<void> {
    await fetch(`${this.baseUrl}/v1/preview/assets/${assetIdOrToken}`, {
      method: 'DELETE',
    }).catch(() => {
      // Best-effort; engine may have already stopped.
    });
  }

  /** Build the engine token URL for callers that receive token-only manifests. */
  getPreviewTokenUrl(token: string): string {
    return `${this.baseUrl}/v1/preview/file/${token}`;
  }

  /** Unregister a previously registered document token. */
  async unregisterDocument(token: string): Promise<void> {
    await fetch(`${this.baseUrl}/v1/preview/unregister/${token}`, {
      method: 'DELETE',
    }).catch(() => {
      // Best-effort; engine may have already stopped.
    });
  }

  /**
   * Read a byte range from a registered document.
   *
   * Uses HTTP Range requests under the hood (Extension Host → neko-engine).
   * Returns raw binary data as `ArrayBuffer`.
   */
  async readDocumentRange(token: string, start: number, end: number): Promise<ArrayBuffer> {
    const res = await fetch(`${this.baseUrl}/v1/preview/file/${token}`, {
      headers: { Range: `bytes=${start}-${end}` },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`documents:readRange failed: ${res.status}`);
    }
    return res.arrayBuffer();
  }

  /**
   * Read a single entry from a ZIP-based document (EPUB, CBZ, DOCX).
   *
   * The engine extracts the entry on demand from the ZIP archive.
   * Returns raw binary data as `ArrayBuffer`.
   */
  async readDocumentEntry(token: string, entryPath: string): Promise<ArrayBuffer> {
    const res = await fetch(`${this.baseUrl}/v1/preview/epub/${token}/${entryPath}`);
    if (!res.ok) {
      throw new Error(`documents:readEntry(${entryPath}) failed: ${res.status}`);
    }
    return res.arrayBuffer();
  }

  // =========================================================================

  private assertOk(resp: ActionResponse, label: string): void {
    if (resp.status === 'error') {
      const msg = resp.error?.message ?? `${label} failed`;
      throw new Error(msg);
    }
  }
}

function createEnginePerceptionFacade(client: EngineClient): EnginePerceptionFacade {
  return {
    transcribe: (request) => client.transcribe(request.model, request.audio),
    similarity: (request) => client.clipScore(request.model, request.image, request.text),
    classify: async (request) => {
      const scores = await Promise.all(
        request.labels.map(async (label) => ({
          label,
          score: await client.clipScore(request.model, request.image, label),
        })),
      );
      return scores.sort((left, right) => right.score - left.score);
    },
    detectShots: (request) => client.detectShots(request.video),
  };
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
