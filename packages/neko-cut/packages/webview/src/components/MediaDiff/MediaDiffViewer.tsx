/**
 * MediaDiffViewer Component
 * 主媒体对比查看器 - 根据媒体类型自动选择对应的查看器
 */

import { memo, useState, useCallback } from 'react';
import type { DiffViewMode, MediaType } from '@neko/shared';
import type { MediaDiffViewerProps } from './types';
import { DiffControls } from './DiffControls';
import { ImageDiffViewer } from './ImageDiffViewer';
import { VideoDiffViewer } from './VideoDiffViewer';
import { AudioDiffViewer } from './AudioDiffViewer';

// =============================================================================
// Header Component
// =============================================================================

interface DiffHeaderProps {
  filePath?: string;
  gitRef?: string;
  mediaType?: MediaType;
}

const DiffHeader = memo(function DiffHeader({ filePath, gitRef, mediaType }: DiffHeaderProps) {
  const getMediaTypeIcon = () => {
    switch (mediaType) {
      case 'image':
        return '🖼️';
      case 'video':
        return '🎬';
      case 'audio':
        return '🎵';
      case 'timeline':
        return '🎞️';
      default:
        return '📄';
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
  isLoading,
  error,
  gitRef,
  filePath,
}: MediaDiffViewerProps) {
  // Local state for diff controls
  const [viewMode, setViewMode] = useState<DiffViewMode>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(0.5);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingVersion, setPlayingVersion] = useState<'current' | 'previous' | 'both'>('current');

  const mediaType = diffResult?.mediaType ?? 'image';

  const handleViewModeChange = useCallback((mode: DiffViewMode) => {
    setViewMode(mode);
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Render appropriate viewer based on media type
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
            currentTime={currentTime}
            onTimeChange={setCurrentTime}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            sliderPosition={sliderPosition}
            onSliderChange={setSliderPosition}
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
            currentWaveform={diffResult?.visualization?.currentWaveform}
            previousWaveform={diffResult?.visualization?.previousWaveform}
            currentTime={currentTime}
            onTimeChange={setCurrentTime}
            playingVersion={playingVersion}
            onPlayingVersionChange={setPlayingVersion}
            isLoading={isLoading}
            error={error}
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
      {/* Header */}
      <DiffHeader filePath={filePath} gitRef={gitRef} mediaType={mediaType} />

      {/* Controls */}
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

      {/* Viewer */}
      {renderViewer()}
    </div>
  );
});

export default MediaDiffViewer;
