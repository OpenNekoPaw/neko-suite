/**
 * TransitionPicker Component
 * 转场选择器组件 - 用于选择和配置转场效果
 */

import { memo, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { Transition, EasingType } from '../../types';
import {
  TRANSITION_PRESETS,
  createTransitionFromPreset,
  type TransitionPreset,
} from '../../types/transition';

// =============================================================================
// Types
// =============================================================================

interface TransitionPickerProps {
  /** Current transition */
  transition: Transition | null;
  /** Callback when transition changes */
  onChange: (transition: Transition | null) => void;
  /** Whether to show duration control */
  showDuration?: boolean;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

// =============================================================================
// EasingType Options (for the dropdown)
// =============================================================================

const EASING_OPTIONS: { value: EasingType; labelKey: string }[] = [
  { value: 'linear', labelKey: 'animation.easing.linear' },
  { value: 'ease-in', labelKey: 'animation.easing.easeIn' },
  { value: 'ease-out', labelKey: 'animation.easing.easeOut' },
  { value: 'ease-in-out', labelKey: 'animation.easing.easeInOut' },
  { value: 'ease-in-cubic', labelKey: 'animation.easing.easeInCubic' },
  { value: 'ease-out-cubic', labelKey: 'animation.easing.easeOutCubic' },
  { value: 'ease-in-out-cubic', labelKey: 'animation.easing.easeInOutCubic' },
];

// =============================================================================
// TransitionPresetCard Component
// =============================================================================

interface TransitionPresetCardProps {
  preset: TransitionPreset;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const TransitionPresetCard = memo(function TransitionPresetCard({
  preset,
  isSelected,
  onClick,
  disabled,
}: TransitionPresetCardProps) {
  const { t } = useTranslation();

  return (
    <button
      className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${
        isSelected
          ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
          : 'border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)]'
      } disabled:opacity-50 disabled:cursor-not-allowed min-w-[60px]`}
      onClick={onClick}
      disabled={disabled}
      title={t(preset.i18nKey)}
    >
      <span className="text-lg mb-1">{preset.icon}</span>
      <span className="text-[9px] text-[var(--vscode-foreground)] truncate max-w-full">
        {t(preset.i18nKey)}
      </span>
    </button>
  );
});

// =============================================================================
// NoneTransitionCard Component
// =============================================================================

interface NoneTransitionCardProps {
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const NoneTransitionCard = memo(function NoneTransitionCard({
  isSelected,
  onClick,
  disabled,
}: NoneTransitionCardProps) {
  const { t } = useTranslation();

  return (
    <button
      className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${
        isSelected
          ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
          : 'border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)]'
      } disabled:opacity-50 disabled:cursor-not-allowed min-w-[60px]`}
      onClick={onClick}
      disabled={disabled}
      title={t('transition.type.none')}
    >
      <span className="text-lg mb-1">✕</span>
      <span className="text-[9px] text-[var(--vscode-foreground)]">
        {t('transition.type.none')}
      </span>
    </button>
  );
});

// =============================================================================
// DurationControl Component
// =============================================================================

interface DurationControlProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const DurationControl = memo(function DurationControl({
  value,
  onChange,
  disabled,
}: DurationControlProps) {
  const { t } = useTranslation();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue) && newValue > 0) {
        onChange(newValue);
      }
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-[var(--vscode-descriptionForeground)] w-16 shrink-0">
        {t('transition.duration')}
      </label>
      <input
        type="range"
        min="0.1"
        max="2"
        step="0.1"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="flex-1 h-1 accent-[var(--vscode-button-background)]"
      />
      <span className="text-[10px] text-[var(--vscode-foreground)] w-10 text-right font-mono">
        {value.toFixed(1)}s
      </span>
    </div>
  );
});

// =============================================================================
// EasingControl Component
// =============================================================================

interface EasingControlProps {
  value: EasingType;
  onChange: (value: EasingType) => void;
  disabled?: boolean;
}

const EasingControl = memo(function EasingControl({
  value,
  onChange,
  disabled,
}: EasingControlProps) {
  const { t } = useTranslation();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value as EasingType);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-[var(--vscode-descriptionForeground)] w-16 shrink-0">
        {t('transition.easing')}
      </label>
      <select
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="flex-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded px-2 py-1 text-[11px] outline-none focus:border-[var(--vscode-focusBorder)] disabled:opacity-50"
      >
        {EASING_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
});

// =============================================================================
// Main TransitionPicker Component
// =============================================================================

export const TransitionPicker = memo(function TransitionPicker({
  transition,
  onChange,
  showDuration = true,
  disabled = false,
}: TransitionPickerProps) {
  const { t } = useTranslation();

  // Handle preset selection
  const handlePresetSelect = useCallback(
    (preset: TransitionPreset) => {
      const newTransition = createTransitionFromPreset(preset);
      // Preserve existing duration if we have one
      if (transition?.duration) {
        newTransition.duration = transition.duration;
      }
      onChange(newTransition);
    },
    [transition, onChange],
  );

  // Handle remove transition
  const handleRemoveTransition = useCallback(() => {
    onChange(null);
  }, [onChange]);

  // Handle duration change
  const handleDurationChange = useCallback(
    (duration: number) => {
      if (transition) {
        onChange({
          ...transition,
          duration,
        });
      }
    },
    [transition, onChange],
  );

  // Handle easing change
  const handleEasingChange = useCallback(
    (easing: EasingType) => {
      if (transition) {
        onChange({
          ...transition,
          easing,
        });
      }
    },
    [transition, onChange],
  );

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Title */}
      <h3 className="text-[12px] font-medium text-[var(--vscode-foreground)]">
        {t('transition.selectTransition')}
      </h3>

      {/* Transition Grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {/* None option */}
        <NoneTransitionCard
          isSelected={!transition}
          onClick={handleRemoveTransition}
          disabled={disabled}
        />

        {/* Preset options */}
        {TRANSITION_PRESETS.map((preset) => (
          <TransitionPresetCard
            key={preset.type}
            preset={preset}
            isSelected={transition?.type === preset.type}
            onClick={() => handlePresetSelect(preset)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Duration & Easing Controls (only show when a transition is selected) */}
      {transition && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--vscode-panel-border)]">
          {showDuration && (
            <DurationControl
              value={transition.duration}
              onChange={handleDurationChange}
              disabled={disabled}
            />
          )}
          <EasingControl
            value={transition.easing}
            onChange={handleEasingChange}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
});

export default TransitionPicker;
