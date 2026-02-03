/**
 * useKeyframeCacheManager - Keyframe Cache Manager Hook
 *
 * According to docs/principle.md:
 * 1. LRU cache strategy, cache size 120 frames
 * 2. Read current playhead position, get video elements after playhead
 * 3. Get all keyframes (IDR frames only), sort by time after playhead, cache first 80
 * 4. Cache trigger: when opening timeline or manually switching mode
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { getLocalMediaProcessor } from '../services/mediaProxyFactory';
import type { TimelineVideoInfo } from '../services/LocalMediaProcessor';

// =============================================================================
// Constants
// =============================================================================

const PRELOAD_KEYFRAME_COUNT = 80;

// =============================================================================
// Hook
// =============================================================================

/**
 * Manages keyframe cache for basic mode preview
 *
 * Features:
 * - Triggers cache preload when timeline opens
 * - Triggers cache clear and reload when mode switches
 * - Preloads 80 keyframes after current playhead position
 */
export function useKeyframeCacheManager(): void {
  const currentMode = useEditorStore((state) => state.currentMode);
  const project = useEditorStore((state) => state.project);
  const currentTime = useEditorStore((state) => state.currentTime);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastModeRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  /**
   * Extract video info from project for keyframe preloading
   */
  const extractVideoInfos = useCallback((): TimelineVideoInfo[] => {
    if (!project) return [];

    const videoInfos: TimelineVideoInfo[] = [];

    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (element.type === 'media' && element.src) {
          videoInfos.push({
            videoPath: element.src,
            timelineOffset: element.startTime,
            trimStart: element.trimStart,
            trimEnd: element.trimEnd,
          });
        }
      }
    }

    return videoInfos;
  }, [project]);

  /**
   * Preload keyframes from playhead position
   */
  const preloadKeyframes = useCallback(async (playheadTime: number) => {
    if (currentMode !== 'basic') return;

    // Cancel any ongoing preload
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const videoInfos = extractVideoInfos();
    if (videoInfos.length === 0) return;

    try {
      const processor = getLocalMediaProcessor();
      const count = await processor.preloadKeyframesFromPlayhead(
        videoInfos,
        playheadTime,
        PRELOAD_KEYFRAME_COUNT,
        abortController.signal
      );

      if (!abortController.signal.aborted) {
        console.debug(`[KeyframeCacheManager] Preloaded ${count} keyframes from playhead ${playheadTime.toFixed(2)}s`);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        console.warn('[KeyframeCacheManager] Preload failed:', error);
      }
    }
  }, [currentMode, extractVideoInfos]);

  /**
   * Clear cache and reload
   */
  const clearAndReload = useCallback(async () => {
    if (currentMode !== 'basic') return;

    // Cancel any ongoing preload
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const processor = getLocalMediaProcessor();
    processor.clearAllKeyframeCaches();

    // Preload from current playhead
    await preloadKeyframes(currentTime);
  }, [currentMode, currentTime, preloadKeyframes]);

  // Effect: Handle mode switch - clear cache and reload
  useEffect(() => {
    if (currentMode === null) return;

    // Check if mode changed
    if (lastModeRef.current !== null && lastModeRef.current !== currentMode) {
      console.debug(`[KeyframeCacheManager] Mode switched from ${lastModeRef.current} to ${currentMode}`);

      if (currentMode === 'basic') {
        // Clear cache and reload when switching to basic mode
        clearAndReload();
      }
    }

    lastModeRef.current = currentMode;
  }, [currentMode, clearAndReload]);

  // Effect: Initial preload when timeline opens (project loaded)
  useEffect(() => {
    if (!project || currentMode !== 'basic' || isInitializedRef.current) return;

    isInitializedRef.current = true;
    console.debug('[KeyframeCacheManager] Timeline opened, starting initial keyframe preload');
    preloadKeyframes(currentTime);

    return () => {
      isInitializedRef.current = false;
    };
  }, [project, currentMode, currentTime, preloadKeyframes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
}
