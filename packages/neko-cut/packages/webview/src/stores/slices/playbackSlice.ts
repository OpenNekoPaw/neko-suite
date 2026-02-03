/**
 * Playback Slice
 * 管理播放状态和时间控制
 */

import { StateCreator } from 'zustand';

export interface PlaybackSlice {
  // State
  isPlaying: boolean;
  currentTime: number;
  frameAlignEnabled: boolean;

  // Audio State
  previewVolume: number;      // 预览音量 (0-1)
  previewMuted: boolean;      // 预览静音状态

  // Actions
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  seek: (time: number, fps?: number) => void;
  seekToFrame: (time: number, fps?: number) => void;
  toggleFrameAlign: () => void;

  // Audio Actions
  setPreviewVolume: (volume: number) => void;
  togglePreviewMute: () => void;
}

export const createPlaybackSlice: StateCreator<
  PlaybackSlice,
  [],
  [],
  PlaybackSlice
> = (set, get) => ({
  // Initial state
  isPlaying: false,
  currentTime: 0,
  frameAlignEnabled: false,

  // Audio initial state
  previewVolume: 1.0,     // 默认音量 100%
  previewMuted: false,    // 默认不静音

  // Actions
  play: () => set({ isPlaying: true }),

  pause: () => set({ isPlaying: false }),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  seek: (time, fps = 30) => {
    const { frameAlignEnabled } = get();
    let alignedTime = Math.max(0, time);
    if (frameAlignEnabled) {
      alignedTime = Math.round(alignedTime * fps) / fps;
    }
    set({ currentTime: alignedTime });
  },

  seekToFrame: (time, fps = 30) => {
    const alignedTime = Math.round(Math.max(0, time) * fps) / fps;
    set({ currentTime: alignedTime });
  },

  toggleFrameAlign: () => set((state) => ({ frameAlignEnabled: !state.frameAlignEnabled })),

  // Audio actions
  setPreviewVolume: (volume) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    set({ previewVolume: clampedVolume });
  },

  togglePreviewMute: () => set((state) => ({ previewMuted: !state.previewMuted })),
});
