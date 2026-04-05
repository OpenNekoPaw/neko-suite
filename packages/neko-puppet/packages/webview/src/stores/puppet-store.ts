/**
 * Puppet Store - standalone Zustand store for puppet editor state
 *
 * Manages Inochi2D puppet loading, parameter control, and playback state.
 * Separated from the sketch store to keep the puppet editor independent.
 */
import { create } from 'zustand';
import type {
  AnimationClipInfo,
  DeformedMesh,
  ParameterInfo,
  PuppetSnapshot,
} from '../animation/types';
import type { EditorKeyframeTrack } from '@neko/shared';

export type AnimationPlayState = 'idle' | 'playing' | 'paused';

export interface PuppetStore {
  // ── Puppet state ─────────────────────────────────────────────────────────
  puppetLoaded: boolean;
  puppetSnapshot: PuppetSnapshot | null;
  puppetParameters: ParameterInfo[];
  deformedMeshes: DeformedMesh[];
  isPlayingPhysics: boolean;
  /** Whether the .nkp has no puppet.src linked (shows import UI) */
  noPuppetSource: boolean;
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
  updateParameterValue: (name: string, value: number) => void;
  setPlayingPhysics: (playing: boolean) => void;
  setNoPuppetSource: (noPuppetSource: boolean) => void;
  setTextures: (textures: ImageBitmap[]) => void;
  setViewport: (viewport: { zoom: number; panX: number; panY: number }) => void;

  setAnimations: (clips: AnimationClipInfo[]) => void;
  setCurrentAnimation: (name: string | null) => void;
  setPlayState: (state: AnimationPlayState) => void;
  setStreamConnected: (connected: boolean) => void;
  setAnimationTimeMs: (timeMs: number) => void;

  setKeyframeTracks: (tracks: EditorKeyframeTrack[]) => void;
  setSelectedKeyframeIds: (ids: Set<string>) => void;
  toggleKeyframeEditor: () => void;

  resetAnimation: () => void;
}

export const usePuppetStore = create<PuppetStore>()((set) => ({
  // ── Puppet state ─────────────────────────────────────────────────────────
  puppetLoaded: false,
  puppetSnapshot: null,
  puppetParameters: [],
  deformedMeshes: [],
  isPlayingPhysics: false,
  noPuppetSource: false,
  textures: [],
  viewport: { zoom: 1, panX: 0, panY: 0 },

  // ── Animation clip state ─────────────────────────────────────────────────
  animations: [],
  currentAnimation: null,
  playState: 'idle',
  streamConnected: false,
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

  updateParameterValue: (name, value) =>
    set((state) => ({
      puppetParameters: state.puppetParameters.map((p) =>
        p.name === name ? { ...p, current: value } : p,
      ),
    })),

  setPlayingPhysics: (playing) => set({ isPlayingPhysics: playing }),
  setNoPuppetSource: (noPuppetSource) => set({ noPuppetSource }),
  setTextures: (textures) => set({ textures }),
  setViewport: (viewport) => set({ viewport }),

  setAnimations: (clips) => set({ animations: clips }),
  setCurrentAnimation: (name) => set({ currentAnimation: name }),
  setPlayState: (state) => set({ playState: state }),
  setStreamConnected: (connected) => set({ streamConnected: connected }),
  setAnimationTimeMs: (timeMs) => set({ animationTimeMs: timeMs }),

  setKeyframeTracks: (tracks) => set({ keyframeTracks: tracks }),
  setSelectedKeyframeIds: (ids) => set({ selectedKeyframeIds: ids }),
  toggleKeyframeEditor: () =>
    set((state) => ({ isKeyframeEditorOpen: !state.isKeyframeEditorOpen })),

  resetAnimation: () =>
    set({
      puppetLoaded: false,
      puppetSnapshot: null,
      puppetParameters: [],
      deformedMeshes: [],
      textures: [],
      viewport: { zoom: 1, panX: 0, panY: 0 },
      isPlayingPhysics: false,
      animations: [],
      currentAnimation: null,
      playState: 'idle',
      streamConnected: false,
      animationTimeMs: 0,
      keyframeTracks: [],
      selectedKeyframeIds: new Set<string>(),
      isKeyframeEditorOpen: false,
    }),
}));
