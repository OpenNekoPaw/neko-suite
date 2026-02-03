/**
 * useMediaInfoCache - Media Info Cache Hook
 *
 * Caches media info (bitrate, codec, etc.) for timeline media elements.
 * Used to display preview info according to docs/principle.md.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { getLocalMediaProcessor, getRemoteMediaProxy } from '../services/mediaProxyFactory';
import type { MediaInfo } from '@uniedit/shared';

// =============================================================================
// Types
// =============================================================================

interface MediaInfoCacheEntry {
  info: MediaInfo;
  timestamp: number;
}

interface BitrateInfoCacheEntry {
  bitrate: string;
  timestamp: number;
}

interface CurrentMediaInfo {
  bitrate: string;
  codec: string;
  resolution: string;
}

// =============================================================================
// Constants
// =============================================================================

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to get current playing media's info (bitrate, codec, etc.)
 */
export function useMediaInfoCache(): CurrentMediaInfo {
  const project = useEditorStore((state) => state.project);
  const currentTime = useEditorStore((state) => state.currentTime);
  const currentMode = useEditorStore((state) => state.currentMode);

  const cacheRef = useRef<Map<string, MediaInfoCacheEntry>>(new Map());
  const bitrateCacheRef = useRef<Map<string, BitrateInfoCacheEntry>>(new Map());
  const [currentInfo, setCurrentInfo] = useState<CurrentMediaInfo>({
    bitrate: '',
    codec: '',
    resolution: '',
  });

  /**
   * Get active video element at current time
   */
  const getActiveVideoSrc = useCallback((): string | null => {
    if (!project) return null;

    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (element.type !== 'media') continue;
        if (element.hidden) continue;
        const elementEnd = element.startTime + element.duration;
        if (currentTime >= element.startTime && currentTime < elementEnd) {
          return element.src || null;
        }
      }
    }
    return null;
  }, [project, currentTime]);

  /**
   * Format bitrate for display
   */
  const formatBitrate = useCallback((bitrate: number): string => {
    if (bitrate <= 0) return '';
    if (bitrate >= 1_000_000) {
      return `${(bitrate / 1_000_000).toFixed(1)} Mbps`;
    }
    if (bitrate >= 1_000) {
      return `${(bitrate / 1_000).toFixed(0)} Kbps`;
    }
    return `${bitrate} bps`;
  }, []);

  /**
   * Fetch media info for a video path (basic mode)
   */
  const fetchMediaInfo = useCallback(async (videoPath: string): Promise<MediaInfo | null> => {
    // Check cache first
    const cached = cacheRef.current.get(videoPath);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.info;
    }

    // Only fetch in basic mode (LocalMediaProcessor)
    if (currentMode !== 'basic') {
      return null;
    }

    try {
      const processor = getLocalMediaProcessor();
      const info = await processor.probeMediaInfo(videoPath);

      // Cache the result
      cacheRef.current.set(videoPath, {
        info,
        timestamp: Date.now(),
      });

      return info;
    } catch (error) {
      console.warn('[useMediaInfoCache] Failed to fetch media info:', error);
      return null;
    }
  }, [currentMode]);

  /**
   * Fetch bitrate info for a video path (compat mode)
   */
  const fetchBitrateInfo = useCallback(async (videoPath: string): Promise<string | null> => {
    // Check cache first
    const cached = bitrateCacheRef.current.get(videoPath);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.bitrate;
    }

    // Only fetch in compat mode
    if (currentMode !== 'compatible') {
      return null;
    }

    try {
      const proxy = getRemoteMediaProxy();
      const info = await proxy.getMediaBitrate(videoPath);

      // Cache the result
      bitrateCacheRef.current.set(videoPath, {
        bitrate: info.totalBitrateStr,
        timestamp: Date.now(),
      });

      return info.totalBitrateStr;
    } catch (error) {
      console.warn('[useMediaInfoCache] Failed to fetch bitrate info:', error);
      return null;
    }
  }, [currentMode]);

  // Effect: Update current info when active video changes
  useEffect(() => {
    const videoSrc = getActiveVideoSrc();
    if (!videoSrc) {
      setCurrentInfo({ bitrate: '', codec: '', resolution: '' });
      return;
    }

    // Check cache first for immediate update
    const cached = cacheRef.current.get(videoSrc);
    if (cached) {
      setCurrentInfo({
        bitrate: formatBitrate(cached.info.bitrate || 0),
        codec: cached.info.codec || '',
        resolution: cached.info.width > 0 ? `${cached.info.width}x${cached.info.height}` : '',
      });
    }

    // Check bitrate cache for compat mode
    const bitrateCached = bitrateCacheRef.current.get(videoSrc);
    if (bitrateCached && currentMode === 'compatible') {
      setCurrentInfo(prev => ({
        ...prev,
        bitrate: bitrateCached.bitrate,
      }));
    }

    // Fetch in background if not cached or expired
    let cancelled = false;

    if (currentMode === 'basic') {
      fetchMediaInfo(videoSrc).then((info) => {
        if (cancelled || !info) return;
        setCurrentInfo({
          bitrate: formatBitrate(info.bitrate || 0),
          codec: info.codec || '',
          resolution: info.width > 0 ? `${info.width}x${info.height}` : '',
        });
      });
    } else if (currentMode === 'compatible') {
      fetchBitrateInfo(videoSrc).then((bitrate) => {
        if (cancelled || !bitrate) return;
        setCurrentInfo(prev => ({
          ...prev,
          bitrate,
        }));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [getActiveVideoSrc, fetchMediaInfo, fetchBitrateInfo, formatBitrate, currentMode]);

  return currentInfo;
}
