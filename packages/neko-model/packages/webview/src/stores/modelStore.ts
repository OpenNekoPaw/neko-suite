/**
 * Zustand store for 3D Model Editor state management.
 *
 * Manages scene graph, selection, animation playback, and transform mode.
 */

import { create } from 'zustand';
import type { SceneNodeSnapshot, AnimationClipInfo, PlaybackState, TransformMode } from '../types';

export interface ModelState {
  // Scene
  sceneNodes: SceneNodeSnapshot[];
  selectedNodeId: string | null;

  // Animation
  animationClips: AnimationClipInfo[];
  activeAnimation: string | null;
  playbackState: PlaybackState;

  // Transform
  transformMode: TransformMode;

  // Model loading
  modelUrl: string | null;
  isLoading: boolean;

  // Face Editor
  faceParams: Record<string, number>;
  isFaceEditorOpen: boolean;

  // Latency Tester
  isLatencyTesterOpen: boolean;

  // VRM Expression Presets
  isVRMLoaded: boolean;
  isExpressionPresetOpen: boolean;

  // Actions — Scene
  setSceneNodes: (nodes: SceneNodeSnapshot[]) => void;
  selectNode: (id: string | null) => void;

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

  // Actions — Bulk update
  updateNodeTransform: (
    nodeId: string,
    position: [number, number, number],
    rotation: [number, number, number, number],
    scale: [number, number, number],
  ) => void;

  // Actions — Face Editor
  setFaceParam: (name: string, value: number) => void;
  setFaceParams: (params: Record<string, number>) => void;
  resetFaceParams: () => void;
  randomizeFaceParams: () => void;
  toggleFaceEditor: () => void;

  // Actions — Latency Tester
  toggleLatencyTester: () => void;

  // Actions — VRM Expression Presets
  setVRMLoaded: (loaded: boolean) => void;
  toggleExpressionPreset: () => void;
}

export const useModelStore = create<ModelState>((set) => ({
  // Initial state
  sceneNodes: [],
  selectedNodeId: null,
  animationClips: [],
  activeAnimation: null,
  playbackState: 'stopped',
  transformMode: 'translate',
  modelUrl: null,
  isLoading: false,
  faceParams: {},
  isFaceEditorOpen: false,
  isLatencyTesterOpen: false,
  isVRMLoaded: false,
  isExpressionPresetOpen: false,

  // Scene actions
  setSceneNodes: (nodes) => set({ sceneNodes: nodes }),

  selectNode: (id) => set({ selectedNodeId: id }),

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
  setModelUrl: (url) => set({ modelUrl: url }),

  setLoading: (loading) => set({ isLoading: loading }),

  // Bulk update: update a single node's transform in the scene graph
  updateNodeTransform: (nodeId, position, rotation, scale) =>
    set((state) => ({
      sceneNodes: state.sceneNodes.map((node) =>
        node.id === nodeId ? { ...node, position, rotation, scale } : node,
      ),
    })),

  // Face Editor actions
  setFaceParam: (name, value) =>
    set((state) => ({
      faceParams: { ...state.faceParams, [name]: value },
    })),

  setFaceParams: (params) => set({ faceParams: params }),

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
}));
