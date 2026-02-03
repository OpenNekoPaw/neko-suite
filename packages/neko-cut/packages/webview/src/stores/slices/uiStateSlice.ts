/**
 * UI State Slice
 * 管理 UI 相关的状态 (缩放、预览质量、编辑模式等)
 */

import { StateCreator } from 'zustand';
import { type PreviewQuality } from '../../constants';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

export type { PreviewQuality };

export interface UIStateSlice {
  // Zoom
  zoomLevel: number;
  setZoomLevel: (level: number) => void;

  // Preview quality (DaVinci style: full, half, quarter, eighth)
  previewQuality: PreviewQuality;
  setPreviewQuality: (quality: PreviewQuality) => void;

  // FPS counter
  showFpsCounter: boolean;
  currentFps: number;
  performanceStats: {
    // Time info
    currentTime: number;
    frameIndex: number;
    targetFps: number;
    // Preview info (docs/principle.md requirement)
    resolution: string; // e.g., "1920x1080"
    bitrate: string; // e.g., "10 Mbps"
    mode: 'compatible'; // Only compatible mode is supported
    // Timing stats
    decodeTime: number;
    renderTime: number;
    compositeTime: number;
    // System metrics
    memoryUsedMB: number;
    memoryTotalMB: number;
    cpuLoad: number; // 0-100 percentage estimate
    gpuBackend: string;
    // GPU stats
    gpuRenderer: string;
    gpuLoad: number; // 0-100 percentage estimate based on render time
    vramUsedMB: number;
    // Cache stats
    cachedFrames: number; // Number of cached frames
    cacheHitRate: number;
    // Error stats
    droppedFrames: number;
    renderErrors: number;
  };
  toggleFpsCounter: () => void;
  setCurrentFps: (fps: number) => void;
  setPerformanceStats: (stats: Partial<{
    currentTime: number;
    frameIndex: number;
    targetFps: number;
    resolution: string;
    bitrate: string;
    mode: 'compatible';
    decodeTime: number;
    renderTime: number;
    compositeTime: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    cpuLoad: number;
    gpuBackend: string;
    gpuRenderer: string;
    gpuLoad: number;
    vramUsedMB: number;
    cachedFrames: number;
    cacheHitRate: number;
    droppedFrames: number;
    renderErrors: number;
  }>) => void;

  // Editing modes
  snappingEnabled: boolean;
  rippleEditingEnabled: boolean;
  toggleSnapping: () => void;
  toggleRippleEditing: () => void;

  // Timeline clip preview
  showClipThumbnails: boolean;
  toggleClipThumbnails: () => void;

  // Timeline minimap
  showMinimap: boolean;
  toggleMinimap: () => void;

  // Frame alignment
  frameAlignEnabled: boolean;
  toggleFrameAlign: () => void;

  // Visual indicators
  snapIndicatorTime: number | null;
  setSnapIndicatorTime: (time: number | null) => void;
  dragTargetTrackId: string | null;
  setDragTargetTrackId: (trackId: string | null) => void;
}

export const createUIStateSlice: StateCreator<
  UIStateSlice,
  [],
  [],
  UIStateSlice
> = (set) => ({
  // Initial state
  zoomLevel: 1,
  previewQuality: 'high', // Default to 0.75 for balanced performance
  showFpsCounter: false,
  currentFps: 0,
  performanceStats: {
    currentTime: 0,
    frameIndex: 0,
    targetFps: 30,
    resolution: '',
    bitrate: '',
    mode: 'compatible',
    decodeTime: 0,
    renderTime: 0,
    compositeTime: 0,
    memoryUsedMB: 0,
    memoryTotalMB: 0,
    cpuLoad: 0,
    gpuBackend: '',
    gpuRenderer: '',
    gpuLoad: 0,
    vramUsedMB: 0,
    cachedFrames: 0,
    cacheHitRate: 0,
    droppedFrames: 0,
    renderErrors: 0,
  },
  snappingEnabled: true,
  rippleEditingEnabled: false,
  showClipThumbnails: true,
  showMinimap: true,
  frameAlignEnabled: false,
  snapIndicatorTime: null,
  dragTargetTrackId: null,

  // Actions
  setZoomLevel: (level) => set({ zoomLevel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)) }),

  setPreviewQuality: (quality) => set({ previewQuality: quality }),

  toggleFpsCounter: () => set((state) => ({ showFpsCounter: !state.showFpsCounter })),

  setCurrentFps: (fps) => set({ currentFps: fps }),

  setPerformanceStats: (stats) => set((state) => ({
    performanceStats: {
      ...state.performanceStats,
      ...stats,
    },
  })),

  toggleSnapping: () => set((state) => ({ snappingEnabled: !state.snappingEnabled })),

  toggleRippleEditing: () => set((state) => ({ rippleEditingEnabled: !state.rippleEditingEnabled })),

  toggleClipThumbnails: () => set((state) => ({ showClipThumbnails: !state.showClipThumbnails })),

  toggleMinimap: () => set((state) => ({ showMinimap: !state.showMinimap })),

  toggleFrameAlign: () => set((state) => ({ frameAlignEnabled: !state.frameAlignEnabled })),

  setSnapIndicatorTime: (time) => set({ snapIndicatorTime: time }),

  setDragTargetTrackId: (trackId) => set({ dragTargetTrackId: trackId }),
});

