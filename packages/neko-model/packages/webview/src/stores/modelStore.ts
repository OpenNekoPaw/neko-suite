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
import type { EnvironmentPlacement, RenderFrameMeta } from '@neko/shared';
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
type ViewportOverlayPatch = NonNullable<SceneDelta['overlay']>;
type ModelingSessionState = NonNullable<SceneDelta['modelingSessions']>[number];
type SceneControlStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

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

  // Animation
  animationClips: AnimationClipInfo[];
  activeAnimation: string | null;
  playbackState: PlaybackState;

  // Transform
  transformMode: TransformMode;

  // Model loading
  modelUrl: string | null;
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
  cameraTarget: [number, number, number];

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
  recordAckLatency: (ms: number) => void;
  recordPatchBytes: (bytes: number, atMs?: number) => void;
  recordGpuUpload: (ms: number) => void;
  recordRenderFrameMeta: (meta: RenderFrameMeta) => void;
  incrementDroppedPrediction: () => void;

  // Actions — Animation
  setAnimationClips: (clips: AnimationClipInfo[]) => void;
  setActiveAnimation: (name: string | null) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;

  // Actions — Transform
  setTransformMode: (mode: TransformMode) => void;

  // Actions — Model
  setModelUrl: (url: string | null) => void;
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
  getCameraPosition: () => [number, number, number];

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
  animationClips: [],
  activeAnimation: null,
  playbackState: 'stopped',
  transformMode: 'translate',
  modelUrl: null,
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
  cameraTheta: 0,
  cameraPhi: Math.PI / 4,
  cameraRadius: 5,
  cameraTarget: [0, 0.9, 0],
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
        topologyWarning: null,
        modelingSessions: {},
      };
    }),

  applySceneDelta: (delta) =>
    set((state) => {
      if (delta.revision <= state.sceneRevision) {
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
      const sceneNodes = state.sceneNodes
        .filter((node) => !removedNodeIds.has(node.nodeId))
        .map((node) => {
          const transformUpdate = transformByNodeId.get(node.nodeId);
          const visibilityUpdate = visibilityByNodeId.get(node.nodeId);
          if (!transformUpdate && !visibilityUpdate) {
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
        authoringMetricsSnapshot: state.authoringMetrics.snapshot(),
      };
    }),

  incrementDroppedPrediction: () =>
    set((state) => {
      state.authoringMetrics.incrementDroppedPrediction();
      return { authoringMetricsSnapshot: state.authoringMetrics.snapshot() };
    }),

  // Animation actions
  setAnimationClips: (clips) => set({ animationClips: clips }),

  setActiveAnimation: (name) =>
    set({ activeAnimation: name, playbackState: name ? 'paused' : 'stopped' }),

  play: () => set({ playbackState: 'playing' }),

  pause: () => set({ playbackState: 'paused' }),

  stop: () => set({ playbackState: 'stopped', activeAnimation: null }),

  // Transform actions
  setTransformMode: (mode) => set({ transformMode: mode }),

  // Model actions
  setModelUrl: (url) => set({ modelUrl: url, qualityPreviewDataUrl: null }),

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
      const theta = state.cameraTheta;
      const rightX = Math.cos(theta);
      const rightZ = -Math.sin(theta);
      const [tx, ty, tz] = state.cameraTarget;
      return {
        cameraTarget: [tx - dx * rightX, ty + dy, tz - dx * rightZ] as [number, number, number],
      };
    }),

  zoomCamera: (deltaRadius) =>
    set((state) => ({
      cameraRadius: Math.max(0.5, Math.min(50, state.cameraRadius + deltaRadius)),
    })),

  resetCamera: () =>
    set({ cameraTheta: 0, cameraPhi: Math.PI / 4, cameraRadius: 5, cameraTarget: [0, 0.9, 0] }),

  getCameraPosition: () => {
    const { cameraTheta, cameraPhi, cameraRadius, cameraTarget } = get();
    return [
      cameraTarget[0] + cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta),
      cameraTarget[1] + cameraRadius * Math.cos(cameraPhi),
      cameraTarget[2] + cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta),
    ] as [number, number, number];
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
      cameraTheta: s.cameraTheta,
      cameraPhi: s.cameraPhi,
      cameraRadius: s.cameraRadius,
      cameraTarget: s.cameraTarget,
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
      cameraTheta: (state['cameraTheta'] as number) ?? 0,
      cameraPhi: (state['cameraPhi'] as number) ?? Math.PI / 4,
      cameraRadius: (state['cameraRadius'] as number) ?? 5,
      cameraTarget: (state['cameraTarget'] as [number, number, number]) ?? [0, 0.9, 0],
    }),
}));

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
