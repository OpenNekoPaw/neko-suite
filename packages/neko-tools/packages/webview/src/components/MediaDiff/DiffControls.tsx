/**
 * DiffControls Component
 * View mode switching and control panel
 */

import { memo, useState, useCallback } from 'react';
import type { DiffViewMode } from '@neko/shared';
import { useTranslation } from '../../i18n/I18nContext';
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
      className={`${isActive ? 'tools-button' : 'tools-button-secondary'} px-3 py-1.5 text-xs font-medium ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
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

const SimilarityBadge = memo(function SimilarityBadge({ similarity }: SimilarityBadgeProps) {
  const { t } = useTranslation();
  // Files are identical
  if (similarity >= 1.0) {
    return (
      <div className="tools-pill px-3 py-1.5">
        <span className="text-sm font-bold text-green-400">{t('mediaDiff.identical')}</span>
      </div>
    );
  }

  const percentage = Math.round(similarity * 100);

  let colorClass = 'text-red-400';
  if (percentage >= 90) colorClass = 'text-green-400';
  else if (percentage >= 70) colorClass = 'text-yellow-400';
  else if (percentage >= 50) colorClass = 'text-orange-400';

  return (
    <div className="tools-pill px-3 py-1.5">
      <span className="text-xs text-[var(--tools-fg-secondary)]">{t('mediaDiff.similarity')}</span>
      <span className={`text-sm font-bold ${colorClass}`}>{percentage}%</span>
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
      <span className="min-w-[60px] text-xs text-[var(--tools-fg-secondary)]">{label}:</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="tools-range h-1 w-24 cursor-pointer appearance-none rounded-lg bg-[var(--tools-elevated)]"
      />
      <span className="min-w-[40px] text-right text-xs text-[var(--tools-fg)]">
        {formatValue ? formatValue(value) : value.toFixed(0)}
      </span>
    </div>
  );
});

// =============================================================================
// Time Range Control
// =============================================================================

/** Format seconds as m:ss.s */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Parse time string (m:ss.s or plain seconds) to seconds */
function parseTime(input: string): number | null {
  const trimmed = input.trim();
  // Try m:ss.s format
  const colonMatch = trimmed.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (colonMatch) {
    return parseInt(colonMatch[1]!, 10) * 60 + parseFloat(colonMatch[2]!);
  }
  // Try plain seconds
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

interface TimeRangeControlProps {
  duration: number;
  isLoading?: boolean;
  onApply: (startTime?: number, endTime?: number) => void;
}

const TimeRangeControl = memo(function TimeRangeControl({
  duration,
  isLoading,
  onApply,
}: TimeRangeControlProps) {
  const { t } = useTranslation();
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [isActive, setIsActive] = useState(false);

  const handleApply = useCallback(() => {
    const start = startInput ? parseTime(startInput) : undefined;
    const end = endInput ? parseTime(endInput) : undefined;

    // Validate
    if (start !== undefined && start !== null && start < 0) return;
    if (end !== undefined && end !== null && end > duration) return;
    if (start !== null && end !== null && start !== undefined && end !== undefined && start >= end)
      return;

    setIsActive(true);
    onApply(start !== null ? start : undefined, end !== null ? end : undefined);
  }, [startInput, endInput, duration, onApply]);

  const handleReset = useCallback(() => {
    setStartInput('');
    setEndInput('');
    setIsActive(false);
    onApply(undefined, undefined);
  }, [onApply]);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[var(--tools-fg-secondary)]">{t('mediaDiff.range')}</span>
      <input
        type="text"
        placeholder={formatTime(0)}
        value={startInput}
        onChange={(e) => setStartInput(e.target.value)}
        className="tools-input w-14 px-1 py-0.5 text-center text-xs"
        title={t('mediaDiff.startTimeHint')}
      />
      <span className="text-xs text-[var(--tools-fg-secondary)]">–</span>
      <input
        type="text"
        placeholder={formatTime(duration)}
        value={endInput}
        onChange={(e) => setEndInput(e.target.value)}
        className="tools-input w-14 px-1 py-0.5 text-center text-xs"
        title={t('mediaDiff.endTimeHint')}
      />
      <button
        type="button"
        onClick={handleApply}
        disabled={isLoading}
        className={`${isLoading ? 'tools-button-secondary opacity-50' : 'tools-button'} px-2 py-0.5 text-xs font-medium`}
        title={t('mediaDiff.applyRange')}
      >
        {t('mediaDiff.apply')}
      </button>
      {isActive && (
        <button
          type="button"
          onClick={handleReset}
          disabled={isLoading}
          className="px-1.5 py-0.5 text-xs text-[var(--tools-fg-secondary)] transition-colors hover:text-[var(--tools-fg)]"
          title={t('mediaDiff.resetRange')}
        >
          {t('mediaDiff.reset')}
        </button>
      )}
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
  duration,
  onSetTimeRange,
}: DiffControlsProps) {
  const { t } = useTranslation();
  const viewModes: { mode: DiffViewMode; label: string; icon: string }[] = [
    { mode: 'side-by-side', label: t('mediaDiff.viewMode.sideBySide'), icon: '⬜⬜' },
    { mode: 'slider', label: t('mediaDiff.viewMode.slider'), icon: '↔️' },
    { mode: 'overlay', label: t('mediaDiff.viewMode.overlay'), icon: '🔲' },
  ];

  if (mediaType === 'image') {
    viewModes.push({ mode: 'onion-skin', label: t('mediaDiff.viewMode.onionSkin'), icon: '🧅' });
  }

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--tools-divider)] bg-[var(--tools-bg)] p-3">
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

      <div className="tools-divider-v" />

      {similarity !== undefined && <SimilarityBadge similarity={similarity} />}

      {mediaType === 'image' && zoom !== undefined && onZoomChange && (
        <>
          <div className="tools-divider-v" />
          <SliderControl
            label={t('mediaDiff.zoom')}
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
          <div className="tools-divider-v" />
          <SliderControl
            label={t('mediaDiff.opacity')}
            value={opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={onOpacityChange}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </>
      )}

      {(mediaType === 'video' || mediaType === 'audio') &&
        duration !== undefined &&
        duration > 0 &&
        onSetTimeRange && (
          <>
            <div className="tools-divider-v" />
            <TimeRangeControl duration={duration} isLoading={isLoading} onApply={onSetTimeRange} />
          </>
        )}

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-[var(--tools-fg-secondary)]">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>{t('mediaDiff.analyzing')}</span>
        </div>
      )}
    </div>
  );
});
