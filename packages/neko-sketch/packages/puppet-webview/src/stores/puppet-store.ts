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

export type AnimationPlayState = 'idle' | 'playing' | 'paused';

export interface PuppetStore {
  // ── Puppet state ─────────────────────────────────────────────────────────
  puppetLoaded: boolean;
  puppetSnapshot: PuppetSnapshot | null;
  puppetParameters: ParameterInfo[];
  deformedMeshes: DeformedMesh[];
  isPlayingPhysics: boolean;

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

  // ── Actions ───────────────────────────────────────────────────────────────
  setPuppetLoaded: (loaded: boolean) => void;
  setPuppetSnapshot: (snapshot: PuppetSnapshot | null) => void;
  setPuppetParameters: (params: ParameterInfo[]) => void;
  setDeformedMeshes: (meshes: DeformedMesh[]) => void;
  updateParameterValue: (name: string, value: number) => void;
  setPlayingPhysics: (playing: boolean) => void;

  setAnimations: (clips: AnimationClipInfo[]) => void;
  setCurrentAnimation: (name: string | null) => void;
  setPlayState: (state: AnimationPlayState) => void;
  setStreamConnected: (connected: boolean) => void;
  setAnimationTimeMs: (timeMs: number) => void;

  resetAnimation: () => void;
}

export const usePuppetStore = create<PuppetStore>()((set) => ({
  // ── Puppet state ─────────────────────────────────────────────────────────
  puppetLoaded: false,
  puppetSnapshot: null,
  puppetParameters: [],
  deformedMeshes: [],
  isPlayingPhysics: false,

  // ── Animation clip state ─────────────────────────────────────────────────
  animations: [],
  currentAnimation: null,
  playState: 'idle',
  streamConnected: false,
  animationTimeMs: 0,

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

  setAnimations: (clips) => set({ animations: clips }),
  setCurrentAnimation: (name) => set({ currentAnimation: name }),
  setPlayState: (state) => set({ playState: state }),
  setStreamConnected: (connected) => set({ streamConnected: connected }),
  setAnimationTimeMs: (timeMs) => set({ animationTimeMs: timeMs }),

  resetAnimation: () =>
    set({
      puppetLoaded: false,
      puppetSnapshot: null,
      puppetParameters: [],
      deformedMeshes: [],
      isPlayingPhysics: false,
      animations: [],
      currentAnimation: null,
      playState: 'idle',
      streamConnected: false,
      animationTimeMs: 0,
    }),
}));
