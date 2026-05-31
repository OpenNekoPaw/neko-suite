/**
 * Zustand store for 3D Model Editor state management.
 *
 * Manages scene graph, selection, animation playback, and transform mode.
 */

import { create } from 'zustand';
import type {
  SceneNodeSnapshot,
  AnimationClipInfo,
  PlaybackState,
  SceneDelta,
  SceneSnapshot,
  TransformMode,
} from '../types';
import type { EditorKeyframeTrack } from '@neko/shared';
import type {
  CharacterPreviewModeId,
  CharacterPreviewModeStatePayload,
  EnvironmentPlacement,
  EnvironmentDiagnostic,
  EnvironmentPatch,
  RenderFrameMeta,
  SelectionTarget,
  ViewportEvent,
  ViewportRenderMode,
} from '@neko/shared';
import { isCharacterPreviewModeStatePayload } from '@neko/shared';
import {
  defaultModelLookDevSceneControlCapabilities,
  type ModelLookDevSceneControlCapabilities,
} from '@neko/neko-client';
import {
  AuthoringPerformanceMetrics,
  type AuthoringMetricsSnapshot,
} from '../scene/AuthoringPerformanceMetrics';
import {
  LocalPredictionLayer,
  type LocalPredictionInput,
  type LocalPredictionSnapshot,
} from '../scene/LocalPredictionLayer';

type TransformPatch = NonNullable<SceneDelta['updatedTransforms']>[number];
type VisibilityPatch = NonNullable<SceneDelta['updatedVisibility']>[number];
type LightPatch = NonNullable<SceneDelta['updatedLights']>[number];
type SceneNodePatch = NonNullable<SceneDelta['addedNodes']>[number];
type ViewportOverlayPatch = NonNullable<SceneDelta['overlay']>;
type ModelingSessionState = NonNullable<SceneDelta['modelingSessions']>[number];
type SceneControlStatus = 'disconnected' | 'connecting' | 'ready' | 'error';
type CharacterPreviewUiStatus = 'unavailable' | 'pending' | 'applied' | 'rejected';
type LookDevRequestStatus =
  | 'unavailable'
  | 'requested'
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'timeout';
export type ModelSelectionWorkflow =
  | 'object'
  | 'face-region'
  | 'bone-pose'
  | 'light'
  | 'animation'
  | 'export-inspect';
type Vec3 = [number, number, number];

const DEFAULT_CAMERA_THETA = 0;
const DEFAULT_CAMERA_PHI = Math.PI / 4;
const DEFAULT_CAMERA_RADIUS = 2.2;
const DEFAULT_CAMERA_TARGET: Vec3 = [0, 0.8, 0];
const EDITOR_CAMERA_FOV_RAD = (45 * Math.PI) / 180;
const MIN_CAMERA_RADIUS = 0.05;
const MIN_FRAME_CAMERA_RADIUS = 0.12;
const MAX_CAMERA_RADIUS = 8;
const MIN_NODE_EXTENT = 0.01;
const CAMERA_FIT_PADDING = 1.25;
const EPSILON = 0.000001;
const LOOKDEV_MODE_UNAVAILABLE_DIAGNOSTIC = 'lookdev.modeUnavailable';

interface CameraStatePatch {
  cameraTheta: number;
  cameraPhi: number;
  cameraRadius: number;
  cameraTarget: Vec3;
}

interface SceneBounds {
  min: Vec3;
  max: Vec3;
}

interface NodeWorldFrame {
  position: Vec3;
  scale: Vec3;
}

export interface CharacterPreviewUiState {
  requestedMode: CharacterPreviewModeId | null;
  appliedMode: CharacterPreviewModeId | null;
  status: CharacterPreviewUiStatus;
  state: CharacterPreviewModeStatePayload | null;
  diagnostics: CharacterPreviewModeStatePayload['diagnostics'];
}

export interface LookDevUiState {
  requestedMode: ViewportRenderMode | null;
  appliedMode: ViewportRenderMode;
  status: LookDevRequestStatus;
  diagnostic: string | null;
}

export interface PendingTransformPrediction {
  seq: number;
  nodeId: string;
  position?: TransformPatch['position'];
  rotation?: TransformPatch['rotation'];
  scale?: TransformPatch['scale'];
}

export interface ModelState {
  // Scene
  sceneId: string;
  sceneRevision: number;
  sceneNodes: SceneNodeSnapshot[];
  selectedNodeId: string | null;
  sceneControlStatus: SceneControlStatus;
  sceneControlError: string | null;
  nextSceneCommandSeq: number;
  pendingTransformPredictions: PendingTransformPrediction[];
  localPredictionLayer: LocalPredictionLayer;
  localPredictions: LocalPredictionSnapshot[];
  viewportOverlay: ViewportOverlayPatch | null;
  topologyWarning: string | null;
  characterTopologyVersions: Record<string, number>;
  modelingSessions: Record<string, ModelingSessionState>;
  lastRenderFrameMeta: RenderFrameMeta | null;
  authoringMetrics: AuthoringPerformanceMetrics;
  authoringMetricsSnapshot: AuthoringMetricsSnapshot;
  showViewportGrid: boolean;
  isPerformanceMetricsVisible: boolean;
  characterPreview: CharacterPreviewUiState;
  lookDev: LookDevUiState;
  lookDevCapabilities: ModelLookDevSceneControlCapabilities;
  environmentState: EnvironmentPatch | null;
  environmentDiagnostics: EnvironmentDiagnostic[];
  selectedTargets: SelectionTarget[];
  selectionWorkflow: ModelSelectionWorkflow;

  // Animation
  animationClips: AnimationClipInfo[];
  activeAnimation: string | null;
  playbackState: PlaybackState;
  rootMotionEnabled: boolean;
  rootMotionNodeId: string | null;

  // Transform
  transformMode: TransformMode;

  // Engine preview
  isLoading: boolean;
  qualityPreviewDataUrl: string | null;
  environmentPlacement: EnvironmentPlacement | null;

  // Face Editor
  faceParams: Record<string, number>;
  isFaceEditorOpen: boolean;

  // Latency Tester
  isLatencyTesterOpen: boolean;

  // VRM Expression Presets
  isVRMLoaded: boolean;
  isExpressionPresetOpen: boolean;

  // Camera
  cameraTheta: number;
  cameraPhi: number;
  cameraRadius: number;
  cameraTarget: Vec3;
  lastAutoFramedSceneSignature: string | null;

  // Phase 2 panels
  isBoneExpressionOpen: boolean;
  isCsgPanelOpen: boolean;
  isTextEditorOpen: boolean;
  isShapeCreatorOpen: boolean;
  isSculptBrushOpen: boolean;
  csgOperandA: string | null;
  csgOperandB: string | null;

  // Keyframe Editor
  keyframeTracks: EditorKeyframeTrack[];
  selectedKeyframeIds: Set<string>;
  isKeyframeEditorOpen: boolean;
  currentTimeMs: number;

  // Actions — Scene
  setSceneNodes: (nodes: SceneNodeSnapshot[]) => void;
  applySceneSnapshot: (snapshot: SceneSnapshot) => void;
  applySceneDelta: (delta: SceneDelta) => void;
  selectNode: (id: string | null) => void;
  setSceneControlStatus: (status: SceneControlStatus, error?: string | null) => void;
  allocateSceneCommandSeq: () => number;
  addTransformPrediction: (prediction: PendingTransformPrediction) => void;
  commitTransformPrediction: (seq: number) => void;
  commitPredictionsThrough: (appliedSeq: number) => void;
  rollbackTransformPrediction: (seq: number) => void;
  createLocalPrediction: (prediction: LocalPredictionInput) => LocalPredictionSnapshot;
  commitLocalPredictionsThrough: (appliedSeq: number) => void;
  rollbackLocalPrediction: (idOrSeq: string | number) => void;
  timeoutLocalPredictions: (nowMs?: number) => void;
  invalidateLocalPredictions: (filter: Parameters<LocalPredictionLayer['invalidate']>[0]) => void;
  setViewportOverlay: (overlay: ViewportOverlayPatch | null) => void;
  recordAckLatency: (ms: number) => void;
  recordPatchBytes: (bytes: number, atMs?: number) => void;
  recordGpuUpload: (ms: number) => void;
  recordRenderFrameMeta: (meta: RenderFrameMeta) => void;
  updateLastRenderFrameMeta: (meta: RenderFrameMeta) => void;
  incrementDroppedPrediction: () => void;
  requestCharacterPreviewMode: (modeId: CharacterPreviewModeId) => void;
  applyCharacterPreviewState: (state: CharacterPreviewModeStatePayload) => void;
  applyCharacterPreviewEvent: (event: ViewportEvent) => void;
  requestLookDevMode: (mode: ViewportRenderMode) => void;
  markLookDevPending: (mode: ViewportRenderMode) => void;
  applyLookDevMode: (mode: ViewportRenderMode) => void;
  rejectLookDevMode: (message: string) => void;
  timeoutLookDevMode: (message: string) => void;
  setLookDevCapabilities: (capabilities: ModelLookDevSceneControlCapabilities) => void;
  setSelectionWorkflow: (workflow: ModelSelectionWorkflow) => void;

  // Actions — Animation
  setAnimationClips: (clips: AnimationClipInfo[]) => void;
  setActiveAnimation: (name: string | null, playbackState?: PlaybackState) => void;
  setRootMotion: (enabled: boolean, rootNodeId: string | null) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;

  // Actions — Transform
  setTransformMode: (mode: TransformMode) => void;

  // Actions — Engine preview
  setLoading: (loading: boolean) => void;
  setQualityPreview: (dataUrl: string | null) => void;
  setEnvironmentPlacement: (placement: EnvironmentPlacement | null) => void;

  // Actions — Bulk update
  updateNodeTransform: (
    nodeId: string,
    position?: TransformPatch['position'],
    rotation?: TransformPatch['rotation'],
    scale?: TransformPatch['scale'],
  ) => void;

  // Actions — Face Editor
  setFaceParam: (name: string, value: number) => void;
  setFaceParams: (params: Record<string, number>, options?: { replace?: boolean }) => void;
  resetFaceParams: () => void;
  randomizeFaceParams: () => void;
  toggleFaceEditor: () => void;

  // Actions — Latency Tester
  toggleLatencyTester: () => void;

  // Actions — VRM Expression Presets
  setVRMLoaded: (loaded: boolean) => void;
  toggleExpressionPreset: () => void;

  // Actions — Phase 2 panels
  toggleBoneExpression: () => void;
  toggleCsgPanel: () => void;
  toggleTextEditor: () => void;
  toggleShapeCreator: () => void;
  toggleSculptBrush: () => void;
  setCsgOperand: (slot: 'A' | 'B', nodeId: string | null) => void;

  // Actions — Keyframe Editor
  setKeyframeTracks: (tracks: EditorKeyframeTrack[]) => void;
  selectKeyframe: (id: string, multi?: boolean) => void;
  clearKeyframeSelection: () => void;
  toggleKeyframeEditor: () => void;
  setCurrentTimeMs: (timeMs: number) => void;

  // Actions — Camera
  orbitCamera: (deltaTheta: number, deltaPhi: number) => void;
  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (deltaRadius: number) => void;
  resetCamera: () => void;
  setViewportGridVisible: (visible: boolean) => void;
  toggleViewportGrid: () => void;
  setPerformanceMetricsVisible: (visible: boolean) => void;
  togglePerformanceMetrics: () => void;
  frameSceneCamera: (snapshot: SceneSnapshot) => boolean;
  markSceneCameraFramed: (snapshot: SceneSnapshot) => void;
  getCameraPosition: () => Vec3;

  // Actions — Project
  getEditorState: () => Record<string, unknown>;
  restoreEditorState: (state: Record<string, unknown>) => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  // Initial state
  sceneId: 'default',
  sceneRevision: 0,
  sceneNodes: [],
  selectedNodeId: null,
  sceneControlStatus: 'disconnected',
  sceneControlError: null,
  nextSceneCommandSeq: 1,
  pendingTransformPredictions: [],
  localPredictionLayer: new LocalPredictionLayer(),
  localPredictions: [],
  viewportOverlay: null,
  topologyWarning: null,
  characterTopologyVersions: {},
  modelingSessions: {},
  lastRenderFrameMeta: null,
  authoringMetrics: new AuthoringPerformanceMetrics(),
  authoringMetricsSnapshot: new AuthoringPerformanceMetrics().snapshot(),
  showViewportGrid: true,
  isPerformanceMetricsVisible: false,
  characterPreview: {
    requestedMode: null,
    appliedMode: null,
    status: 'unavailable',
    state: null,
    diagnostics: [],
  },
  lookDev: {
    requestedMode: null,
    appliedMode: 'pbr',
    status: 'applied',
    diagnostic: null,
  },
  lookDevCapabilities: defaultModelLookDevSceneControlCapabilities(),
  environmentState: null,
  environmentDiagnostics: [],
  selectedTargets: [],
  selectionWorkflow: 'object',
  animationClips: [],
  activeAnimation: null,
  playbackState: 'stopped',
  rootMotionEnabled: true,
  rootMotionNodeId: null,
  transformMode: 'translate',
  isLoading: false,
  qualityPreviewDataUrl: null,
  environmentPlacement: null,
  faceParams: {},
  isFaceEditorOpen: false,
  isLatencyTesterOpen: false,
  isVRMLoaded: false,
  isExpressionPresetOpen: false,
  isBoneExpressionOpen: false,
  isCsgPanelOpen: false,
  isTextEditorOpen: false,
  isShapeCreatorOpen: false,
  isSculptBrushOpen: false,
  csgOperandA: null,
  csgOperandB: null,
  cameraTheta: DEFAULT_CAMERA_THETA,
  cameraPhi: DEFAULT_CAMERA_PHI,
  cameraRadius: DEFAULT_CAMERA_RADIUS,
  cameraTarget: defaultCameraTarget(),
  lastAutoFramedSceneSignature: null,
  keyframeTracks: [],
  selectedKeyframeIds: new Set<string>(),
  isKeyframeEditorOpen: false,
  currentTimeMs: 0,

  // Scene actions
  setSceneNodes: (nodes) => set({ sceneNodes: nodes }),

  applySceneSnapshot: (snapshot) =>
    set((state) => {
      const selectedNodeId = snapshot.nodes.some((node) => node.nodeId === state.selectedNodeId)
        ? state.selectedNodeId
        : null;

      return {
        sceneId: snapshot.sceneId,
        sceneRevision: snapshot.revision,
        sceneNodes: snapshot.nodes,
        animationClips: snapshot.animations,
        selectedNodeId,
        viewportOverlay: null,
        environmentState: snapshot.environment ?? null,
        environmentDiagnostics: [],
        selectedTargets: [],
        topologyWarning: null,
        modelingSessions: {},
        pendingTransformPredictions: [],
        localPredictionLayer: new LocalPredictionLayer(),
        localPredictions: [],
      };
    }),

  applySceneDelta: (delta) =>
    set((state) => {
      const hasSameRevisionDiagnostics =
        delta.revision === state.sceneRevision &&
        Array.isArray(delta.environmentDiagnostics) &&
        delta.environmentDiagnostics.length > 0;
      if (
        delta.revision < state.sceneRevision ||
        (delta.revision === state.sceneRevision && !hasSameRevisionDiagnostics)
      ) {
        return {};
      }

      const transformByNodeId = new Map<string, TransformPatch>();
      for (const update of delta.updatedTransforms ?? []) {
        transformByNodeId.set(update.nodeId, update);
      }

      const visibilityByNodeId = new Map<string, VisibilityPatch>();
      for (const update of delta.updatedVisibility ?? []) {
        visibilityByNodeId.set(update.nodeId, update);
      }
      const lightByNodeId = new Map<string, LightPatch>();
      for (const update of delta.updatedLights ?? []) {
        lightByNodeId.set(update.nodeId, update);
      }
      const faceParams = { ...state.faceParams };
      const characterTopologyVersions = { ...state.characterTopologyVersions };
      const modelingSessions = { ...state.modelingSessions };
      for (const update of delta.updatedCharacterMorphWeights ?? []) {
        characterTopologyVersions[update.characterId] = update.topologyVersion;
        for (const weight of update.weights) {
          faceParams[weight.name] = weight.weight;
        }
      }
      for (const update of delta.updatedCharacterMaterials ?? []) {
        characterTopologyVersions[update.characterId] = update.topologyVersion;
      }
      for (const update of delta.updatedSkeletonPose ?? []) {
        characterTopologyVersions[update.characterId] = update.topologyVersion;
      }
      const topologyWarning =
        delta.topologyChanges?.find(
          (event) =>
            event.invalidatesMorphLibrary ||
            event.invalidatesSkinWeights ||
            event.invalidatesUv ||
            event.invalidatesBounds,
        )?.operationSummary ?? state.topologyWarning;
      for (const session of delta.modelingSessions ?? []) {
        modelingSessions[session.sessionId] = session;
      }

      const removedNodeIds = collectRemovedNodeIds(state.sceneNodes, delta.removedNodes ?? []);
      const sceneNodes = [...state.sceneNodes, ...(delta.addedNodes ?? []).map(sceneNodeFromPatch)]
        .filter((node) => !removedNodeIds.has(node.nodeId))
        .map((node) => {
          const transformUpdate = transformByNodeId.get(node.nodeId);
          const visibilityUpdate = visibilityByNodeId.get(node.nodeId);
          const lightUpdate = lightByNodeId.get(node.nodeId);
          if (!transformUpdate && !visibilityUpdate && !lightUpdate) {
            return node;
          }

          return {
            ...node,
            transform: transformUpdate
              ? {
                  ...node.transform,
                  position: transformUpdate.position ?? node.transform?.position,
                  rotation: transformUpdate.rotation ?? node.transform?.rotation,
                  scale: transformUpdate.scale ?? node.transform?.scale,
                }
              : node.transform,
            visible: visibilityUpdate?.visible ?? node.visible,
            layerMask: visibilityUpdate?.layerMask ?? node.layerMask,
            light: lightUpdate ?? node.light,
          };
        });

      const appliedSeq = delta.appliedSeq ?? 0;
      if (appliedSeq > 0) {
        state.localPredictionLayer.commitThrough(appliedSeq);
        state.localPredictionLayer.clearFinalized();
      }
      for (const event of delta.topologyChanges ?? []) {
        state.localPredictionLayer.invalidate({ topologyVersion: event.toVersion });
        state.localPredictionLayer.clearFinalized();
      }

      return {
        sceneRevision: delta.revision,
        sceneNodes,
        faceParams,
        characterTopologyVersions,
        modelingSessions,
        viewportOverlay: delta.overlay ?? state.viewportOverlay,
        environmentState:
          delta.environment === undefined ? state.environmentState : delta.environment,
        environmentDiagnostics: delta.environmentDiagnostics ?? state.environmentDiagnostics,
        selectedTargets:
          delta.selectedTargets ?? delta.overlay?.selectedTargets ?? state.selectedTargets,
        topologyWarning,
        localPredictions: state.localPredictionLayer.active(),
        pendingTransformPredictions:
          appliedSeq > 0
            ? state.pendingTransformPredictions.filter((prediction) => prediction.seq > appliedSeq)
            : state.pendingTransformPredictions,
        selectedNodeId:
          state.selectedNodeId && removedNodeIds.has(state.selectedNodeId)
            ? null
            : state.selectedNodeId,
      };
    }),

  selectNode: (id) => set({ selectedNodeId: id }),

  setSceneControlStatus: (status, error = null) =>
    set({
      sceneControlStatus: status,
      sceneControlError: error,
    }),

  allocateSceneCommandSeq: () => {
    const seq = get().nextSceneCommandSeq;
    set({ nextSceneCommandSeq: seq + 1 });
    return seq;
  },

  addTransformPrediction: (prediction) =>
    set((state) => ({
      pendingTransformPredictions: [
        ...state.pendingTransformPredictions.filter((item) => item.seq !== prediction.seq),
        prediction,
      ],
    })),

  commitTransformPrediction: (seq) =>
    set((state) => {
      const prediction = state.pendingTransformPredictions.find((item) => item.seq === seq);
      if (!prediction) return {};

      return {
        sceneNodes: applyPredictedTransform(state.sceneNodes, prediction),
        pendingTransformPredictions: state.pendingTransformPredictions.filter(
          (item) => item.seq !== seq,
        ),
      };
    }),

  commitPredictionsThrough: (appliedSeq) =>
    set((state) => {
      const toCommit = state.pendingTransformPredictions.filter(
        (prediction) => prediction.seq <= appliedSeq,
      );
      if (toCommit.length === 0) return {};

      return {
        sceneNodes: toCommit.reduce(applyPredictedTransform, state.sceneNodes),
        pendingTransformPredictions: state.pendingTransformPredictions.filter(
          (prediction) => prediction.seq > appliedSeq,
        ),
      };
    }),

  rollbackTransformPrediction: (seq) =>
    set((state) => ({
      pendingTransformPredictions: state.pendingTransformPredictions.filter(
        (prediction) => prediction.seq !== seq,
      ),
    })),

  createLocalPrediction: (prediction) => {
    const layer = get().localPredictionLayer;
    const created = layer.create(prediction);
    set({ localPredictions: layer.active() });
    return created;
  },

  commitLocalPredictionsThrough: (appliedSeq) =>
    set((state) => {
      state.localPredictionLayer.commitThrough(appliedSeq);
      state.localPredictionLayer.clearFinalized();
      return { localPredictions: state.localPredictionLayer.active() };
    }),

  rollbackLocalPrediction: (idOrSeq) =>
    set((state) => {
      state.localPredictionLayer.rollback(idOrSeq);
      state.localPredictionLayer.clearFinalized();
      state.authoringMetrics.incrementDroppedPrediction();
      return { localPredictions: state.localPredictionLayer.active() };
    }),

  timeoutLocalPredictions: (nowMs) =>
    set((state) => {
      state.localPredictionLayer.timeout(nowMs);
      state.localPredictionLayer.clearFinalized();
      state.authoringMetrics.incrementDroppedPrediction();
      return { localPredictions: state.localPredictionLayer.active() };
    }),

  invalidateLocalPredictions: (filter) =>
    set((state) => {
      state.localPredictionLayer.invalidate(filter);
      state.localPredictionLayer.clearFinalized();
      state.authoringMetrics.incrementDroppedPrediction();
      return { localPredictions: state.localPredictionLayer.active() };
    }),

  setViewportOverlay: (overlay) => set({ viewportOverlay: overlay }),

  recordAckLatency: (ms) =>
    set((state) => {
      state.authoringMetrics.recordAckLatency(ms);
      return { authoringMetricsSnapshot: state.authoringMetrics.snapshot() };
    }),

  recordPatchBytes: (bytes, atMs) =>
    set((state) => {
      state.authoringMetrics.recordPatchBytes(bytes, atMs);
      return { authoringMetricsSnapshot: state.authoringMetrics.snapshot(atMs) };
    }),

  recordGpuUpload: (ms) =>
    set((state) => {
      state.authoringMetrics.recordGpuUpload(ms);
      return { authoringMetricsSnapshot: state.authoringMetrics.snapshot() };
    }),

  recordRenderFrameMeta: (meta) =>
    set((state) => {
      const latencyMs = meta.durationUs > 0 ? meta.durationUs / 1000 : 0;
      state.authoringMetrics.recordFrameLatency(latencyMs);
      if (typeof meta.diagnostics?.gpuUploadTimeMs === 'number') {
        state.authoringMetrics.recordGpuUpload(meta.diagnostics.gpuUploadTimeMs);
      }
      return {
        lastRenderFrameMeta: meta,
        characterPreview: reconcilePreviewFrameMeta(state.characterPreview, meta),
        lookDev: reconcileLookDevFrameMeta(state.lookDev, meta),
        authoringMetricsSnapshot: state.authoringMetrics.snapshot(),
      };
    }),

  updateLastRenderFrameMeta: (meta) => set({ lastRenderFrameMeta: meta }),

  incrementDroppedPrediction: () =>
    set((state) => {
      state.authoringMetrics.incrementDroppedPrediction();
      return { authoringMetricsSnapshot: state.authoringMetrics.snapshot() };
    }),

  requestCharacterPreviewMode: (modeId) =>
    set((state) => ({
      characterPreview: {
        ...state.characterPreview,
        requestedMode: modeId,
        status: 'pending',
      },
    })),

  applyCharacterPreviewState: (previewState) =>
    set((state) => ({
      characterPreview: previewUiStateFromPayload(state.characterPreview, previewState),
    })),

  applyCharacterPreviewEvent: (event) =>
    set((state) => {
      if (isCharacterPreviewModeStatePayload(event.payload)) {
        return {
          characterPreview: previewUiStateFromPayload(state.characterPreview, event.payload),
        };
      }
      if (event.status === 'error') {
        return {
          characterPreview: {
            ...state.characterPreview,
            status: 'rejected',
            diagnostics: [
              {
                code:
                  event.error?.code === 'stale-revision'
                    ? 'stale-revision'
                    : 'scene-control-unavailable',
                severity: 'error',
                message: event.error?.message,
                retryable: event.error?.retryable,
              },
            ],
          },
        };
      }
      return {};
    }),

  requestLookDevMode: (mode) =>
    set((state) =>
      isLookDevModeSupported(state.lookDevCapabilities, mode)
        ? {
            lookDev: {
              requestedMode: mode,
              appliedMode: state.lookDev.appliedMode,
              status: 'requested',
              diagnostic: null,
            },
          }
        : {
            lookDev: {
              requestedMode: null,
              appliedMode: state.lookDev.appliedMode,
              status: 'unavailable',
              diagnostic: LOOKDEV_MODE_UNAVAILABLE_DIAGNOSTIC,
            },
          },
    ),

  markLookDevPending: (mode) =>
    set((state) =>
      isLookDevModeSupported(state.lookDevCapabilities, mode)
        ? {
            lookDev: {
              requestedMode: mode,
              appliedMode: state.lookDev.appliedMode,
              status: 'pending',
              diagnostic: null,
            },
          }
        : {
            lookDev: {
              requestedMode: null,
              appliedMode: state.lookDev.appliedMode,
              status: 'unavailable',
              diagnostic: LOOKDEV_MODE_UNAVAILABLE_DIAGNOSTIC,
            },
          },
    ),

  applyLookDevMode: (mode) =>
    set({
      lookDev: {
        requestedMode: null,
        appliedMode: mode,
        status: 'applied',
        diagnostic: null,
      },
    }),

  rejectLookDevMode: (message) =>
    set({
      lookDev: {
        requestedMode: null,
        appliedMode: get().lookDev.appliedMode,
        status: 'rejected',
        diagnostic: message,
      },
    }),

  timeoutLookDevMode: (message) =>
    set({
      lookDev: {
        requestedMode: get().lookDev.requestedMode,
        appliedMode: get().lookDev.appliedMode,
        status: 'timeout',
        diagnostic: message,
      },
    }),

  setLookDevCapabilities: (capabilities) =>
    set((state) => {
      const nextCapabilities = cloneLookDevCapabilities(capabilities);
      const appliedMode = isLookDevModeSupported(nextCapabilities, state.lookDev.appliedMode)
        ? state.lookDev.appliedMode
        : firstSupportedLookDevMode(nextCapabilities);
      const requestedMode =
        state.lookDev.requestedMode &&
        isLookDevModeSupported(nextCapabilities, state.lookDev.requestedMode)
          ? state.lookDev.requestedMode
          : null;
      const requestWasUnsupported = state.lookDev.requestedMode !== null && requestedMode === null;

      return {
        lookDevCapabilities: nextCapabilities,
        lookDev: {
          ...state.lookDev,
          requestedMode,
          appliedMode,
          status: requestWasUnsupported ? 'unavailable' : state.lookDev.status,
          diagnostic: requestWasUnsupported
            ? LOOKDEV_MODE_UNAVAILABLE_DIAGNOSTIC
            : state.lookDev.diagnostic,
        },
      };
    }),

  setSelectionWorkflow: (workflow) => set({ selectionWorkflow: workflow }),

  // Animation actions
  setAnimationClips: (clips) => set({ animationClips: clips }),

  setActiveAnimation: (name, playbackState) =>
    set({ activeAnimation: name, playbackState: playbackState ?? (name ? 'paused' : 'stopped') }),

  setRootMotion: (enabled, rootNodeId) =>
    set({ rootMotionEnabled: enabled, rootMotionNodeId: rootNodeId }),

  play: () => set({ playbackState: 'playing' }),

  pause: () => set({ playbackState: 'paused' }),

  stop: () => set({ playbackState: 'stopped', activeAnimation: null }),

  // Transform actions
  setTransformMode: (mode) => set({ transformMode: mode }),

  // Engine preview actions
  setLoading: (loading) => set({ isLoading: loading }),

  setQualityPreview: (dataUrl) => set({ qualityPreviewDataUrl: dataUrl }),

  setEnvironmentPlacement: (placement) => set({ environmentPlacement: placement }),

  // Bulk update: update a single node's transform in the scene graph
  updateNodeTransform: (nodeId, position, rotation, scale) =>
    set((state) => ({
      sceneNodes: state.sceneNodes.map((node) =>
        node.nodeId === nodeId
          ? {
              ...node,
              transform: {
                ...node.transform,
                position: position ?? node.transform?.position,
                rotation: rotation ?? node.transform?.rotation,
                scale: scale ?? node.transform?.scale,
              },
            }
          : node,
      ),
    })),

  // Face Editor actions
  setFaceParam: (name, value) =>
    set((state) => ({
      faceParams: { ...state.faceParams, [name]: value },
    })),

  setFaceParams: (params, options) =>
    set((state) => ({
      faceParams: options?.replace === true ? params : { ...state.faceParams, ...params },
    })),

  resetFaceParams: () => set({ faceParams: {} }),

  randomizeFaceParams: () =>
    set((state) => {
      const randomized: Record<string, number> = {};
      // Randomize all existing params
      for (const key of Object.keys(state.faceParams)) {
        randomized[key] = Math.random();
      }
      return { faceParams: randomized };
    }),

  toggleFaceEditor: () => set((state) => ({ isFaceEditorOpen: !state.isFaceEditorOpen })),

  toggleLatencyTester: () => set((state) => ({ isLatencyTesterOpen: !state.isLatencyTesterOpen })),

  setVRMLoaded: (loaded) => set({ isVRMLoaded: loaded }),

  toggleExpressionPreset: () =>
    set((state) => ({ isExpressionPresetOpen: !state.isExpressionPresetOpen })),

  toggleBoneExpression: () =>
    set((state) => ({ isBoneExpressionOpen: !state.isBoneExpressionOpen })),

  toggleCsgPanel: () => set((state) => ({ isCsgPanelOpen: !state.isCsgPanelOpen })),

  toggleTextEditor: () => set((state) => ({ isTextEditorOpen: !state.isTextEditorOpen })),

  toggleShapeCreator: () => set((state) => ({ isShapeCreatorOpen: !state.isShapeCreatorOpen })),

  toggleSculptBrush: () => set((state) => ({ isSculptBrushOpen: !state.isSculptBrushOpen })),

  setCsgOperand: (slot, nodeId) =>
    set(slot === 'A' ? { csgOperandA: nodeId } : { csgOperandB: nodeId }),

  // Keyframe Editor actions
  setKeyframeTracks: (tracks) => set({ keyframeTracks: tracks }),

  selectKeyframe: (id, multi) =>
    set((state) => {
      const next = new Set(multi ? state.selectedKeyframeIds : []);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedKeyframeIds: next };
    }),

  clearKeyframeSelection: () => set({ selectedKeyframeIds: new Set<string>() }),

  toggleKeyframeEditor: () =>
    set((state) => ({ isKeyframeEditorOpen: !state.isKeyframeEditorOpen })),

  setCurrentTimeMs: (timeMs) => set({ currentTimeMs: timeMs }),

  // Camera actions
  orbitCamera: (deltaTheta, deltaPhi) =>
    set((state) => ({
      cameraTheta: state.cameraTheta + deltaTheta,
      cameraPhi: Math.max(0.05, Math.min(Math.PI - 0.05, state.cameraPhi + deltaPhi)),
    })),

  panCamera: (dx, dy) =>
    set((state) => {
      const position = cameraPositionFromState(state);
      const forward = normalizeVec3(subVec3(state.cameraTarget, position));
      const right = normalizeVec3(crossVec3(forward, [0, 1, 0]));
      const up = normalizeVec3(crossVec3(right, forward));
      const offset = addVec3(scaleVec3(right, -dx), scaleVec3(up, dy));
      const [tx, ty, tz] = addVec3(state.cameraTarget, offset);
      return {
        cameraTarget: [tx, ty, tz],
      };
    }),

  zoomCamera: (deltaRadius) =>
    set((state) => ({
      cameraRadius: clampNumber(
        state.cameraRadius + deltaRadius,
        MIN_CAMERA_RADIUS,
        MAX_CAMERA_RADIUS,
      ),
    })),

  resetCamera: () =>
    set({
      cameraTheta: DEFAULT_CAMERA_THETA,
      cameraPhi: DEFAULT_CAMERA_PHI,
      cameraRadius: DEFAULT_CAMERA_RADIUS,
      cameraTarget: defaultCameraTarget(),
    }),

  setViewportGridVisible: (visible) => set({ showViewportGrid: visible }),

  toggleViewportGrid: () => set((state) => ({ showViewportGrid: !state.showViewportGrid })),

  setPerformanceMetricsVisible: (visible) => set({ isPerformanceMetricsVisible: visible }),

  togglePerformanceMetrics: () =>
    set((state) => ({ isPerformanceMetricsVisible: !state.isPerformanceMetricsVisible })),

  frameSceneCamera: (snapshot) => {
    const signature = sceneFrameSignature(snapshot);
    if (!signature || signature === get().lastAutoFramedSceneSignature) {
      return false;
    }

    const cameraFrame =
      cameraFrameFromActiveCamera(snapshot.activeCamera) ??
      cameraFrameFromSceneNodes(snapshot.nodes);
    if (!cameraFrame) {
      set({ lastAutoFramedSceneSignature: signature });
      return false;
    }

    set({
      ...cameraFrame,
      lastAutoFramedSceneSignature: signature,
    });
    return true;
  },

  markSceneCameraFramed: (snapshot) => {
    const signature = sceneFrameSignature(snapshot);
    if (signature) {
      set({ lastAutoFramedSceneSignature: signature });
    }
  },

  getCameraPosition: () => {
    return cameraPositionFromState(get());
  },

  // Project actions
  getEditorState: () => {
    const s = get();
    return {
      selectedNodeId: s.selectedNodeId,
      transformMode: s.transformMode,
      isFaceEditorOpen: s.isFaceEditorOpen,
      isBoneExpressionOpen: s.isBoneExpressionOpen,
      isCsgPanelOpen: s.isCsgPanelOpen,
      isTextEditorOpen: s.isTextEditorOpen,
      isShapeCreatorOpen: s.isShapeCreatorOpen,
      isSculptBrushOpen: s.isSculptBrushOpen,
      faceParams: s.faceParams,
      keyframeTracks: s.keyframeTracks,
      currentTimeMs: s.currentTimeMs,
      environmentPlacement: s.environmentPlacement,
      isKeyframeEditorOpen: s.isKeyframeEditorOpen,
      rootMotionEnabled: s.rootMotionEnabled,
      rootMotionNodeId: s.rootMotionNodeId,
      cameraTheta: s.cameraTheta,
      cameraPhi: s.cameraPhi,
      cameraRadius: s.cameraRadius,
      cameraTarget: s.cameraTarget,
      showViewportGrid: s.showViewportGrid,
      isPerformanceMetricsVisible: s.isPerformanceMetricsVisible,
    };
  },

  restoreEditorState: (state) =>
    set({
      selectedNodeId: (state['selectedNodeId'] as string | null) ?? null,
      transformMode: (state['transformMode'] as ModelState['transformMode']) ?? 'translate',
      isFaceEditorOpen: (state['isFaceEditorOpen'] as boolean) ?? false,
      isBoneExpressionOpen: (state['isBoneExpressionOpen'] as boolean) ?? false,
      isCsgPanelOpen: (state['isCsgPanelOpen'] as boolean) ?? false,
      isTextEditorOpen: (state['isTextEditorOpen'] as boolean) ?? false,
      isShapeCreatorOpen: (state['isShapeCreatorOpen'] as boolean) ?? false,
      isSculptBrushOpen: (state['isSculptBrushOpen'] as boolean) ?? false,
      faceParams: (state['faceParams'] as Record<string, number>) ?? {},
      keyframeTracks: (state['keyframeTracks'] as EditorKeyframeTrack[]) ?? [],
      currentTimeMs: (state['currentTimeMs'] as number) ?? 0,
      environmentPlacement:
        parseEnvironmentPlacementState(state['environmentPlacement']) ?? get().environmentPlacement,
      isKeyframeEditorOpen: (state['isKeyframeEditorOpen'] as boolean) ?? false,
      rootMotionEnabled: (state['rootMotionEnabled'] as boolean | undefined) ?? true,
      rootMotionNodeId: (state['rootMotionNodeId'] as string | null | undefined) ?? null,
      cameraTheta: (state['cameraTheta'] as number) ?? 0,
      cameraPhi: (state['cameraPhi'] as number) ?? Math.PI / 4,
      cameraRadius: clampNumber(
        (state['cameraRadius'] as number) ?? DEFAULT_CAMERA_RADIUS,
        MIN_CAMERA_RADIUS,
        MAX_CAMERA_RADIUS,
      ),
      cameraTarget: vec3FromValue(state['cameraTarget']) ?? defaultCameraTarget(),
      showViewportGrid: (state['showViewportGrid'] as boolean | undefined) ?? true,
      isPerformanceMetricsVisible:
        typeof state['isPerformanceMetricsVisible'] === 'boolean'
          ? state['isPerformanceMetricsVisible']
          : false,
    }),
}));

function cloneLookDevCapabilities(
  capabilities: ModelLookDevSceneControlCapabilities,
): ModelLookDevSceneControlCapabilities {
  return {
    ...capabilities,
    renderModes: [...capabilities.renderModes],
  };
}

function isLookDevModeSupported(
  capabilities: ModelLookDevSceneControlCapabilities,
  mode: ViewportRenderMode,
): boolean {
  return capabilities.renderModes.includes(mode) && (mode !== 'clay' || capabilities.clay);
}

function firstSupportedLookDevMode(
  capabilities: ModelLookDevSceneControlCapabilities,
): ViewportRenderMode {
  return isLookDevModeSupported(capabilities, 'pbr')
    ? 'pbr'
    : (capabilities.renderModes.find((mode) => isLookDevModeSupported(capabilities, mode)) ??
        'pbr');
}

function cameraPositionFromState(
  state: Pick<ModelState, 'cameraTheta' | 'cameraPhi' | 'cameraRadius' | 'cameraTarget'>,
): Vec3 {
  const { cameraTheta, cameraPhi, cameraRadius, cameraTarget } = state;
  return [
    cameraTarget[0] + cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta),
    cameraTarget[1] + cameraRadius * Math.cos(cameraPhi),
    cameraTarget[2] + cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta),
  ];
}

function defaultCameraTarget(): Vec3 {
  return [...DEFAULT_CAMERA_TARGET];
}

function sceneFrameSignature(snapshot: SceneSnapshot): string | null {
  const renderNodes = snapshot.nodes.filter(isRenderableNode);
  if (renderNodes.length === 0) return null;
  return [
    snapshot.sceneId,
    snapshot.nodes.length,
    snapshot.nodes
      .map((node) => {
        const position = vec3FromValue(node.transform?.position) ?? [0, 0, 0];
        const scale = vec3FromValue(node.transform?.scale) ?? [1, 1, 1];
        return [
          node.nodeId,
          node.parentId ?? '',
          node.kind ?? '',
          formatVec3Signature(position),
          formatVec3Signature(scale),
        ].join(':');
      })
      .join('|'),
  ].join('#');
}

function cameraFrameFromActiveCamera(
  camera: SceneSnapshot['activeCamera'],
): CameraStatePatch | null {
  const position = vec3FromValue(camera?.position);
  const target = vec3FromValue(camera?.target);
  if (!position || !target) return null;
  return cameraFrameFromPositionTarget(position, target);
}

function cameraFrameFromSceneNodes(nodes: readonly SceneNodeSnapshot[]): CameraStatePatch | null {
  const bounds = computeSceneBounds(nodes);
  if (!bounds) return null;

  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const diagonal = lengthVec3(subVec3(bounds.max, bounds.min));
  const fitRadius =
    diagonal > EPSILON
      ? (diagonal * 0.5 * CAMERA_FIT_PADDING) / Math.tan(EDITOR_CAMERA_FOV_RAD / 2)
      : MIN_FRAME_CAMERA_RADIUS;

  return {
    cameraTheta: DEFAULT_CAMERA_THETA,
    cameraPhi: DEFAULT_CAMERA_PHI,
    cameraRadius: clampNumber(
      Math.max(MIN_FRAME_CAMERA_RADIUS, fitRadius),
      MIN_CAMERA_RADIUS,
      MAX_CAMERA_RADIUS,
    ),
    cameraTarget: center,
  };
}

function computeSceneBounds(nodes: readonly SceneNodeSnapshot[]): SceneBounds | null {
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));
  const frameCache = new Map<string, NodeWorldFrame>();
  let bounds: SceneBounds | null = null;

  for (const node of nodes) {
    if (!isRenderableNode(node)) continue;
    const nodeBounds =
      boundsFromSnapshotNode(node) ?? boundsFromNodeFrame(node, nodeMap, frameCache);
    bounds = bounds ? mergeBounds(bounds, nodeBounds) : nodeBounds;
  }

  return bounds;
}

function boundsFromSnapshotNode(node: SceneNodeSnapshot): SceneBounds | null {
  const value: unknown = node;
  if (!isRecord(value)) return null;

  for (const key of ['worldBounds', 'bounds']) {
    const boundsValue = value[key];
    if (!isRecord(boundsValue)) continue;
    const min = vec3FromValue(boundsValue['min']);
    const max = vec3FromValue(boundsValue['max']);
    if (min && max) {
      return normalizeBounds({ min, max });
    }
  }

  return null;
}

function boundsFromNodeFrame(
  node: SceneNodeSnapshot,
  nodeMap: ReadonlyMap<string, SceneNodeSnapshot>,
  frameCache: Map<string, NodeWorldFrame>,
): SceneBounds {
  const frame = resolveNodeWorldFrame(node, nodeMap, frameCache);
  const half: Vec3 = [
    Math.max(Math.abs(frame.scale[0]), MIN_NODE_EXTENT) * 0.5,
    Math.max(Math.abs(frame.scale[1]), MIN_NODE_EXTENT) * 0.5,
    Math.max(Math.abs(frame.scale[2]), MIN_NODE_EXTENT) * 0.5,
  ];
  return {
    min: subVec3(frame.position, half),
    max: addVec3(frame.position, half),
  };
}

function resolveNodeWorldFrame(
  node: SceneNodeSnapshot,
  nodeMap: ReadonlyMap<string, SceneNodeSnapshot>,
  frameCache: Map<string, NodeWorldFrame>,
): NodeWorldFrame {
  const cached = frameCache.get(node.nodeId);
  if (cached) return cached;

  const localPosition = vec3FromValue(node.transform?.position) ?? [0, 0, 0];
  const localScale = vec3FromValue(node.transform?.scale) ?? [1, 1, 1];
  const parent = node.parentId ? nodeMap.get(node.parentId) : undefined;
  if (!parent) {
    const frame = { position: localPosition, scale: localScale };
    frameCache.set(node.nodeId, frame);
    return frame;
  }

  const parentFrame = resolveNodeWorldFrame(parent, nodeMap, frameCache);
  const frame = {
    position: addVec3(parentFrame.position, mulVec3(localPosition, parentFrame.scale)),
    scale: mulVec3(parentFrame.scale, localScale),
  };
  frameCache.set(node.nodeId, frame);
  return frame;
}

function cameraFrameFromPositionTarget(position: Vec3, target: Vec3): CameraStatePatch | null {
  const offset = subVec3(position, target);
  const radius = lengthVec3(offset);
  if (radius < EPSILON) return null;
  return {
    cameraTheta: Math.atan2(offset[0], offset[2]),
    cameraPhi: clampNumber(Math.acos(clampNumber(offset[1] / radius, -1, 1)), 0.05, Math.PI - 0.05),
    cameraRadius: clampNumber(radius, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS),
    cameraTarget: target,
  };
}

function mergeBounds(a: SceneBounds, b: SceneBounds): SceneBounds {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

function normalizeBounds(bounds: SceneBounds): SceneBounds {
  return {
    min: [
      Math.min(bounds.min[0], bounds.max[0]),
      Math.min(bounds.min[1], bounds.max[1]),
      Math.min(bounds.min[2], bounds.max[2]),
    ],
    max: [
      Math.max(bounds.min[0], bounds.max[0]),
      Math.max(bounds.min[1], bounds.max[1]),
      Math.max(bounds.min[2], bounds.max[2]),
    ],
  };
}

function isRenderableNode(node: SceneNodeSnapshot): boolean {
  if (node.visible === false) return false;
  return node.kind === 'mesh' || Boolean(node.mesh);
}

function vec3FromValue(value: unknown): Vec3 | null {
  if (Array.isArray(value)) {
    const x = finiteNumber(value[0]);
    const y = finiteNumber(value[1]);
    const z = finiteNumber(value[2]);
    return x === null || y === null || z === null ? null : [x, y, z];
  }
  if (!isRecord(value)) return null;
  const x = finiteNumber(value['x']);
  const y = finiteNumber(value['y']);
  const z = finiteNumber(value['z']);
  return x === null || y === null || z === null ? null : [x, y, z];
}

function formatVec3Signature(value: Vec3): string {
  return value.map((component) => component.toFixed(4)).join(',');
}

function lengthVec3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec3(v: Vec3, scale: number): Vec3 {
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function mulVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalizeVec3(v: Vec3): Vec3 {
  const length = lengthVec3(v);
  if (length < EPSILON) return [0, 0, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseEnvironmentPlacementState(value: unknown): EnvironmentPlacement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const mode = record['mode'];
  if (mode !== 'skybox' && mode !== 'ibl' && mode !== 'background-and-ibl') return null;
  const sourceAssetId = record['sourceAssetId'];
  const sourceUri = record['sourceUri'];
  const rotationDeg = finiteNumber(record['rotationDeg']);
  const intensity = finiteNumber(record['intensity']);
  const exposure = finiteNumber(record['exposure']);
  const visibleAsBackground = record['visibleAsBackground'];
  if (
    typeof sourceAssetId !== 'string' ||
    rotationDeg === null ||
    intensity === null ||
    exposure === null ||
    typeof visibleAsBackground !== 'boolean'
  ) {
    return null;
  }
  return {
    sourceAssetId,
    sourceUri: typeof sourceUri === 'string' ? sourceUri : undefined,
    mode,
    rotationDeg,
    intensity,
    exposure,
    visibleAsBackground,
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function previewUiStateFromPayload(
  current: CharacterPreviewUiState,
  previewState: CharacterPreviewModeStatePayload,
): CharacterPreviewUiState {
  return {
    requestedMode: previewState.modeId,
    appliedMode: previewState.status === 'applied' ? previewState.modeId : current.appliedMode,
    status:
      previewState.status === 'applied'
        ? 'applied'
        : previewState.status === 'rejected'
          ? 'rejected'
          : previewState.status === 'unavailable'
            ? 'unavailable'
            : 'pending',
    state: previewState,
    diagnostics: previewState.diagnostics,
  };
}

function reconcilePreviewFrameMeta(
  current: CharacterPreviewUiState,
  meta: RenderFrameMeta,
): CharacterPreviewUiState {
  const mode = meta.activePreviewMode;
  if (mode !== 'face' && mode !== 'full-body' && mode !== 'motion' && mode !== 'voice-pack') {
    return current;
  }
  if (current.requestedMode !== mode && current.appliedMode !== mode) {
    return current;
  }
  return {
    ...current,
    appliedMode: mode,
    status: current.status === 'pending' ? 'applied' : current.status,
    state: current.state
      ? {
          ...current.state,
          status: 'applied',
          sceneRevision: meta.sceneRevision,
          appliedSeq: meta.appliedSeq,
          playback:
            typeof meta.previewPlaybackClockMs === 'number'
              ? { ...current.state.playback, clockMs: meta.previewPlaybackClockMs }
              : current.state.playback,
        }
      : current.state,
  };
}

function reconcileLookDevFrameMeta(current: LookDevUiState, meta: RenderFrameMeta): LookDevUiState {
  const mode = readLookDevModeFromFrameMeta(meta);
  if (!mode) {
    return current;
  }
  if (current.requestedMode !== mode && current.appliedMode !== mode) {
    return current;
  }
  return {
    requestedMode: null,
    appliedMode: mode,
    status: 'applied',
    diagnostic: null,
  };
}

function readLookDevModeFromFrameMeta(meta: RenderFrameMeta): ViewportRenderMode | null {
  const value: unknown = meta;
  if (!isRecord(value)) return null;
  const mode =
    readViewportRenderMode(value['renderMode']) ??
    (isRecord(value['lookdev']) ? readViewportRenderMode(value['lookdev']['renderMode']) : null);
  if (mode) return mode;
  const diagnostics = value['diagnostics'];
  return isRecord(diagnostics) ? readViewportRenderMode(diagnostics['renderMode']) : null;
}

function readViewportRenderMode(value: unknown): ViewportRenderMode | null {
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
      return null;
  }
}

function collectRemovedNodeIds(
  nodes: readonly SceneNodeSnapshot[],
  removedNodeIds: readonly string[],
): Set<string> {
  const removed = new Set(removedNodeIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && removed.has(node.parentId) && !removed.has(node.nodeId)) {
        removed.add(node.nodeId);
        changed = true;
      }
    }
  }

  return removed;
}

function sceneNodeFromPatch(patch: SceneNodePatch): SceneNodeSnapshot {
  return {
    nodeId: patch.nodeId,
    parentId: patch.parentId,
    name: patch.name ?? patch.nodeId,
    transform: {
      position: patch.transform?.position ?? { x: 0, y: 0, z: 0 },
      rotation: patch.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
      scale: patch.transform?.scale ?? { x: 1, y: 1, z: 1 },
    },
    children: patch.children ?? [],
    visible: patch.visible ?? true,
    kind: patch.kind,
  };
}

function applyPredictedTransform(
  nodes: SceneNodeSnapshot[],
  prediction: PendingTransformPrediction,
): SceneNodeSnapshot[] {
  return nodes.map((node) =>
    node.nodeId === prediction.nodeId
      ? {
          ...node,
          transform: {
            ...node.transform,
            position: prediction.position ?? node.transform?.position,
            rotation: prediction.rotation ?? node.transform?.rotation,
            scale: prediction.scale ?? node.transform?.scale,
          },
        }
      : node,
  );
}
