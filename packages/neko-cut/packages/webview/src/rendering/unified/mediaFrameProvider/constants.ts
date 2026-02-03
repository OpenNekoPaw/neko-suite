/**
 * MediaFrameProvider Constants
 */

import {
  PLAYBACK_REQUEST_TIMEOUT,
  PRELOAD_REQUEST_TIMEOUT,
  PROBE_REQUEST_TIMEOUT,
  PRELOAD_TIME_WINDOW,
  MAX_PRELOAD_FRAMES_PER_VIDEO,
  GLOBAL_FRAME_CACHE_LIMIT,
} from '@neko/shared';

// =============================================================================
// Re-export shared constants
// =============================================================================

export {
  PLAYBACK_REQUEST_TIMEOUT,
  PRELOAD_REQUEST_TIMEOUT,
  PROBE_REQUEST_TIMEOUT,
  PRELOAD_TIME_WINDOW,
  MAX_PRELOAD_FRAMES_PER_VIDEO,
  GLOBAL_FRAME_CACHE_LIMIT,
};

// =============================================================================
// Local Constants
// =============================================================================

// Minimal video entries to reduce memory - each holds a VideoFrame (~10-50MB for HD)
export const DEFAULT_MAX_VIDEO_ENTRIES = 4;
export const DEFAULT_IMAGE_CACHE_SIZE = 20;
export const MICROSECONDS = 1_000_000;
export const MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Default FPS when media info is not available
export const DEFAULT_FPS = 30;

// Default time window (can be overridden by config.cacheWindow)
export const DEFAULT_TIME_WINDOW = PRELOAD_TIME_WINDOW;

// Playback frame rate limiting
export const PLAYBACK_TARGET_FPS = 15;
export const MIN_FRAME_REQUEST_INTERVAL = 1000 / PLAYBACK_TARGET_FPS; // ~67ms

// IPC request priorities
export const FRAME_REQUEST_PRIORITY_PLAYBACK = 100;
export const FRAME_REQUEST_PRIORITY_PRELOAD = 10;
