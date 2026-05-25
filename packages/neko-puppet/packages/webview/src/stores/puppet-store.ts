/**
 * Puppet Store - standalone Zustand store for puppet editor state
 *
 * Manages puppet loading (INP/MOC3), parameter control, and playback state.
 * Separated from the sketch store to keep the puppet editor independent.
 */
import { create } from 'zustand';
import type {
  AnimationClipInfo,
  DeformedMesh,
  NativeBlendShapeInfo,
  ParameterInfo,
  PuppetSnapshot,
} from '../animation/types';
import type { EditorKeyframeTrack, NkpControlDriver } from '@neko/shared';

export type AnimationPlayState = 'idle' | 'playing' | 'paused';

export interface PuppetStore {
  // ── Puppet state ─────────────────────────────────────────────────────────
  puppetLoaded: boolean;
  puppetSnapshot: PuppetSnapshot | null;
  puppetParameters: ParameterInfo[];
  deformedMeshes: DeformedMesh[];
  nativeBlendShapes: NativeBlendShapeInfo[];
  nativeControlDrivers: readonly NkpControlDriver[];
  selectedNativeBoneId: string | null;
  nativeRevision: number;
  nativeSeq: number;
  pendingNativeCommandIds: Set<string>;
  isPlayingPhysics: boolean;
  /** Whether the .nkp has no puppet.src linked (shows import UI) */
  noPuppetSource: boolean;
  /** Last load failure, shown instead of leaving the editor in an endless loading state. */
  loadError: string | null;
  /** Decoded texture images from INP TEX_SECT */
  textures: ImageBitmap[];
  /** Canvas viewport (zoom + pan) */
  viewport: { zoom: number; panX: number; panY: number };

  // ── Animation clip state ─────────────────────────────────────────────────
  /** All available animation clips from the loaded puppet */
  animations: AnimationClipInfo[];
  /** Name of the currently selected/playing clip (null = none) */
  currentAnimation: string | null;
  /** Current playback state */
  playState: AnimationPlayState;
  /** Whether the WebSocket stream to the engine is active */
  streamConnected: boolean;
  /** Last decoded H.264 puppet preview frame, when hardware preview is active */
  previewFrame: VideoFrame | null;
  /** Current animation elapsed time in ms (from stream delta) */
  animationTimeMs: number;

  // ── Keyframe editor state ────────────────────────────────────────────────
  /** Keyframe tracks for the current animation clip */
  keyframeTracks: EditorKeyframeTrack[];
  /** Currently selected keyframe IDs in the mini-timeline */
  selectedKeyframeIds: Set<string>;
  /** Whether the bottom keyframe editor panel is open */
  isKeyframeEditorOpen: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────
  setPuppetLoaded: (loaded: boolean) => void;
  setPuppetSnapshot: (snapshot: PuppetSnapshot | null) => void;
  setPuppetParameters: (params: ParameterInfo[]) => void;
  setDeformedMeshes: (meshes: DeformedMesh[]) => void;
  setNativeBlendShapes: (blendShapes: NativeBlendShapeInfo[]) => void;
  setNativeControlDrivers: (drivers: readonly NkpControlDriver[]) => void;
  updateNativeBlendShapeWeight: (name: string, weight: number) => void;
  updateNativeTrackingInputValue: (name: string, value: number) => void;
  setSelectedNativeBoneId: (boneId: string | null) => void;
  setNativeRevision: (revision: number) => void;
  nextNativeSeq: () => number;
  addPendingNativeCommand: (id: string) => void;
  removePendingNativeCommand: (id: string) => void;
  updateParameterValue: (name: string, value: number) => void;
  setPlayingPhysics: (playing: boolean) => void;
  setNoPuppetSource: (noPuppetSource: boolean) => void;
  setLoadError: (message: string | null) => void;
  setTextures: (textures: ImageBitmap[]) => void;
  setViewport: (viewport: { zoom: number; panX: number; panY: number }) => void;

  setAnimations: (clips: AnimationClipInfo[]) => void;
  setCurrentAnimation: (name: string | null) => void;
  setPlayState: (state: AnimationPlayState) => void;
  setStreamConnected: (connected: boolean) => void;
  setPreviewFrame: (frame: VideoFrame | null) => void;
  setAnimationTimeMs: (timeMs: number) => void;

  setKeyframeTracks: (tracks: EditorKeyframeTrack[]) => void;
  setSelectedKeyframeIds: (ids: Set<string>) => void;
  toggleKeyframeEditor: () => void;

  resetAnimation: () => void;
}

export const usePuppetStore = create<PuppetStore>()((set, get) => ({
  // ── Puppet state ─────────────────────────────────────────────────────────
  puppetLoaded: false,
  puppetSnapshot: null,
  puppetParameters: [],
  deformedMeshes: [],
  nativeBlendShapes: [],
  nativeControlDrivers: [],
  selectedNativeBoneId: null,
  nativeRevision: 0,
  nativeSeq: 1,
  pendingNativeCommandIds: new Set<string>(),
  isPlayingPhysics: false,
  noPuppetSource: false,
  loadError: null,
  textures: [],
  viewport: { zoom: 2, panX: 0, panY: 0 },

  // ── Animation clip state ─────────────────────────────────────────────────
  animations: [],
  currentAnimation: null,
  playState: 'idle',
  streamConnected: false,
  previewFrame: null,
  animationTimeMs: 0,

  // ── Keyframe editor state ────────────────────────────────────────────────
  keyframeTracks: [],
  selectedKeyframeIds: new Set<string>(),
  isKeyframeEditorOpen: false,

  // ── Actions ───────────────────────────────────────────────────────────────
  setPuppetLoaded: (loaded) => set({ puppetLoaded: loaded }),
  setPuppetSnapshot: (snapshot) => set({ puppetSnapshot: snapshot }),
  setPuppetParameters: (params) => set({ puppetParameters: params }),
  setDeformedMeshes: (meshes) => set({ deformedMeshes: meshes }),
  setNativeBlendShapes: (blendShapes) => set({ nativeBlendShapes: blendShapes }),
  setNativeControlDrivers: (drivers) => set({ nativeControlDrivers: drivers }),
  updateNativeBlendShapeWeight: (name, weight) =>
    set((state) => ({
      nativeBlendShapes: state.nativeBlendShapes.map((shape) =>
        shape.name === name ? { ...shape, current: weight } : shape,
      ),
    })),
  updateNativeTrackingInputValue: (name, value) =>
    set((state) => ({
      puppetParameters: updateParameterCurrent(state.puppetParameters, name, value),
    })),
  setSelectedNativeBoneId: (boneId) => set({ selectedNativeBoneId: boneId }),
  setNativeRevision: (revision) => set({ nativeRevision: revision }),
  nextNativeSeq: () => {
    const seq = get().nativeSeq;
    set({ nativeSeq: seq + 1 });
    return seq;
  },
  addPendingNativeCommand: (id) =>
    set((state) => ({
      pendingNativeCommandIds: new Set([...state.pendingNativeCommandIds, id]),
    })),
  removePendingNativeCommand: (id) =>
    set((state) => {
      const next = new Set(state.pendingNativeCommandIds);
      next.delete(id);
      return { pendingNativeCommandIds: next };
    }),

  updateParameterValue: (name, value) =>
    set((state) => ({
      puppetParameters: state.puppetParameters.map((p) =>
        p.name === name ? { ...p, current: value } : p,
      ),
    })),

  setPlayingPhysics: (playing) => set({ isPlayingPhysics: playing }),
  setNoPuppetSource: (noPuppetSource) => set({ noPuppetSource }),
  setLoadError: (message) => set({ loadError: message }),
  setTextures: (textures) =>
    set((state) => {
      const nextTextures = new Set(textures);
      for (const texture of state.textures) {
        if (!nextTextures.has(texture)) {
          texture.close();
        }
      }
      return { textures };
    }),
  setViewport: (viewport) => set({ viewport }),

  setAnimations: (clips) => set({ animations: clips }),
  setCurrentAnimation: (name) => set({ currentAnimation: name }),
  setPlayState: (state) => set({ playState: state }),
  setStreamConnected: (connected) => set({ streamConnected: connected }),
  setPreviewFrame: (frame) =>
    set((state) => {
      if (state.previewFrame && state.previewFrame !== frame) {
        state.previewFrame.close();
      }
      return { previewFrame: frame };
    }),
  setAnimationTimeMs: (timeMs) => set({ animationTimeMs: timeMs }),

  setKeyframeTracks: (tracks) => set({ keyframeTracks: tracks }),
  setSelectedKeyframeIds: (ids) => set({ selectedKeyframeIds: ids }),
  toggleKeyframeEditor: () =>
    set((state) => ({ isKeyframeEditorOpen: !state.isKeyframeEditorOpen })),

  resetAnimation: () =>
    set((state) => {
      state.previewFrame?.close();
      return {
        puppetLoaded: false,
        puppetSnapshot: null,
        puppetParameters: [],
        deformedMeshes: [],
        nativeBlendShapes: [],
        nativeControlDrivers: [],
        selectedNativeBoneId: null,
        nativeRevision: 0,
        nativeSeq: 1,
        pendingNativeCommandIds: new Set<string>(),
        loadError: null,
        textures: [],
        viewport: { zoom: 2, panX: 0, panY: 0 },
        isPlayingPhysics: false,
        animations: [],
        currentAnimation: null,
        playState: 'idle',
        streamConnected: false,
        previewFrame: null,
        animationTimeMs: 0,
        keyframeTracks: [],
        selectedKeyframeIds: new Set<string>(),
        isKeyframeEditorOpen: false,
      };
    }),
}));

function updateParameterCurrent(
  parameters: ParameterInfo[],
  name: string,
  value: number,
): ParameterInfo[] {
  let updated = false;
  const next = parameters.map((parameter) => {
    if (parameter.name !== name) return parameter;
    updated = true;
    return { ...parameter, current: value };
  });
  if (updated) return next;
  return [
    ...parameters,
    {
      name,
      min: 0,
      max: 1,
      default: 0,
      current: value,
    },
  ];
}
