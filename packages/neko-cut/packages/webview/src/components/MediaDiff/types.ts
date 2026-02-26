/**
 * MediaDiff Component Types
 * 媒体对比组件类型定义
 */

import type {
  DiffViewMode,
  DiffResult,
  ImageDiffDetails,
  VideoDiffDetails,
  AudioDiffDetails,
  MediaType,
} from '@neko/shared';

// =============================================================================
// Common Props
// =============================================================================

/**
 * Base props for all diff viewers
 */
export interface BaseDiffViewerProps {
  /** View mode for comparison */
  viewMode: DiffViewMode;
  /** Current version data URL or blob URL */
  currentSrc: string;
  /** Previous version data URL or blob URL */
  previousSrc: string;
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string | null;
}

/**
 * Slider position for slider/onion-skin modes
 */
export interface SliderPosition {
  x: number; // 0-1, percentage from left
}

// =============================================================================
// Image Diff Props
// =============================================================================

export interface ImageDiffViewerProps extends BaseDiffViewerProps {
  /** Image diff analysis details */
  details?: ImageDiffDetails;
  /** Heatmap image data URL (optional) */
  heatmapSrc?: string;
  /** Slider position state */
  sliderPosition?: number;
  /** Callback when slider position changes */
  onSliderChange?: (position: number) => void;
  /** Overlay opacity for overlay mode (0-1) */
  overlayOpacity?: number;
  /** Callback when overlay opacity changes */
  onOpacityChange?: (opacity: number) => void;
  /** Zoom level */
  zoom?: number;
  /** Callback when zoom changes */
  onZoomChange?: (zoom: number) => void;
}

// =============================================================================
// Video Diff Props
// =============================================================================

export interface VideoDiffViewerProps extends BaseDiffViewerProps {
  /** Video diff analysis details */
  details?: VideoDiffDetails;
  /** Current playback time */
  currentTime?: number;
  /** Callback when time changes */
  onTimeChange?: (time: number) => void;
  /** Whether video is playing */
  isPlaying?: boolean;
  /** Callback to toggle play/pause */
  onPlayPause?: () => void;
  /** Slider position for comparison */
  sliderPosition?: number;
  /** Callback when slider position changes */
  onSliderChange?: (position: number) => void;
}

// =============================================================================
// Audio Diff Props
// =============================================================================

export interface AudioDiffViewerProps extends BaseDiffViewerProps {
  /** Audio diff analysis details */
  details?: AudioDiffDetails;
  /** Current waveform peaks (current version) */
  currentWaveform?: number[];
  /** Previous waveform peaks (previous version) */
  previousWaveform?: number[];
  /** Current playback time */
  currentTime?: number;
  /** Callback when time changes */
  onTimeChange?: (time: number) => void;
  /** Which version is playing: 'current' | 'previous' | 'both' */
  playingVersion?: 'current' | 'previous' | 'both';
  /** Callback to change playing version */
  onPlayingVersionChange?: (version: 'current' | 'previous' | 'both') => void;
}

// =============================================================================
// Controls Props
// =============================================================================

export interface DiffControlsProps {
  /** Current view mode */
  viewMode: DiffViewMode;
  /** Callback when view mode changes */
  onViewModeChange: (mode: DiffViewMode) => void;
  /** Similarity score (0-1) */
  similarity?: number;
  /** Media type being compared */
  mediaType: MediaType;
  /** Whether the diff is loading */
  isLoading?: boolean;
  /** Zoom controls (for image) */
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  /** Opacity controls (for overlay mode) */
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
}

// =============================================================================
// Main MediaDiffViewer Props
// =============================================================================

export interface MediaDiffViewerProps {
  /** Diff analysis result */
  diffResult?: DiffResult;
  /** Current version data URL */
  currentSrc: string;
  /** Previous version data URL */
  previousSrc: string;
  /** Optional heatmap for image diff */
  heatmapSrc?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string | null;
  /** Git ref being compared against */
  gitRef?: string;
  /** File path */
  filePath?: string;
}

// =============================================================================
// State Types
// =============================================================================

export interface MediaDiffState {
  viewMode: DiffViewMode;
  sliderPosition: number;
  overlayOpacity: number;
  zoom: number;
  currentTime: number;
  isPlaying: boolean;
  playingVersion: 'current' | 'previous' | 'both';
}

export const DEFAULT_DIFF_STATE: MediaDiffState = {
  viewMode: 'side-by-side',
  sliderPosition: 0.5,
  overlayOpacity: 0.5,
  zoom: 1,
  currentTime: 0,
  isPlaying: false,
  playingVersion: 'current',
};
