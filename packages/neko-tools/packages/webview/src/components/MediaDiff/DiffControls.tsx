/**
 * DiffControls Component
 * View mode switching and control panel
 */

import { memo } from 'react';
import type { DiffViewMode } from '@neko/shared';
import type { DiffControlsProps } from './types';

// =============================================================================
// View Mode Button
// =============================================================================

interface ViewModeButtonProps {
  mode: DiffViewMode;
  currentMode: DiffViewMode;
  label: string;
  icon: string;
  onClick: (mode: DiffViewMode) => void;
  disabled?: boolean;
}

const ViewModeButton = memo(function ViewModeButton({
  mode,
  currentMode,
  label,
  icon,
  onClick,
  disabled,
}: ViewModeButtonProps) {
  const isActive = mode === currentMode;

  return (
    <button
      type="button"
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium
        transition-colors duration-150
        ${
          isActive
            ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
            : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      onClick={() => !disabled && onClick(mode)}
      disabled={disabled}
      title={label}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
});

// =============================================================================
// Similarity Badge
// =============================================================================

interface SimilarityBadgeProps {
  similarity: number;
}

const SimilarityBadge = memo(function SimilarityBadge({
  similarity,
}: SimilarityBadgeProps) {
  const percentage = Math.round(similarity * 100);

  let colorClass = 'text-red-400';
  if (percentage >= 90) colorClass = 'text-green-400';
  else if (percentage >= 70) colorClass = 'text-yellow-400';
  else if (percentage >= 50) colorClass = 'text-orange-400';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--vscode-input-background)] rounded">
      <span className="text-xs text-[var(--vscode-descriptionForeground)]">
        Similarity:
      </span>
      <span className={`text-sm font-bold ${colorClass}`}>
        {percentage}%
      </span>
    </div>
  );
});

// =============================================================================
// Slider Control
// =============================================================================

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

const SliderControl = memo(function SliderControl({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  formatValue,
}: SliderControlProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--vscode-descriptionForeground)] min-w-[60px]">
        {label}:
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24 h-1 bg-[var(--vscode-input-background)] rounded-lg appearance-none cursor-pointer"
      />
      <span className="text-xs text-[var(--vscode-foreground)] min-w-[40px] text-right">
        {formatValue ? formatValue(value) : value.toFixed(0)}
      </span>
    </div>
  );
});

// =============================================================================
// Main DiffControls Component
// =============================================================================

export const DiffControls = memo(function DiffControls({
  viewMode,
  onViewModeChange,
  similarity,
  mediaType,
  isLoading,
  zoom,
  onZoomChange,
  opacity,
  onOpacityChange,
}: DiffControlsProps) {
  const viewModes: { mode: DiffViewMode; label: string; icon: string }[] = [
    { mode: 'side-by-side', label: 'Side by Side', icon: '⬜⬜' },
    { mode: 'slider', label: 'Slider', icon: '↔️' },
    { mode: 'overlay', label: 'Overlay', icon: '🔲' },
  ];

  if (mediaType === 'image') {
    viewModes.push({ mode: 'onion-skin', label: 'Onion Skin', icon: '🧅' });
  }

  return (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-panel-border)]">
      {/* View Mode Buttons */}
      <div className="flex items-center gap-1">
        {viewModes.map(({ mode, label, icon }) => (
          <ViewModeButton
            key={mode}
            mode={mode}
            currentMode={viewMode}
            label={label}
            icon={icon}
            onClick={onViewModeChange}
            disabled={isLoading}
          />
        ))}
      </div>

      <div className="w-px h-6 bg-[var(--vscode-panel-border)]" />

      {similarity !== undefined && <SimilarityBadge similarity={similarity} />}

      {mediaType === 'image' && zoom !== undefined && onZoomChange && (
        <>
          <div className="w-px h-6 bg-[var(--vscode-panel-border)]" />
          <SliderControl
            label="Zoom"
            value={zoom}
            min={0.1}
            max={4}
            step={0.1}
            onChange={onZoomChange}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </>
      )}

      {viewMode === 'overlay' && opacity !== undefined && onOpacityChange && (
        <>
          <div className="w-px h-6 bg-[var(--vscode-panel-border)]" />
          <SliderControl
            label="Opacity"
            value={opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={onOpacityChange}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-[var(--vscode-descriptionForeground)]">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Analyzing...</span>
        </div>
      )}
    </div>
  );
});

export default DiffControls;
