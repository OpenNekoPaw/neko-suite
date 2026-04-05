import { create } from 'zustand';
import type { TrackingData, TrackingMode } from '../types/tracking';

export interface LiveState {
  // ─── Tracking ─────────────────────────────────────────────────────────
  trackingMode: TrackingMode;
  isTracking: boolean;
  trackingFps: number;
  currentTrackingData: TrackingData | null;

  // ─── Avatar ───────────────────────────────────────────────────────────
  avatarUrl: string | null;
  isAvatarLoaded: boolean;

  // ─── UI ───────────────────────────────────────────────────────────────
  showSkeletonOverlay: boolean;

  // ─── Actions ──────────────────────────────────────────────────────────
  setTrackingMode: (mode: TrackingMode) => void;
  setIsTracking: (active: boolean) => void;
  applyTrackingData: (data: TrackingData) => void;
  setAvatarUrl: (url: string | null) => void;
  setAvatarLoaded: (loaded: boolean) => void;
  toggleSkeletonOverlay: () => void;
}

// Sliding window for FPS calculation
const FPS_WINDOW_MS = 1000;
let frameTimestamps: number[] = [];

export const useLiveStore = create<LiveState>((set) => ({
  trackingMode: 'vmc',
  isTracking: false,
  trackingFps: 0,
  currentTrackingData: null,

  avatarUrl: null,
  isAvatarLoaded: false,

  showSkeletonOverlay: false,

  setTrackingMode: (mode) => set({ trackingMode: mode }),
  setIsTracking: (active) => {
    if (!active) {
      frameTimestamps = [];
    }
    set({ isTracking: active, trackingFps: active ? 0 : 0 });
  },

  applyTrackingData: (data) => {
    const now = performance.now();
    frameTimestamps.push(now);

    // Remove timestamps older than the window
    const cutoff = now - FPS_WINDOW_MS;
    while (frameTimestamps.length > 0 && frameTimestamps[0]! < cutoff) {
      frameTimestamps.shift();
    }

    set({
      currentTrackingData: data,
      trackingFps: frameTimestamps.length,
    });
  },

  setAvatarUrl: (url) => set({ avatarUrl: url, isAvatarLoaded: false }),
  setAvatarLoaded: (loaded) => set({ isAvatarLoaded: loaded }),
  toggleSkeletonOverlay: () => set((s) => ({ showSkeletonOverlay: !s.showSkeletonOverlay })),
}));
