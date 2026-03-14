/**
 * Frame Slice - frame-by-frame animation state
 *
 * Manages frame layers, current frame position, playback state,
 * and onion skin configuration for traditional animation workflow.
 */
import type { StateCreator } from 'zustand';
import type { FrameLayer, OnionSkinConfig } from '../../types/frame';
import { DEFAULT_ONION_SKIN } from '../../types/frame';
import {
  createFrame,
  createFrameLayer,
  duplicateFrame as dupFrame,
  insertFrame,
  removeFrame as rmFrame,
} from '../../utils/frame-manager';

export interface FrameSlice {
  // ── State ──────────────────────────────────────────────────────────────────
  frameLayers: FrameLayer[];
  selectedFrameLayerId: string | null;
  currentFrameIndex: number;
  fps: number;
  isFramePlaying: boolean;
  onionSkin: OnionSkinConfig;

  // ── Actions ────────────────────────────────────────────────────────────────
  addFrameLayer: (name: string) => void;
  removeFrameLayer: (layerId: string) => void;
  setSelectedFrameLayer: (layerId: string | null) => void;

  addFrame: () => void;
  addBlankFrame: () => void;
  duplicateFrame: () => void;
  removeCurrentFrame: () => void;
  setCurrentFrameIndex: (index: number) => void;
  nextFrame: () => void;
  prevFrame: () => void;

  setFps: (fps: number) => void;
  setFramePlaying: (playing: boolean) => void;

  toggleOnionSkin: () => void;
  setOnionSkinConfig: (config: Partial<OnionSkinConfig>) => void;

  resetFrames: () => void;

  /** Persist pixel data for a specific frame (called on frame switch / stroke end) */
  updateFrameImageData: (layerId: string, frameIndex: number, imageData: ImageData | null) => void;
}

export const createFrameSlice: StateCreator<FrameSlice> = (set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  frameLayers: [],
  selectedFrameLayerId: null,
  currentFrameIndex: 0,
  fps: 12,
  isFramePlaying: false,
  onionSkin: DEFAULT_ONION_SKIN,

  // ── Actions ────────────────────────────────────────────────────────────────
  addFrameLayer: (name) => {
    const layer = createFrameLayer(name);
    set((s) => ({
      frameLayers: [...s.frameLayers, layer],
      selectedFrameLayerId: s.selectedFrameLayerId ?? layer.id,
    }));
  },

  removeFrameLayer: (layerId) =>
    set((s) => {
      const filtered = s.frameLayers.filter((l) => l.id !== layerId);
      return {
        frameLayers: filtered,
        selectedFrameLayerId:
          s.selectedFrameLayerId === layerId ? (filtered[0]?.id ?? null) : s.selectedFrameLayerId,
      };
    }),

  setSelectedFrameLayer: (layerId) => set({ selectedFrameLayerId: layerId }),

  addFrame: () =>
    set((s) => {
      const layerId = s.selectedFrameLayerId;
      if (!layerId) return s;

      return {
        frameLayers: s.frameLayers.map((l) =>
          l.id === layerId ? insertFrame(l, s.currentFrameIndex + 1) : l,
        ),
        currentFrameIndex: s.currentFrameIndex + 1,
      };
    }),

  addBlankFrame: () => {
    const state = get();
    const layerId = state.selectedFrameLayerId;
    if (!layerId) return;

    const layer = state.frameLayers.find((l) => l.id === layerId);
    if (!layer) return;

    const newIndex = state.currentFrameIndex + 1;
    const newFrame = createFrame(layerId, newIndex);
    const frames = [...layer.frames];
    const shifted = frames.map((f) => (f.index >= newIndex ? { ...f, index: f.index + 1 } : f));
    shifted.push(newFrame);
    shifted.sort((a, b) => a.index - b.index);

    set({
      frameLayers: state.frameLayers.map((l) => (l.id === layerId ? { ...l, frames: shifted } : l)),
      currentFrameIndex: newIndex,
    });
  },

  duplicateFrame: () =>
    set((s) => {
      const layerId = s.selectedFrameLayerId;
      if (!layerId) return s;

      const layer = s.frameLayers.find((l) => l.id === layerId);
      if (!layer) return s;

      const currentFrame = layer.frames.find((f) => f.index === s.currentFrameIndex);
      if (!currentFrame) return s;

      const newIndex = s.currentFrameIndex + 1;
      const dup = dupFrame(currentFrame, newIndex);
      const frames = [...layer.frames];
      const shifted = frames.map((f) => (f.index >= newIndex ? { ...f, index: f.index + 1 } : f));
      shifted.push(dup);
      shifted.sort((a, b) => a.index - b.index);

      return {
        frameLayers: s.frameLayers.map((l) => (l.id === layerId ? { ...l, frames: shifted } : l)),
        currentFrameIndex: newIndex,
      };
    }),

  removeCurrentFrame: () =>
    set((s) => {
      const layerId = s.selectedFrameLayerId;
      if (!layerId) return s;

      const layer = s.frameLayers.find((l) => l.id === layerId);
      if (!layer || layer.frames.length <= 1) return s; // Keep at least one frame

      const frameToRemove = layer.frames.find((f) => f.index === s.currentFrameIndex);
      if (!frameToRemove) return s;

      const updated = rmFrame(layer, frameToRemove.id);
      const newIndex = Math.min(s.currentFrameIndex, updated.frames.length - 1);

      return {
        frameLayers: s.frameLayers.map((l) => (l.id === layerId ? updated : l)),
        currentFrameIndex: Math.max(0, newIndex),
      };
    }),

  setCurrentFrameIndex: (index) => set({ currentFrameIndex: index }),

  nextFrame: () =>
    set((s) => {
      const layer = s.frameLayers.find((l) => l.id === s.selectedFrameLayerId);
      if (!layer) return s;
      const maxIndex = layer.frames.length - 1;
      return {
        currentFrameIndex: Math.min(s.currentFrameIndex + 1, maxIndex),
      };
    }),

  prevFrame: () =>
    set((s) => ({
      currentFrameIndex: Math.max(0, s.currentFrameIndex - 1),
    })),

  setFps: (fps) => set({ fps: Math.max(1, Math.min(60, fps)) }),
  setFramePlaying: (playing) => set({ isFramePlaying: playing }),

  toggleOnionSkin: () =>
    set((s) => ({
      onionSkin: { ...s.onionSkin, enabled: !s.onionSkin.enabled },
    })),

  setOnionSkinConfig: (config) =>
    set((s) => ({
      onionSkin: { ...s.onionSkin, ...config },
    })),

  resetFrames: () =>
    set({
      frameLayers: [],
      selectedFrameLayerId: null,
      currentFrameIndex: 0,
      fps: 12,
      isFramePlaying: false,
      onionSkin: DEFAULT_ONION_SKIN,
    }),

  updateFrameImageData: (layerId, frameIndex, imageData) =>
    set((s) => ({
      frameLayers: s.frameLayers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              frames: l.frames.map((f) => (f.index === frameIndex ? { ...f, imageData } : f)),
            }
          : l,
      ),
    })),
});
