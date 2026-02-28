/**
 * MediaDiffViewer Component
 * Main coordinator — dispatches to type-specific viewers based on media type
 */

import { memo, useState, useCallback } from 'react';
import type { DiffViewMode, MediaType } from '@neko/shared';
import type { MediaDiffViewerProps } from './types';
import { DiffControls } from './DiffControls';
import { ImageDiffViewer } from './ImageDiffViewer';
import { VideoDiffViewer } from './VideoDiffViewer';
import { AudioDiffViewer } from './AudioDiffViewer';
import { TimelineDiffViewer } from './TimelineDiffViewer';

// =============================================================================
// Header Component
// =============================================================================

interface DiffHeaderProps {
  filePath?: string;
  gitRef?: string;
  mediaType?: MediaType;
}

const DiffHeader = memo(function DiffHeader({
  filePath,
  gitRef,
  mediaType,
}: DiffHeaderProps) {
  const getMediaTypeIcon = () => {
    switch (mediaType) {
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'timeline': return '🎞️';
      default: return '📄';
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[var(--vscode-titleBar-activeBackground)] text-[var(--vscode-titleBar-activeForeground)] border-b border-[var(--vscode-panel-border)]">
      <span className="text-lg">{getMediaTypeIcon()}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{filePath || 'Unknown File'}</div>
        <div className="text-xs text-[var(--vscode-descriptionForeground)]">
          Comparing with {gitRef || 'HEAD'}
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Main MediaDiffViewer Component
// =============================================================================

export const MediaDiffViewer = memo(function MediaDiffViewer({
  diffResult,
  currentSrc,
  previousSrc,
  heatmapSrc,
  currentFrameSrc,
  previousFrameSrc,
  currentWaveform,
  previousWaveform,
  elementThumbnails,
  isLoading,
  error,
  gitRef,
  filePath,
  streamConfig,
  onTimeChange,
  onInspectElement,
  onStreamControl,
  audioStreamConfig,
  onAudioStreamControl,
}: MediaDiffViewerProps) {
  const [viewMode, setViewMode] = useState<DiffViewMode>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(0.5);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [playingVersion, setPlayingVersion] = useState<'current' | 'previous' | 'both'>('current');

  const mediaType = diffResult?.mediaType ?? 'image';

  const handleViewModeChange = useCallback((mode: DiffViewMode) => {
    setViewMode(mode);
  }, []);

  const handleTimeChange = useCallback(
    (time: number) => {
      setCurrentTime(time);
      onTimeChange?.(time);
    },
    [onTimeChange]
  );

  const renderViewer = () => {
    switch (mediaType) {
      case 'image':
        return (
          <ImageDiffViewer
            viewMode={viewMode}
            currentSrc={currentSrc}
            previousSrc={previousSrc}
            details={diffResult?.details as any}
            heatmapSrc={heatmapSrc}
            sliderPosition={sliderPosition}
            onSliderChange={setSliderPosition}
            overlayOpacity={overlayOpacity}
            onOpacityChange={setOverlayOpacity}
            zoom={zoom}
            onZoomChange={setZoom}
            isLoading={isLoading}
            error={error}
          />
        );

      case 'video':
        return (
          <VideoDiffViewer
            viewMode={viewMode}
            currentSrc={currentSrc}
            previousSrc={previousSrc}
            details={diffResult?.details as any}
            currentFrameSrc={currentFrameSrc}
            previousFrameSrc={previousFrameSrc}
            currentTime={currentTime}
            onTimeChange={handleTimeChange}
            sliderPosition={sliderPosition}
            onSliderChange={setSliderPosition}
            streamConfig={streamConfig}
            onStreamControl={onStreamControl}
            isLoading={isLoading}
            error={error}
          />
        );

      case 'audio':
        return (
          <AudioDiffViewer
            viewMode={viewMode}
            currentSrc={currentSrc}
            previousSrc={previousSrc}
            details={diffResult?.details as any}
            currentWaveform={currentWaveform}
            previousWaveform={previousWaveform}
            currentTime={currentTime}
            onTimeChange={handleTimeChange}
            playingVersion={playingVersion}
            onPlayingVersionChange={setPlayingVersion}
            audioStreamConfig={audioStreamConfig}
            onAudioStreamControl={onAudioStreamControl}
            isLoading={isLoading}
            error={error}
          />
        );

      case 'timeline':
        return (
          <TimelineDiffViewer
            details={diffResult?.details as any}
            onInspectElement={onInspectElement}
            elementThumbnails={elementThumbnails}
          />
        );

      default:
        return (
          <div className="flex-1 flex items-center justify-center text-[var(--vscode-descriptionForeground)]">
            Unsupported media type
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--vscode-editor-background)]">
      <DiffHeader filePath={filePath} gitRef={gitRef} mediaType={mediaType} />
      <DiffControls
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        similarity={diffResult?.similarity}
        mediaType={mediaType}
        isLoading={isLoading}
        zoom={mediaType === 'image' ? zoom : undefined}
        onZoomChange={mediaType === 'image' ? setZoom : undefined}
        opacity={viewMode === 'overlay' ? overlayOpacity : undefined}
        onOpacityChange={viewMode === 'overlay' ? setOverlayOpacity : undefined}
      />
      {renderViewer()}
    </div>
  );
});

export default MediaDiffViewer;
