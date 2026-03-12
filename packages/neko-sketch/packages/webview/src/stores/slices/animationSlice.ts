/**
 * Animation Slice - 2D puppet animation state
 *
 * Manages Inochi2D puppet loading, parameter control, and playback state.
 * The actual rendering is handled by the canvas component using deformed
 * mesh data from the engine backend.
 */
import type { StateCreator } from 'zustand';
import type { ParameterInfo, PuppetSnapshot, DeformedMesh } from '../../animation/types';

export interface AnimationSlice {
  // State
  puppetLoaded: boolean;
  puppetSnapshot: PuppetSnapshot | null;
  puppetParameters: ParameterInfo[];
  deformedMeshes: DeformedMesh[];
  isPlayingPhysics: boolean;

  // Actions
  setPuppetLoaded: (loaded: boolean) => void;
  setPuppetSnapshot: (snapshot: PuppetSnapshot | null) => void;
  setPuppetParameters: (params: ParameterInfo[]) => void;
  setDeformedMeshes: (meshes: DeformedMesh[]) => void;
  updateParameterValue: (name: string, value: number) => void;
  setPlayingPhysics: (playing: boolean) => void;
  resetAnimation: () => void;
}

export const createAnimationSlice: StateCreator<AnimationSlice> = (set) => ({
  puppetLoaded: false,
  puppetSnapshot: null,
  puppetParameters: [],
  deformedMeshes: [],
  isPlayingPhysics: false,

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

  resetAnimation: () =>
    set({
      puppetLoaded: false,
      puppetSnapshot: null,
      puppetParameters: [],
      deformedMeshes: [],
      isPlayingPhysics: false,
    }),
});
