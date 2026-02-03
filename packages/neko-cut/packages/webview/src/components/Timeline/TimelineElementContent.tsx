import { useEffect, useState, useMemo, memo, useRef } from 'react';
import type { TimelineElement, MediaElement, TextElement, AudioElement, TrackType, ShapeElement, AllTimelineElement } from '../../types';
import type { SubtitleElement } from '@neko/shared';
import { generateWaveformForViewport, type WaveformViewport } from '../../utils/waveform';
import { getCachedFileUri, subscribeToUriCacheUpdates } from '../../hooks/useVSCodeMessaging';
import { ShapeElementContent } from '../ShapeElementContent';
import { getThumbnailService, type ThumbnailData } from '../../services';
import { useEditorStore } from '../../stores/editor-store';
import type { ThumbnailViewport } from '../../utils/pyramidThumbnail';

interface VisibleRange {
  startTime: number;
  endTime: number;
}

interface TimelineElementContentProps {
  element: TimelineElement | AllTimelineElement;
  width: number;
  height: number;
  trackType?: TrackType; // Track type to determine rendering
  showThumbnails?: boolean; // Whether to show thumbnails or simple color blocks
  pixelsPerSecond?: number; // Pixels per second for viewport calculation
  zoomLevel?: number; // Current zoom level
  visibleRange?: VisibleRange; // Visible time range for viewport-aware loading
}

// Helper function to resample waveform peaks to target count
function resampleWaveformPeaks(peaks: number[], targetCount: number): number[] {
  if (peaks.length === 0) return [];
  if (peaks.length === targetCount) return peaks;

  const result: number[] = [];
  const ratio = peaks.length / targetCount;

  for (let i = 0; i < targetCount; i++) {
    const srcStart = Math.floor(i * ratio);
    const srcEnd = Math.min(Math.ceil((i + 1) * ratio), peaks.length);

    let max = 0;
    for (let j = srcStart; j < srcEnd; j++) {
      const val = peaks[j];
      if (val !== undefined && val > max) max = val;
    }
    result.push(max);
  }

  return result;
}

// MediaElementContent - memoized for performance
// Uses ThumbnailService for memory-efficient thumbnail generation with viewport awareness
const MediaElementContent = memo(function MediaElementContent({
  element,
  height,
  pixelsPerSecond,
  zoomLevel,
  visibleRange,
}: {
  element: MediaElement;
  width: number;
  height: number;
  pixelsPerSecond?: number;
  zoomLevel?: number;
  visibleRange?: VisibleRange;
}) {
  const [thumbnails, setThumbnails] = useState<ThumbnailData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const lastViewportRef = useRef<string>('');

  // Wait for mode to be determined before generating thumbnails
  const currentMode = useEditorStore((state) => state.currentMode);
  const isModeLoading = useEditorStore((state) => state.isModeLoading);

  // Calculate element's time range
  const elementStartTime = element.startTime;
  const elementDuration = element.duration - element.trimStart - element.trimEnd;
  const elementEndTime = elementStartTime + elementDuration;

  // Calculate thumbnail dimensions
  const thumbHeight = height - 8; // Account for padding

  // Calculate effective pixels per second (with zoom)
  const effectivePPS = (pixelsPerSecond ?? 50) * (zoomLevel ?? 1);

  // Calculate viewport intersection with element
  const viewportInfo = useMemo(() => {
    if (!visibleRange) {
      // Fallback: use element's full range
      return {
        startTime: element.trimStart,
        endTime: element.duration - element.trimEnd,
        pixelsPerSecond: effectivePPS,
        height: thumbHeight,
      };
    }

    // Calculate intersection between visible range and element
    const visibleStart = Math.max(visibleRange.startTime, elementStartTime);
    const visibleEnd = Math.min(visibleRange.endTime, elementEndTime);

    // Convert to element-local time (relative to trimStart)
    const localStart = Math.max(0, visibleStart - elementStartTime + element.trimStart);
    const localEnd = Math.min(
      element.duration - element.trimEnd,
      visibleEnd - elementStartTime + element.trimStart
    );

    return {
      startTime: localStart,
      endTime: localEnd,
      pixelsPerSecond: effectivePPS,
      height: thumbHeight,
    };
  }, [
    visibleRange?.startTime,
    visibleRange?.endTime,
    elementStartTime,
    elementEndTime,
    element.trimStart,
    element.trimEnd,
    element.duration,
    effectivePPS,
    thumbHeight,
  ]);

  // Generate cache key for dependency tracking
  const cacheKey = useMemo(() => {
    return `${element.src}-${viewportInfo.startTime.toFixed(2)}-${viewportInfo.endTime.toFixed(2)}-${viewportInfo.pixelsPerSecond.toFixed(0)}-${thumbHeight}`;
  }, [element.src, viewportInfo.startTime, viewportInfo.endTime, viewportInfo.pixelsPerSecond, thumbHeight]);

  useEffect(() => {
    // Wait for mode to be determined before generating thumbnails
    // This ensures we use the correct mode (basic vs compatible) for decoding
    if (currentMode === null || isModeLoading) {
      return;
    }

    // Skip if viewport hasn't changed significantly (debounce)
    if (lastViewportRef.current === cacheKey) {
      return;
    }
    lastViewportRef.current = cacheKey;

    // Use AbortController for proper cancellation
    const abortController = new AbortController();
    setIsLoading(true);

    // Use ThumbnailService for efficient thumbnail generation
    const service = getThumbnailService();

    // Use viewport-aware loading for pyramid thumbnails
    const viewport: ThumbnailViewport = {
      startTime: viewportInfo.startTime,
      endTime: viewportInfo.endTime,
      pixelsPerSecond: viewportInfo.pixelsPerSecond,
      height: viewportInfo.height,
    };

    service
      .getThumbnailsForViewport(element.src, viewport, { signal: abortController.signal })
      .then((result) => {
        if (!abortController.signal.aborted) {
          setThumbnails(result);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        // Ignore abort errors
        if (abortController.signal.aborted) return;
        console.warn('[MediaElementContent] Failed to generate thumbnails:', error);
        setThumbnails([]);
        setIsLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [cacheKey, element.src, viewportInfo, currentMode, isModeLoading]);

  // If no thumbnails yet, show element name
  if (isLoading || thumbnails.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
        <span className="text-xs text-white truncate select-none">
          {element.name}
        </span>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // Calculate thumbnail positions based on time
  // Each thumbnail has a time property, we need to position it correctly within the element
  const elementLocalDuration = element.duration - element.trimStart - element.trimEnd;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {thumbnails.map((thumb, index) => {
        // Calculate position based on thumbnail time relative to element
        const localTime = thumb.time - element.trimStart;
        const positionPercent = (localTime / elementLocalDuration) * 100;

        // Calculate width based on interval between thumbnails
        const nextThumb = thumbnails[index + 1];
        const interval = nextThumb
          ? nextThumb.time - thumb.time
          : thumbnails.length > 1
            ? thumb.time - (thumbnails[index - 1]?.time ?? 0)
            : elementLocalDuration;
        const widthPercent = (interval / elementLocalDuration) * 100;

        return (
          <div
            key={`${thumb.time}-${index}`}
            className="absolute h-full"
            style={{
              left: `${Math.max(0, positionPercent)}%`,
              width: `${Math.min(100 - positionPercent, widthPercent)}%`,
            }}
          >
            <img
              src={thumb.dataUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: 'center' }}
            />
          </div>
        );
      })}
      {/* Overlay with element name */}
      <div className="absolute inset-0 flex items-end p-1 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-[10px] text-white truncate select-none drop-shadow-sm">
          {element.name}
        </span>
      </div>
      {/* Muted indicator */}
      {element.muted && (
        <div className="absolute top-1 right-1 p-0.5 bg-black/50 rounded">
          <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  );
});

// TextElementContent - memoized for performance
const TextElementContent = memo(function TextElementContent({ element }: { element: TextElement }) {
  return (
    <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] text-white/60 truncate select-none">
          {element.name}
        </span>
        <span
          className="text-xs truncate select-none"
          style={{
            color: element.color || '#ffffff',
            fontWeight: element.fontWeight || 'normal',
            fontStyle: element.fontStyle || 'normal',
          }}
        >
          {element.content}
        </span>
      </div>
    </div>
  );
});

// SubtitleElementContent - memoized for performance
const SubtitleElementContent = memo(function SubtitleElementContent({
  element,
}: {
  element: TimelineElement | AllTimelineElement;
}) {
  // Type guard to ensure we're working with a subtitle element
  if (element.type !== 'subtitle') {
    return null;
  }

  const subtitleElement = element as SubtitleElement;
  const firstCue = subtitleElement.cues?.[0];
  const displayText = firstCue?.text || element.name;

  // Subtitle elements display with a distinctive purple theme
  return (
    <div className="absolute inset-0 flex items-center overflow-hidden pointer-events-none bg-purple-800/70">
      {/* Subtitle icon */}
      <div className="flex items-center gap-1.5 px-2 min-w-0">
        <svg className="w-4 h-4 text-purple-300 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path d="M18 3H2c-.55 0-1 .45-1 1v12c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zm-1 12H3V5h14v10zM4 12h2v2H4v-2zm0-3h8v2H4V9zm10 3h2v2h-2v-2zm-4 0h3v2h-3v-2z" />
        </svg>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] text-purple-200 truncate select-none">
            {element.name}
          </span>
          <span className="text-[9px] text-purple-300/80 truncate select-none">
            {displayText}
          </span>
        </div>
      </div>
      {/* Decorative subtitle lines */}
      <div className="absolute bottom-1 left-8 right-2 flex flex-col gap-0.5">
        <div className="h-0.5 bg-purple-400/40 rounded" style={{ width: '80%' }} />
        <div className="h-0.5 bg-purple-400/30 rounded" style={{ width: '60%' }} />
      </div>
    </div>
  );
});

// AudioElementContent - memoized for performance with viewport awareness
const AudioElementContent = memo(function AudioElementContent({
  element,
  width,
  height,
  pixelsPerSecond,
  zoomLevel,
  visibleRange,
}: {
  element: AudioElement;
  width: number;
  height: number;
  pixelsPerSecond?: number;
  zoomLevel?: number;
  visibleRange?: VisibleRange;
}) {
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [uriCacheVersion, setUriCacheVersion] = useState(0);
  const lastViewportRef = useRef<string>('');

  // Subscribe to URI cache updates to trigger re-render
  useEffect(() => {
    return subscribeToUriCacheUpdates(() => {
      setUriCacheVersion(v => v + 1);
    });
  }, []);

  // Calculate element's time range
  const elementStartTime = element.startTime;
  const elementDuration = element.duration - element.trimStart - element.trimEnd;
  const elementEndTime = elementStartTime + elementDuration;

  // Calculate effective pixels per second (with zoom)
  const effectivePPS = (pixelsPerSecond ?? 50) * (zoomLevel ?? 1);

  // Calculate bar count based on width (for rendering)
  const barCount = Math.max(10, Math.floor(width / 4));

  // Calculate viewport intersection with element
  const viewportInfo = useMemo(() => {
    if (!visibleRange) {
      // Fallback: use element's full range
      return {
        startTime: element.trimStart,
        endTime: element.duration - element.trimEnd,
        pixelsPerSecond: effectivePPS,
      };
    }

    // Calculate intersection between visible range and element
    const visibleStart = Math.max(visibleRange.startTime, elementStartTime);
    const visibleEnd = Math.min(visibleRange.endTime, elementEndTime);

    // Convert to element-local time (relative to trimStart)
    const localStart = Math.max(0, visibleStart - elementStartTime + element.trimStart);
    const localEnd = Math.min(
      element.duration - element.trimEnd,
      visibleEnd - elementStartTime + element.trimStart
    );

    return {
      startTime: localStart,
      endTime: localEnd,
      pixelsPerSecond: effectivePPS,
    };
  }, [
    visibleRange?.startTime,
    visibleRange?.endTime,
    elementStartTime,
    elementEndTime,
    element.trimStart,
    element.trimEnd,
    element.duration,
    effectivePPS,
  ]);

  // Generate cache key for dependency tracking
  const cacheKey = useMemo(() => {
    return `${element.src}-${viewportInfo.startTime.toFixed(2)}-${viewportInfo.endTime.toFixed(2)}-${viewportInfo.pixelsPerSecond.toFixed(0)}`;
  }, [element.src, viewportInfo.startTime, viewportInfo.endTime, viewportInfo.pixelsPerSecond]);

  // Generate placeholder bars for initial/fallback display
  const placeholderBars = useMemo(() => {
    const seed = element.src.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: barCount }, (_, i) => {
      const noise = Math.sin(seed + i * 0.5) * 0.5 + 0.5;
      const wave = Math.sin(i * 0.3) * 0.3 + 0.5;
      return Math.max(0.1, Math.min(1, noise * wave + 0.2));
    });
  }, [element.src, barCount]);

  // Load real waveform data with viewport awareness
  useEffect(() => {
    if (!element.src) {
      setIsLoading(false);
      return;
    }

    // Check if webview URI is available
    const uri = getCachedFileUri(element.src);
    if (!uri) {
      // URI not cached yet, keep loading state - will retry when cache updates
      setIsLoading(true);
      return;
    }

    // Skip if viewport hasn't changed significantly (debounce)
    if (lastViewportRef.current === cacheKey) {
      return;
    }
    lastViewportRef.current = cacheKey;

    let cancelled = false;
    setIsLoading(true);

    const loadWaveform = async () => {
      try {
        // Use viewport-aware waveform generation
        const viewport: WaveformViewport = {
          startTime: viewportInfo.startTime,
          endTime: viewportInfo.endTime,
          pixelsPerSecond: viewportInfo.pixelsPerSecond,
        };

        const waveformData = await generateWaveformForViewport(element.src, viewport);

        if (!cancelled) {
          // Resample to bar count for rendering
          const resampledPeaks = resampleWaveformPeaks(waveformData.peaks, barCount);
          setWaveformPeaks(resampledPeaks);
          setIsLoading(false);
        }
      } catch (error) {
        console.warn('Failed to load audio waveform:', error);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, element.src, viewportInfo, barCount, uriCacheVersion]);

  // Use real waveform if available, otherwise placeholder
  const bars = waveformPeaks || placeholderBars;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ backgroundColor: 'rgba(20, 83, 45, 0.7)' }}>
      {/* Waveform visualization */}
      <div
        className="absolute inset-0 flex items-center justify-around px-1"
        style={{ gap: '1px' }}
      >
        {bars.map((barHeight, index) => (
          <div
            key={index}
            style={{
              width: `${Math.max(2, (width - 8) / barCount - 1)}px`,
              height: `${Math.max(4, barHeight * (height - 12))}px`,
              backgroundColor: waveformPeaks ? '#86efac' : 'rgba(134, 239, 172, 0.6)',
              borderRadius: '1px',
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-1 left-1 p-0.5 bg-black/50 rounded">
          <div className="w-3 h-3 border border-green-400/50 border-t-green-400 rounded-full animate-spin" />
        </div>
      )}
      {/* Element name overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-0.5 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-[10px] text-white truncate select-none drop-shadow-sm">
          {element.name}
        </span>
      </div>
      {/* Muted indicator */}
      {element.muted && (
        <div className="absolute top-1 right-1 p-0.5 bg-black/50 rounded">
          <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  );
});

// Simple color block for non-preview mode - memoized for performance
const SimpleElementContent = memo(function SimpleElementContent({
  element,
  trackType,
}: {
  element: TimelineElement | AllTimelineElement;
  trackType?: TrackType;
}) {
  // Color scheme based on element/track type
  const getBackgroundColor = () => {
    if (trackType === 'audio' || element.type === 'audio') {
      return 'bg-green-700/80'; // Green for audio
    }
    if (trackType === 'subtitle') {
      return 'bg-purple-700/80'; // Purple for subtitles
    }
    if (trackType === 'text' || element.type === 'text') {
      return 'bg-yellow-700/80'; // Yellow for text
    }
    if (trackType === 'shape' || element.type === 'shape') {
      return 'bg-cyan-700/80'; // Cyan for shapes
    }
    // Media - check if video or image
    if ('src' in element) {
      const ext = (element as MediaElement).src.toLowerCase().split('.').pop() || '';
      const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
      if (imageExtensions.includes(ext)) {
        return 'bg-amber-700/80'; // Amber for images
      }
    }
    return 'bg-blue-700/80'; // Blue for video
  };

  return (
    <div className={`absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none ${getBackgroundColor()}`}>
      <span className="text-xs text-white truncate select-none drop-shadow-sm">
        {element.name}
      </span>
      {/* Muted indicator for media/audio */}
      {'muted' in element && element.muted && (
        <div className="absolute top-1 right-1 p-0.5 bg-black/50 rounded">
          <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  );
});

// Main component - memoized for performance
export const TimelineElementContent = memo(function TimelineElementContent({
  element,
  width,
  height,
  trackType,
  showThumbnails = true,
  pixelsPerSecond,
  zoomLevel,
  visibleRange,
}: TimelineElementContentProps) {
  // If thumbnails are disabled, show simple color blocks
  if (!showThumbnails) {
    return <SimpleElementContent element={element} trackType={trackType} />;
  }

  // Shape track or shape element
  if (trackType === 'shape' || element.type === 'shape') {
    return (
      <ShapeElementContent
        element={element as ShapeElement}
        width={width}
        height={height}
      />
    );
  }

  // Subtitle track
  if (trackType === 'subtitle') {
    return <SubtitleElementContent element={element} />;
  }

  // Use trackType to determine rendering (audio track = show waveform)
  if (trackType === 'audio' && 'src' in element) {
    return (
      <AudioElementContent
        element={element as AudioElement}
        width={width}
        height={height}
        pixelsPerSecond={pixelsPerSecond}
        zoomLevel={zoomLevel}
        visibleRange={visibleRange}
      />
    );
  }

  if (trackType === 'text' || element.type === 'text') {
    return <TextElementContent element={element as TextElement} />;
  }

  // Default: media track or media element
  if ('src' in element) {
    return (
      <MediaElementContent
        element={element as MediaElement}
        width={width}
        height={height}
        pixelsPerSecond={pixelsPerSecond}
        zoomLevel={zoomLevel}
        visibleRange={visibleRange}
      />
    );
  }

  // Fallback for unknown types
  const unknownElement = element as TimelineElement;
  return (
    <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
      <span className="text-xs text-white truncate select-none">
        {unknownElement.name}
      </span>
    </div>
  );
});
