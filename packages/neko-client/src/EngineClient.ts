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

import { PathResolver, isLiveCompositorScene, isPuppetCommandAck } from '@neko/shared';
import type {
  AudioStreamDescriptor,
  EnvironmentPatch,
  LightPatch,
  NodeRemoveCommand,
  NkpProjectData,
  PreviewManifest,
  PreviewVariant,
  PreviewVariantRequest,
  RegisterPreviewAssetRequest,
  UpdatePreviewAssetMetadataRequest,
  RenderStreamDescriptor,
  SceneCommand,
  SceneCommandEnvelope,
  SceneSnapshot,
  SelectionQuery,
  SelectionQueryResult,
  ViewportCommand,
  ViewportEvent,
  ViewportDescriptor,
  ViewportLookDevSettings,
  ViewportMaterialOverride,
  LiveCompositorScene,
  PuppetCommand,
  PuppetCommandAck,
  PuppetCommandEnvelope,
} from '@neko/shared';
import { SceneControlSocket, type SceneControlSocketConfig } from './SceneControlSocket';
import { getLogger } from './utils/logger';
import { normalizeSelectionQueryResult } from './utils/sceneWireNormalizers';
import { isRecord } from './utils/wireReaders';
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
  EffectCapability,
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
  ModelPreprocessRequest,
  ModelPreprocessResult,
  DocumentProbeResult,
} from './engine/types';
import { transformDiffResponse } from './engine/responseTransform';

export interface EngineClientConfig {
  /** Request timeout in milliseconds (default: 120_000 for long diff operations) */
  timeout?: number;
}

export interface ModelLookDevSceneControlCapabilities {
  readonly renderModes: readonly ViewportDescriptor['renderMode'][];
  readonly liveViewportSettings: boolean;
  readonly clay: boolean;
  readonly authoredLights: boolean;
  readonly environment: boolean;
  readonly typedPicking: boolean;
  readonly characterRegions: boolean;
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

export type FileAccessPurpose =
  | 'preview'
  | 'media-decode'
  | 'subtitle'
  | 'document'
  | 'model'
  | 'puppet'
  | 'agent-attachment'
  | 'other';

export interface FileSourceRef {
  token?: string;
  path?: string;
  assetId?: string;
}

export interface RegisterFileRequest {
  source?: string;
  filePath?: string;
  path?: string;
  purpose?: FileAccessPurpose;
  ttlMs?: number;
  mimeHint?: string;
}

export interface RegisteredFile {
  token: string;
  fileSizeBytes: number;
  mimeType: string;
  purpose: FileAccessPurpose;
  rangeUrl: string;
  entryBaseUrl?: string | null;
  resourceBaseUrl?: string | null;
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

export interface LiveCompositorStreamOptions {
  readonly sceneId: string;
  readonly viewportId: string;
  readonly sessionId?: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
}

export interface LiveCompositorStreamHandle {
  descriptor: RenderStreamDescriptor;
  wsUrl: string;
}

export type PuppetStreamFormat = 'json' | 'h264';

export interface PuppetStreamOptions {
  format?: PuppetStreamFormat;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
}

export interface PuppetH264StreamHandle {
  wsUrl: string;
  width: number;
  height: number;
  fps: number;
  codecString: string;
}

export interface PuppetExportH264Options {
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
  durationMs?: number;
  bitrate?: number;
  gopSize?: number;
}

export interface PuppetExportSummary {
  framesSubmitted: number;
}

const logger = getLogger('EngineClient');

type SceneNodeSnapshot = SceneSnapshot['nodes'][number];
type SceneAnimationClipInfo = SceneSnapshot['animations'][number];
type SceneCameraState = NonNullable<SceneSnapshot['activeCamera']>;
type SceneBounds3 = NonNullable<SceneNodeSnapshot['worldBounds']>;

const DEFAULT_MODEL_LOOKDEV_SCENE_CONTROL_CAPABILITIES: ModelLookDevSceneControlCapabilities = {
  renderModes: [
    'pbr',
    'clay',
    'wireframe',
    'unlit',
    'normal',
    'depth',
    'lightComplexity',
    'shadowAtlas',
  ],
  liveViewportSettings: false,
  clay: true,
  authoredLights: false,
  environment: false,
  typedPicking: false,
  characterRegions: false,
};

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

function toVec4(value: unknown, fallback: { x: number; y: number; z: number; w: number }) {
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

function normalizeBounds3(value: unknown): SceneBounds3 | undefined {
  if (!isRecord(value)) return undefined;
  return {
    min: toVec3(value.min, { x: 0, y: 0, z: 0 }),
    max: toVec3(value.max, { x: 0, y: 0, z: 0 }),
  };
}

function normalizeSceneNodeSnapshot(value: unknown): SceneNodeSnapshot | null {
  if (!isRecord(value)) return null;

  const transform = isRecord(value.transform) ? value.transform : value;
  const nodeId = getString(value.nodeId, getString(value.id));
  if (!nodeId) return null;

  const kind = getString(
    value.kind,
    getBoolean(value.hasMesh ?? value.has_mesh, false)
      ? 'mesh'
      : getBoolean(value.hasLight ?? value.has_light, false)
        ? 'light'
        : getBoolean(value.hasCamera ?? value.has_camera, false)
          ? 'camera'
          : 'node',
  );

  const parentValue = value.parentId ?? value.parent_id;
  const parentId =
    typeof parentValue === 'string' && parentValue.length > 0 ? parentValue : undefined;

  const node: SceneNodeSnapshot = {
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
    bounds: normalizeBounds3(value.bounds),
    worldBounds: normalizeBounds3(value.worldBounds ?? value.world_bounds),
  };
  const light = normalizeLightPatch(value.light);
  if (light !== undefined) {
    node.light = light;
  }
  return node;
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

  const snapshot: SceneSnapshot = {
    sceneId: getString(value.sceneId, getString(value.scene_id, 'default')),
    revision: getNumber(value.revision),
    nodes,
    animations,
    activeCamera: normalizeCameraState(value.activeCamera ?? value.active_camera),
  };

  const environment = normalizeEnvironmentPatch(value.environment);
  if (environment) {
    snapshot.environment = environment;
  }

  return snapshot;
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

function isViewportEventLike(value: unknown): value is ViewportEvent {
  if (!isRecord(value)) return false;
  return (
    value.protocolVersion === 1 &&
    (value.domain === 'viewport' || value.domain === 'scene') &&
    typeof value.event === 'string' &&
    typeof value.sceneId === 'string' &&
    typeof value.ackSeq === 'number' &&
    typeof value.revision === 'number' &&
    typeof value.timestamp === 'number' &&
    isRecord(value.payload)
  );
}

function normalizePuppetExportSummary(value: unknown): PuppetExportSummary {
  if (!isRecord(value)) {
    return { framesSubmitted: 0 };
  }
  return {
    framesSubmitted: getNumber(value.frames_submitted ?? value.framesSubmitted),
  };
}

function assertPuppetCommandApplied(ack: PuppetCommandAck): void {
  if (ack.status === 'applied') return;
  throw new Error(ack.error?.message ?? 'puppet command rejected');
}

function readPuppetCommandAck(value: unknown, action: string): PuppetCommandAck {
  if (isPuppetCommandAck(value)) return value;
  throw new Error(`Invalid ${action} response: expected PuppetCommandAck`);
}

function puppetCommandEnvelopeToOptions(envelope: PuppetCommandEnvelope): Record<string, unknown> {
  const options: Record<string, unknown> = {
    seq: envelope.seq,
    baseRevision: envelope.baseRevision,
    command: envelope.command,
  };
  if (envelope.transactionId !== undefined) {
    options.transactionId = envelope.transactionId;
  }
  return options;
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

function normalizeRenderMode(value: unknown): ViewportDescriptor['renderMode'] | undefined {
  switch (value) {
    case 'pbr':
    case 'clay':
    case 'wireframe':
    case 'unlit':
    case 'normal':
    case 'depth':
    case 'lightComplexity':
    case 'shadowAtlas':
      return value;
    default:
      return undefined;
  }
}

function normalizeDebugView(value: unknown): ViewportDescriptor['debugView'] | undefined {
  switch (value) {
    case 'albedo':
    case 'roughness':
    case 'metallic':
    case 'ao':
    case 'uv':
    case 'overdraw':
      return value;
    default:
      return undefined;
  }
}

function normalizeMaterialOverride(value: unknown): ViewportMaterialOverride | undefined {
  if (!isRecord(value)) return undefined;
  const kind =
    value.kind === 'clay' || value.kind === 'matcap' || value.kind === 'none'
      ? value.kind
      : undefined;
  if (!kind) return undefined;
  const override: ViewportMaterialOverride = { kind };
  if (value.color !== undefined) {
    override.color = toVec3(value.color, { x: 0.78, y: 0.76, z: 0.72 });
  }
  if (typeof value.roughness === 'number') {
    override.roughness = value.roughness;
  }
  if (typeof value.metallic === 'number') {
    override.metallic = value.metallic;
  }
  if (typeof value.preserveAlpha === 'boolean') {
    override.preserveAlpha = value.preserveAlpha;
  }
  return override;
}

function normalizeLookDevSettings(value: unknown): ViewportLookDevSettings | undefined {
  if (!isRecord(value)) return undefined;
  const renderMode = normalizeRenderMode(value.renderMode);
  if (!renderMode) return undefined;
  const lookdev: ViewportLookDevSettings = { renderMode };
  const debugView = normalizeDebugView(value.debugView);
  if (debugView) lookdev.debugView = debugView;
  const materialOverride = normalizeMaterialOverride(value.materialOverride);
  if (materialOverride) lookdev.materialOverride = materialOverride;
  if (typeof value.helperPassesEnabled === 'boolean') {
    lookdev.helperPassesEnabled = value.helperPassesEnabled;
  }
  if (typeof value.showGrid === 'boolean') lookdev.showGrid = value.showGrid;
  if (typeof value.showSkeleton === 'boolean') lookdev.showSkeleton = value.showSkeleton;
  if (typeof value.showNormals === 'boolean') lookdev.showNormals = value.showNormals;
  return lookdev;
}

function normalizeH264DecoderPreference(value: unknown): string | undefined {
  switch (value) {
    case 'prefer-hardware':
    case 'prefer-software':
    case 'no-preference':
      return value;
    default:
      return undefined;
  }
}

function normalizeViewportH264Settings(value: unknown): ViewportDescriptor['h264'] | undefined {
  if (!isRecord(value)) return undefined;
  const h264: NonNullable<ViewportDescriptor['h264']> = {};
  if (typeof value.gopSize === 'number' && Number.isFinite(value.gopSize)) {
    h264.gopSize = Math.max(1, Math.floor(value.gopSize));
  }
  const decoderPreference = normalizeH264DecoderPreference(value.decoderPreference);
  if (decoderPreference) {
    h264.decoderPreference = decoderPreference;
  }
  return h264.gopSize !== undefined || h264.decoderPreference !== undefined ? h264 : undefined;
}

function normalizeEnvironmentPatch(value: unknown): EnvironmentPatch | undefined {
  if (!isRecord(value)) return undefined;
  const environmentId = getString(value.environmentId);
  const mode =
    value.mode === 'skybox' || value.mode === 'ibl' || value.mode === 'background-and-ibl'
      ? value.mode
      : undefined;
  if (!environmentId || !mode) return undefined;
  const environment: EnvironmentPatch = {
    environmentId,
    mode,
    rotationDeg: getNumber(value.rotationDeg),
    intensity: getNumber(value.intensity, 1),
    exposure: getNumber(value.exposure),
    visibleAsBackground: getBoolean(value.visibleAsBackground, true),
  };
  if (isRecord(value.source)) {
    const id = getString(value.source.id);
    if (id) {
      environment.source = {
        id,
        uri: getString(value.source.uri) || undefined,
        kind: getString(value.source.kind) || undefined,
      };
    }
  }
  if (value.backgroundColor !== undefined) {
    environment.backgroundColor = toVec4(value.backgroundColor, { x: 0, y: 0, z: 0, w: 1 });
  }
  return environment;
}

function normalizeLightPatch(value: unknown): LightPatch | undefined {
  if (!isRecord(value)) return undefined;
  const nodeId = getString(value.nodeId);
  const kind = getString(value.kind);
  if (!nodeId || !kind) return undefined;
  const light: LightPatch = {
    nodeId,
    kind,
    color: toVec3(value.color, { x: 1, y: 1, z: 1 }),
    intensity: getNumber(value.intensity, 1),
  };
  if (typeof value.range === 'number') light.range = value.range;
  if (typeof value.innerConeAngle === 'number') light.innerConeAngle = value.innerConeAngle;
  if (typeof value.outerConeAngle === 'number') light.outerConeAngle = value.outerConeAngle;
  if (isRecord(value.shadow)) {
    light.shadow = {
      enabled: getBoolean(value.shadow.enabled, false),
      resolution: typeof value.shadow.resolution === 'number' ? value.shadow.resolution : undefined,
      bias: typeof value.shadow.bias === 'number' ? value.shadow.bias : undefined,
    };
  }
  return light;
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

  const descriptor: RenderStreamDescriptor = {
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
    codedWidth: typeof value.codedWidth === 'number' ? value.codedWidth : undefined,
    codedHeight: typeof value.codedHeight === 'number' ? value.codedHeight : undefined,
    latencyMode: typeof value.latencyMode === 'string' ? value.latencyMode : undefined,
    scheduledWidth: typeof value.scheduledWidth === 'number' ? value.scheduledWidth : undefined,
    scheduledHeight: typeof value.scheduledHeight === 'number' ? value.scheduledHeight : undefined,
    scheduledFps: typeof value.scheduledFps === 'number' ? value.scheduledFps : undefined,
  };

  const renderMode = normalizeRenderMode(value.renderMode);
  if (renderMode) descriptor.renderMode = renderMode;
  const debugView = normalizeDebugView(value.debugView);
  if (debugView) descriptor.debugView = debugView;
  const lookdev = normalizeLookDevSettings(value.lookdev);
  if (lookdev) descriptor.lookdev = lookdev;
  const h264 = normalizeViewportH264Settings(value.h264);
  if (h264) descriptor.h264 = h264;

  return descriptor;
}

function normalizeLiveCompositorSceneResponse(value: unknown): LiveCompositorScene {
  const scene = isRecord(value) && value.scene !== undefined ? value.scene : value;
  if (!isLiveCompositorScene(scene)) {
    throw new Error('live-compositor returned an invalid scene');
  }
  return scene;
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
    helperPassesEnabled: viewport.helperPassesEnabled,
    lookdev: viewport.lookdev,
    h264: viewport.h264,
    allowFpsDegrade: viewport.allowFpsDegrade,
    allowQualityDegrade: viewport.allowQualityDegrade,
  };
}

export function createSceneCommandEnvelope(input: {
  seq: number;
  baseRevision: number;
  type: SceneCommand['type'];
  payload?: Record<string, unknown>;
  transactionId?: string;
  coalesceKey?: string;
  characterCommand?: SceneCommand['characterCommand'];
}): SceneCommandEnvelope {
  const command: SceneCommand = {
    type: input.type,
    payloadJson: JSON.stringify(input.payload ?? {}),
  };
  if (input.characterCommand) {
    command.characterCommand = input.characterCommand;
  }
  const envelope: SceneCommandEnvelope = {
    seq: input.seq,
    baseRevision: input.baseRevision,
    command,
  };
  if (input.transactionId) envelope.transactionId = input.transactionId;
  if (input.coalesceKey) envelope.coalesceKey = input.coalesceKey;
  return envelope;
}

/**
 * Build a safe node-remove payload. Omitted cascade is serialized as `false`
 * so callers must opt into destructive cascade removal explicitly.
 */
export function createNodeRemovePayload(command: NodeRemoveCommand): Record<string, unknown> {
  return {
    nodeId: command.nodeId,
    cascade: command.cascade ?? false,
  };
}

export function createLightUpdatePayload(patch: LightPatch): Record<string, unknown> {
  return { ...patch };
}

export function createEnvironmentPayload(patch: EnvironmentPatch): Record<string, unknown> {
  return { ...patch };
}

export function defaultModelLookDevSceneControlCapabilities(): ModelLookDevSceneControlCapabilities {
  return {
    ...DEFAULT_MODEL_LOOKDEV_SCENE_CONTROL_CAPABILITIES,
    renderModes: [...DEFAULT_MODEL_LOOKDEV_SCENE_CONTROL_CAPABILITIES.renderModes],
  };
}

function normalizeModelLookDevSceneControlCapabilities(
  value: unknown,
): ModelLookDevSceneControlCapabilities {
  if (!isRecord(value)) {
    return defaultModelLookDevSceneControlCapabilities();
  }
  const defaults = defaultModelLookDevSceneControlCapabilities();
  const renderModes = Array.isArray(value.renderModes)
    ? value.renderModes.filter(
        (mode): mode is ViewportDescriptor['renderMode'] => normalizeRenderMode(mode) !== undefined,
      )
    : defaults.renderModes;
  return {
    renderModes,
    liveViewportSettings: getBoolean(value.liveViewportSettings, defaults.liveViewportSettings),
    clay: getBoolean(value.clay, defaults.clay),
    authoredLights: getBoolean(value.authoredLights, defaults.authoredLights),
    environment: getBoolean(value.environment, defaults.environment),
    typedPicking: getBoolean(value.typedPicking, defaults.typedPicking),
    characterRegions: getBoolean(value.characterRegions, defaults.characterRegions),
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
    if (!this.pathResolver.hasVariable(source)) return source;
    return this.pathResolver.resolve(source);
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

  getPuppetStreamWsUrl(options?: PuppetStreamOptions): string {
    const params = new URLSearchParams();
    if (options?.format) params.set('format', options.format);
    if (options?.width !== undefined) params.set('width', String(options.width));
    if (options?.height !== undefined) params.set('height', String(options.height));
    if (options?.fps !== undefined) params.set('fps', String(options.fps));
    if (options?.bitrate !== undefined) params.set('bitrate', String(options.bitrate));
    const query = params.toString();
    return `ws://127.0.0.1:${this.port}/v1/puppets/stream${query ? `?${query}` : ''}`;
  }

  getPuppetControlWsUrl(): string {
    return `ws://127.0.0.1:${this.port}/v1/puppets/control`;
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
    if (options && typeof options === 'object' && 'sourceRef' in options) {
      const sourceRef = (options as Record<string, unknown>).sourceRef;
      if (isRecord(sourceRef) && typeof sourceRef.path === 'string') {
        options = {
          ...options,
          sourceRef: { ...sourceRef, path: this.resolveSource(sourceRef.path) },
        };
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
    const startTime = Date.now();

    logger.debug(`dispatch ${req.group}/${req.action}`, {
      source: resolvedSource,
      hasBody: req.body != null,
      hasOptions: Object.keys(options).length > 0,
    });

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

      const response = (await res.json()) as ActionResponse;
      logger.debug(`dispatch ${req.group}/${req.action} done`, {
        status: response.status,
        durationMs: Date.now() - startTime,
        hasError: response.error != null,
      });
      return response;
    } catch (error) {
      logger.warn(`dispatch ${req.group}/${req.action} failed`, {
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
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
      options: { ...sourceOptions(source), ...opts },
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
    source: string | FileSourceRef,
    time: number,
    opts?: { quality?: number; format?: string; width?: number; height?: number },
  ): Promise<ArrayBuffer | null> {
    const resp = await this.dispatch({
      group: 'videos',
      action: 'capture',
      options: {
        ...sourceOptions(source),
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
    source: string | FileSourceRef,
    opts?: { quality?: number; format?: string; width?: number; height?: number },
  ): Promise<ArrayBuffer | null> {
    const resp = await this.dispatch({
      group: 'images',
      action: 'capture',
      options: {
        ...sourceOptions(source),
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
    source: string | FileSourceRef,
    opts?: Record<string, unknown>,
  ): Promise<StreamHandle> {
    const resp = await this.dispatch({
      group,
      action: 'stream',
      options: { ...sourceOptions(source), ...opts },
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
   * List all registered effect capabilities.
   * Dispatches `effects:list-capabilities`.
   */
  async listEffectCapabilities(): Promise<EffectCapability[]> {
    const resp = await this.dispatch({
      group: 'effects',
      action: 'list-capabilities',
      options: {},
    });
    this.assertOk(resp, 'effects:list-capabilities');
    return (resp.data as EffectCapability[] | undefined) ?? [];
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
  async loadModel(source: string | FileSourceRef): Promise<SceneSnapshot> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'load',
      options: sourceOptions(source),
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

  async getModelLookDevSceneControlCapabilities(): Promise<ModelLookDevSceneControlCapabilities> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'capabilities',
      options: {},
    });
    this.assertOk(resp, 'scenes:capabilities');
    return normalizeModelLookDevSceneControlCapabilities(resp.data);
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

  querySceneSelection(
    socket: SceneControlSocket,
    query: SelectionQuery,
  ): Promise<SelectionQueryResult> {
    return socket
      .query('selectionQuery', {
        viewportId: query.viewportId,
        x: query.x,
        y: query.y,
        mask: query.mask,
        mode: query.mode,
      })
      .then(normalizeSelectionQueryResult);
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

  /** Set visibility for a scene node. Dispatches `scenes:set_visible`. */
  async setSceneNodeVisible(nodeId: string, visible: boolean): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'set_visible',
      options: { node_id: nodeId, visible },
    });
    this.assertOk(resp, 'scenes:set_visible');
  }

  /** Update material parameters for a scene node. Dispatches `scenes:update_material`. */
  async updateSceneMaterial(
    nodeId: string,
    params: {
      baseColor?: readonly [number, number, number, number];
      metallic?: number;
      roughness?: number;
      emissive?: readonly [number, number, number];
      occlusionStrength?: number;
    },
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'update_material',
      options: {
        node_id: nodeId,
        base_color: params.baseColor,
        metallic: params.metallic,
        roughness: params.roughness,
        emissive: params.emissive,
        occlusion_strength: params.occlusionStrength,
      },
    });
    this.assertOk(resp, 'scenes:update_material');
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
    viewportId?: string,
  ): Promise<void> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'update_camera',
      options: { position, target, fovY, viewportId },
    });
    this.assertOk(resp, 'scenes:update_camera');
  }

  async dispatchViewportCommand(command: ViewportCommand): Promise<ViewportEvent> {
    const resp = await this.dispatch({
      group: 'viewport',
      action: 'command',
      body: command,
    });
    this.assertOk(resp, 'viewport:command');
    if (!isViewportEventLike(resp.data)) {
      throw new Error('viewport:command returned an invalid ViewportEvent');
    }
    return resp.data;
  }

  async createOrUpdateLiveCompositorScene(
    scene: LiveCompositorScene,
  ): Promise<LiveCompositorScene> {
    const create = await this.dispatch({
      group: 'live-compositor',
      action: 'create',
      id: scene.sceneId,
      body: { scene },
    });
    if (create.status !== 'error') {
      return normalizeLiveCompositorSceneResponse(create.data);
    }

    const update = await this.dispatch({
      group: 'live-compositor',
      action: 'update',
      id: scene.sceneId,
      body: { scene },
    });
    this.assertOk(update, 'live-compositor:update');
    return normalizeLiveCompositorSceneResponse(update.data);
  }

  async getLiveCompositorScene(sceneId: string): Promise<LiveCompositorScene> {
    const resp = await this.dispatch({
      group: 'live-compositor',
      action: 'get',
      id: sceneId,
    });
    this.assertOk(resp, 'live-compositor:get');
    return normalizeLiveCompositorSceneResponse(resp.data);
  }

  async startLiveCompositorStream(
    options: LiveCompositorStreamOptions,
  ): Promise<LiveCompositorStreamHandle> {
    const resp = await this.dispatch({
      group: 'live-compositor',
      action: 'stream',
      id: options.sceneId,
      options: {
        sceneId: options.sceneId,
        viewportId: options.viewportId,
        sessionId: options.sessionId,
        width: options.width,
        height: options.height,
        fps: options.fps,
      },
    });
    this.assertOk(resp, 'live-compositor:stream');
    const descriptor = normalizeSceneRenderStreamDescriptor(resp.data);
    return {
      descriptor,
      wsUrl: this.getStreamWsUrl(descriptor.streamId),
    };
  }

  async stopLiveCompositorStream(target: {
    readonly sceneId?: string;
    readonly viewportId?: string;
    readonly streamId?: string;
  }): Promise<void> {
    const resp = await this.dispatch({
      group: 'live-compositor',
      action: 'stop',
      id: target.streamId ?? target.sceneId ?? '',
      options: {
        sceneId: target.sceneId,
        viewportId: target.viewportId,
        streamId: target.streamId,
      },
    });
    this.assertOk(resp, 'live-compositor:stop');
  }

  /**
   * Create a parametric shape in the 3D scene.
   * Dispatches `scenes:create_shape`.
   */
  async createShape(shapeType: string, params: Record<string, number>): Promise<SceneSnapshot> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'create_shape',
      options: { type: shapeType, ...params },
    });
    this.assertOk(resp, 'scenes:create_shape');
    return normalizeSceneSnapshot(resp.data);
  }

  /**
   * Create extruded 3D text in the scene.
   * Dispatches `scenes:create_text`.
   */
  async createTextMesh(
    text: string,
    fontSize: number,
    extrusionDepth: number,
  ): Promise<SceneSnapshot> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'create_text',
      options: { text, fontSize, extrusionDepth },
    });
    this.assertOk(resp, 'scenes:create_text');
    return normalizeSceneSnapshot(resp.data);
  }

  /**
   * Perform CSG boolean operation on two scene entities.
   * Dispatches `scenes:csg_boolean`.
   */
  async csgBoolean(
    entityA: string,
    entityB: string,
    operation: 'union' | 'difference' | 'intersection',
  ): Promise<SceneSnapshot> {
    const resp = await this.dispatch({
      group: 'scenes',
      action: 'csg_boolean',
      options: { entityA, entityB, operation },
    });
    this.assertOk(resp, 'scenes:csg_boolean');
    return normalizeSceneSnapshot(resp.data);
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
  // 2D Puppets (Live2D MOC3)
  // =========================================================================

  /**
   * Load a puppet from MOC3 binary data.
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
   * Load a puppet from an engine-resolved source reference.
   * Prefer this over forwarding `.moc3` bytes through Extension/Webview code.
   */
  async loadPuppetSource(source: string | FileSourceRef): Promise<Record<string, unknown>> {
    const options =
      typeof source === 'string' ? { source: this.resolveSource(source) } : { sourceRef: source };
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'load_source',
      options,
    });
    this.assertOk(resp, 'puppets:load_source');
    return (resp.data as Record<string, unknown>) ?? {};
  }

  /** Load a native .nkp v2 project as the authoritative puppet runtime state. */
  async loadNativePuppetProject(project: NkpProjectData): Promise<Record<string, unknown>> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'native_command',
      options: {
        seq: 1,
        baseRevision: 0,
        command: { type: 'loadNativeProject', project },
      } satisfies PuppetCommandEnvelope,
    });
    this.assertOk(resp, 'puppets:native_command');
    const ack = readPuppetCommandAck(resp.data, 'puppets:native_command');
    assertPuppetCommandApplied(ack);
    return (ack.result as Record<string, unknown>) ?? {};
  }

  /**
   * Load Live2D auxiliary JSON after a MOC3 puppet is loaded.
   * Dispatches `puppets:load_auxiliary`.
   */
  async loadPuppetAuxiliary(options: {
    expressions?: readonly (readonly [string, string])[];
    motions?: readonly (readonly [string, string])[];
    physics?: string;
  }): Promise<void> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'load_auxiliary',
      options: {},
      body: {
        expressions: options.expressions ?? [],
        motions: options.motions ?? [],
        physics: options.physics,
      },
    });
    this.assertOk(resp, 'puppets:load_auxiliary');
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

  /** Apply a revision-aware native puppet command envelope. */
  async applyPuppetCommand(envelope: PuppetCommandEnvelope): Promise<PuppetCommandAck> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'native_command',
      options: puppetCommandEnvelopeToOptions(envelope),
    });
    this.assertOk(resp, 'puppets:native_command');
    return readPuppetCommandAck(resp.data, 'puppets:native_command');
  }

  /** Apply a native puppet command and throw when the engine rejects it. */
  async applyPuppetCommandOrThrow(envelope: PuppetCommandEnvelope): Promise<PuppetCommandAck> {
    const ack = await this.applyPuppetCommand(envelope);
    assertPuppetCommandApplied(ack);
    return ack;
  }

  async setNativePuppetBlendShape(envelope: {
    seq: number;
    baseRevision: number;
    transactionId?: string;
    name: string;
    weight: number;
  }): Promise<PuppetCommandAck> {
    const { name, weight, ...base } = envelope;
    return this.applyPuppetCommandOrThrow({
      ...base,
      command: { type: 'setNativeBlendShape', name, weight },
    });
  }

  async setNativePuppetBoneTransform(envelope: {
    seq: number;
    baseRevision: number;
    transactionId?: string;
    bone: string;
    transform: Extract<PuppetCommand, { type: 'setNativeBoneTransform' }>['transform'];
    mode?: Extract<PuppetCommand, { type: 'setNativeBoneTransform' }>['mode'];
  }): Promise<PuppetCommandAck> {
    const { bone, transform, mode, ...base } = envelope;
    return this.applyPuppetCommandOrThrow({
      ...base,
      command: { type: 'setNativeBoneTransform', bone, transform, mode },
    });
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

  /** Export the current puppet animation/render state as H.264 through the engine muxer. */
  async exportPuppetH264(options: PuppetExportH264Options): Promise<PuppetExportSummary> {
    const resp = await this.dispatch({
      group: 'puppets',
      action: 'export_h264',
      options: {
        output_path: options.outputPath,
        width: options.width,
        height: options.height,
        fps: options.fps,
        duration_ms: options.durationMs,
        bitrate: options.bitrate,
        gop_size: options.gopSize,
      },
    });
    this.assertOk(resp, 'puppets:export_h264');
    return normalizePuppetExportSummary(resp.data);
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
  openPuppetStream(options?: PuppetStreamOptions): WebSocket {
    return new WebSocket(this.getPuppetStreamWsUrl(options));
  }

  createPuppetH264StreamHandle(
    options?: Omit<PuppetStreamOptions, 'format'>,
  ): PuppetH264StreamHandle {
    const width = options?.width ?? 512;
    const height = options?.height ?? 512;
    const fps = options?.fps ?? 60;
    return {
      wsUrl: this.getPuppetStreamWsUrl({ ...options, format: 'h264' }),
      width,
      height,
      fps,
      codecString: 'avc1.42001f',
    };
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

  /**
   * Run offline ML preprocessing and return timeline source replacement metadata.
   * Dispatches `models:preprocess`.
   */
  async preprocessModelSource(request: ModelPreprocessRequest): Promise<ModelPreprocessResult> {
    const resp = await this.dispatch({
      group: 'models',
      action: 'preprocess',
      options: { ...request },
    });
    this.assertOk(resp, 'models:preprocess');
    return resp.data as ModelPreprocessResult;
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
    const resp = await this.dispatch({
      group: 'previews',
      action: 'register-token',
      options: { filePath: resolved },
    });
    this.assertOk(resp, 'previews:register-token');
    const body = resp.data as { token?: string } | undefined;
    if (!body?.token) {
      throw new Error('previews:register-token returned no token');
    }
    return body.token;
  }

  /**
   * Register any preview asset through the engine-first manifest path.
   *
   * Webviews should consume returned manifest URLs/tokens/streams rather than
   * receiving raw local file paths for Neko-owned preview media.
   */
  async registerPreviewAsset(request: RegisterPreviewAssetRequest): Promise<PreviewManifest> {
    const resp = await this.dispatch({
      group: 'previews',
      action: 'register-asset',
      options: { ...request },
    });
    this.assertOk(resp, 'previews:register-asset');
    return resp.data as PreviewManifest;
  }

  /** Request a manifest-linked preview variant such as thumbnail or FOV crop. */
  async requestPreviewVariant(
    assetId: string,
    request: PreviewVariantRequest,
  ): Promise<PreviewVariant> {
    const resp = await this.dispatch({
      group: 'previews',
      action: 'request-variant',
      id: assetId,
      options: { ...request },
    });
    this.assertOk(resp, 'previews:request-variant');
    return resp.data as PreviewVariant;
  }

  /** Persist low-frequency preview metadata such as projection/default view. */
  async updatePreviewAssetMetadata(
    assetId: string,
    request: UpdatePreviewAssetMetadataRequest,
  ): Promise<PreviewManifest> {
    const resp = await this.dispatch({
      group: 'previews',
      action: 'update-metadata',
      id: assetId,
      options: { ...request },
    });
    this.assertOk(resp, 'previews:update-metadata');
    return resp.data as PreviewManifest;
  }

  /** Unregister a preview asset and release manifest tokens/variants best-effort. */
  async unregisterPreviewAsset(assetIdOrToken: string): Promise<void> {
    await this.dispatch({
      group: 'previews',
      action: 'unregister',
      id: assetIdOrToken,
      options: {},
    }).catch(() => {
      // Best-effort; engine may have already stopped.
    });
  }

  /** Build the engine token URL for callers that receive token-only manifests. */
  getPreviewTokenUrl(token: string): string {
    return `${this.baseUrl}/v1/preview/file/${token}`;
  }

  /** Build the general engine file access URL for a token. */
  getFileTokenUrl(token: string): string {
    return `${this.baseUrl}/v1/files/${encodeURIComponent(token)}`;
  }

  /** Build the general engine ZIP/container entry URL for a token and entry path. */
  getFileEntryUrl(token: string, entryPath: string): string {
    return `${this.baseUrl}/v1/files/${encodeURIComponent(token)}/entries/${encodeEntryPath(entryPath)}`;
  }

  /** Build the model/document resource base URL for relative Webview fetches. */
  getFileResourceBaseUrl(token: string): string {
    return `${this.baseUrl}/v1/files/${encodeURIComponent(token)}/resources/`;
  }

  /** Build a URL for a resource adjacent to a registered model/document file. */
  getFileResourceUrl(token: string, resourcePath: string): string {
    return `${this.getFileResourceBaseUrl(token)}${encodeEntryPath(resourcePath)}`;
  }

  /** Register a local file through the generic engine file access contract. */
  async registerFile(request: RegisterFileRequest | string): Promise<RegisteredFile> {
    const normalized =
      typeof request === 'string'
        ? { filePath: this.resolveSource(request), purpose: 'preview' as FileAccessPurpose }
        : {
            ...request,
            filePath: request.filePath ? this.resolveSource(request.filePath) : request.filePath,
            source: request.source ? this.resolveSource(request.source) : request.source,
            path: request.path ? this.resolveSource(request.path) : request.path,
          };
    const resp = await this.dispatch({
      group: 'files',
      action: 'register',
      options: normalized,
    });
    this.assertOk(resp, 'files:register');
    return resp.data as RegisteredFile;
  }

  /** Best-effort release for a generic engine file token. */
  async unregisterFile(token: string): Promise<void> {
    await this.dispatch({
      group: 'files',
      action: 'unregister',
      id: token,
      options: {},
    }).catch(() => {
      // Best-effort; engine may have already stopped.
    });
  }

  /** Fetch generic file token metadata. */
  async statFile(token: string): Promise<RegisteredFile> {
    const resp = await this.dispatch({
      group: 'files',
      action: 'stat',
      id: token,
      options: {},
    });
    this.assertOk(resp, 'files:stat');
    return resp.data as RegisteredFile;
  }

  /** Resolve and authorize a local path without registering a token. */
  async resolveFile(source: string): Promise<{ path: string }> {
    const resp = await this.dispatch({
      group: 'files',
      action: 'resolve',
      options: { source: this.resolveSource(source) },
    });
    this.assertOk(resp, 'files:resolve');
    return resp.data as { path: string };
  }

  /** Read a byte range from a registered generic file token. */
  async readFileRange(token: string, start: number, end: number): Promise<ArrayBuffer> {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new Error(`Invalid engine file byte range: ${start}-${end}`);
    }
    const res = await fetch(this.getFileTokenUrl(token), {
      headers: { Range: `bytes=${start}-${end}` },
    });
    if (res.status !== 206) {
      throw new Error(`files:readRange failed: ${res.status}`);
    }
    return res.arrayBuffer();
  }

  /** Read a single entry from a registered ZIP/container file token. */
  async readFileEntry(token: string, entryPath: string): Promise<ArrayBuffer> {
    const res = await fetch(this.getFileEntryUrl(token, entryPath));
    if (!res.ok) {
      throw new Error(`files:readEntry(${entryPath}) failed: ${res.status}`);
    }
    return res.arrayBuffer();
  }

  /** Register a file for the duration of a scoped operation and always release it. */
  async withRegisteredFile<T>(
    request: RegisterFileRequest | string,
    task: (registered: RegisteredFile) => Promise<T>,
  ): Promise<T> {
    const registered = await this.registerFile(request);
    try {
      return await task(registered);
    } finally {
      await this.unregisterFile(registered.token);
    }
  }

  /** Unregister a previously registered document token. */
  async unregisterDocument(token: string): Promise<void> {
    await this.dispatch({
      group: 'previews',
      action: 'unregister-token',
      id: token,
      options: {},
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
    return this.readFileRange(token, start, end);
  }

  /**
   * Read a single entry from a ZIP-based document (EPUB, CBZ, DOCX).
   *
   * The engine extracts the entry on demand from the ZIP archive.
   * Returns raw binary data as `ArrayBuffer`.
   */
  async readDocumentEntry(token: string, entryPath: string): Promise<ArrayBuffer> {
    return this.readFileEntry(token, entryPath);
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

function encodeEntryPath(entryPath: string): string {
  const normalized = entryPath.replace(/^\/+/, '');
  if (normalized.length === 0) {
    throw new Error('File entry path is required');
  }
  return normalized.split('/').map(encodeURIComponent).join('/');
}

function sourceOptions(source: string | FileSourceRef): Record<string, unknown> {
  return typeof source === 'string' ? { source } : { sourceRef: source };
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
