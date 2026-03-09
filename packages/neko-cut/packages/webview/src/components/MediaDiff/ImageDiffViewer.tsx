/**
 * ImageDiffViewer Component
 * 图片对比查看器 - 支持多种对比模式
 */

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import type { ImageDiffDetails } from '@neko/shared';
import type { ImageDiffViewerProps } from './types';

// =============================================================================
// Side-by-Side View
// =============================================================================

interface SideBySideViewProps {
  currentSrc: string;
  previousSrc: string;
  zoom: number;
}

const SideBySideView = memo(function SideBySideView({
  currentSrc,
  previousSrc,
  zoom,
}: SideBySideViewProps) {
  return (
    <div className="flex flex-1 gap-2 p-2 overflow-auto">
      {/* Previous Version */}
      <div className="flex-1 flex flex-col items-center">
        <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-2 font-medium">
          Previous (HEAD)
        </div>
        <div className="flex-1 flex items-center justify-center overflow-auto bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)]">
          <img
            src={previousSrc}
            alt="Previous version"
            className="max-w-full max-h-full object-contain"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
            draggable={false}
          />
        </div>
      </div>

      {/* Current Version */}
      <div className="flex-1 flex flex-col items-center">
        <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-2 font-medium">
          Current (Working)
        </div>
        <div className="flex-1 flex items-center justify-center overflow-auto bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)]">
          <img
            src={currentSrc}
            alt="Current version"
            className="max-w-full max-h-full object-contain"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Slider View
// =============================================================================

interface SliderViewProps {
  currentSrc: string;
  previousSrc: string;
  sliderPosition: number;
  onSliderChange: (position: number) => void;
  zoom: number;
}

const SliderView = memo(function SliderView({
  currentSrc,
  previousSrc,
  sliderPosition,
  onSliderChange,
  zoom,
}: SliderViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      onSliderChange(Math.max(0, Math.min(1, x)));
    },
    [isDragging, onSliderChange],
  );

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 m-2 overflow-hidden bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)] cursor-col-resize select-none"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      {/* Previous image (full) */}
      <img
        src={previousSrc}
        alt="Previous version"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
        draggable={false}
      />

      {/* Current image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${(1 - sliderPosition) * 100}% 0 0)` }}
      >
        <img
          src={currentSrc}
          alt="Current version"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          draggable={false}
        />
      </div>

      {/* Slider handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-col-resize z-10"
        style={{ left: `${sliderPosition * 100}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center">
          <span className="text-black text-xs">↔</span>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
        Previous
      </div>
      <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
        Current
      </div>
    </div>
  );
});

// =============================================================================
// Overlay View
// =============================================================================

interface OverlayViewProps {
  currentSrc: string;
  previousSrc: string;
  opacity: number;
  zoom: number;
}

const OverlayView = memo(function OverlayView({
  currentSrc,
  previousSrc,
  opacity,
  zoom,
}: OverlayViewProps) {
  return (
    <div className="relative flex-1 m-2 overflow-hidden bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)]">
      {/* Previous image (base) */}
      <img
        src={previousSrc}
        alt="Previous version"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
        draggable={false}
      />

      {/* Current image (overlay with opacity) */}
      <img
        src={currentSrc}
        alt="Current version"
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          opacity,
          transform: `scale(${zoom})`,
          transformOrigin: 'center',
        }}
        draggable={false}
      />

      {/* Opacity indicator */}
      <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
        Opacity: {Math.round(opacity * 100)}%
      </div>
    </div>
  );
});

// =============================================================================
// Onion Skin View (with heatmap)
// =============================================================================

interface OnionSkinViewProps {
  currentSrc: string;
  previousSrc: string;
  heatmapSrc?: string;
  zoom: number;
}

const OnionSkinView = memo(function OnionSkinView({
  currentSrc,
  previousSrc: _previousSrc,
  heatmapSrc,
  zoom,
}: OnionSkinViewProps) {
  const [showHeatmap, setShowHeatmap] = useState(true);

  return (
    <div className="relative flex-1 m-2 overflow-hidden bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)]">
      {/* Base image (current) */}
      <img
        src={currentSrc}
        alt="Current version"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
        draggable={false}
      />

      {/* Heatmap overlay */}
      {heatmapSrc && showHeatmap && (
        <img
          src={heatmapSrc}
          alt="Difference heatmap"
          className="absolute inset-0 w-full h-full object-contain mix-blend-multiply"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center',
            opacity: 0.7,
          }}
          draggable={false}
        />
      )}

      {/* Toggle button */}
      <button
        type="button"
        className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded hover:bg-black/70 transition-colors"
        onClick={() => setShowHeatmap(!showHeatmap)}
      >
        {showHeatmap ? 'Hide' : 'Show'} Heatmap
      </button>

      {/* Legend */}
      {showHeatmap && (
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded flex items-center gap-2">
          <span>Difference:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm" />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500 rounded-sm" />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm" />
            <span>High</span>
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Details Panel
// =============================================================================

interface ImageDetailsProps {
  details?: ImageDiffDetails;
}

const ImageDetails = memo(function ImageDetails({ details }: ImageDetailsProps) {
  if (!details) return null;

  // Extract dimensions from the ImageDiffDetails structure
  const { dimensions, pixelDifference } = details;

  return (
    <div className="p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        {/* Dimensions */}
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Dimensions</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {dimensions.previous.width}×{dimensions.previous.height}
            </span>
            <span>→</span>
            <span className="text-green-400">
              {dimensions.current.width}×{dimensions.current.height}
            </span>
          </div>
        </div>

        {/* Pixel Difference */}
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Pixel Difference</div>
          <div className="text-yellow-400">{(pixelDifference * 100).toFixed(2)}%</div>
        </div>

        {/* Structural Similarity */}
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Similarity</div>
          <div className="text-blue-400">{(details.structuralSimilarity * 100).toFixed(2)}%</div>
        </div>

        {/* Color Histogram Diff */}
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Color Diff</div>
          <div className="text-purple-400">{(details.colorHistogramDiff * 100).toFixed(2)}%</div>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Main ImageDiffViewer Component
// =============================================================================

export const ImageDiffViewer = memo(function ImageDiffViewer({
  viewMode,
  currentSrc,
  previousSrc,
  details,
  heatmapSrc,
  sliderPosition = 0.5,
  onSliderChange,
  overlayOpacity = 0.5,
  zoom = 1,
  isLoading,
  error,
}: ImageDiffViewerProps) {
  const handleSliderChange = useCallback(
    (position: number) => {
      onSliderChange?.(position);
    },
    [onSliderChange],
  );

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <div className="text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--vscode-button-background)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <div className="text-sm text-[var(--vscode-descriptionForeground)]">
            Loading images...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* View based on mode */}
      {viewMode === 'side-by-side' && (
        <SideBySideView currentSrc={currentSrc} previousSrc={previousSrc} zoom={zoom} />
      )}

      {viewMode === 'slider' && (
        <SliderView
          currentSrc={currentSrc}
          previousSrc={previousSrc}
          sliderPosition={sliderPosition}
          onSliderChange={handleSliderChange}
          zoom={zoom}
        />
      )}

      {viewMode === 'overlay' && (
        <OverlayView
          currentSrc={currentSrc}
          previousSrc={previousSrc}
          opacity={overlayOpacity}
          zoom={zoom}
        />
      )}

      {viewMode === 'onion-skin' && (
        <OnionSkinView
          currentSrc={currentSrc}
          previousSrc={previousSrc}
          heatmapSrc={heatmapSrc}
          zoom={zoom}
        />
      )}

      {/* Details Panel */}
      <ImageDetails details={details} />
    </div>
  );
});

export default ImageDiffViewer;
