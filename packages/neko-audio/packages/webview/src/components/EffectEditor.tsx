/**
 * EffectEditor - Dynamic parameter editor for a single audio effect
 *
 * Renders slider/select/boolean controls based on AudioEffectParameterDefinition.
 */

import { useCallback } from 'react';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, toCodiconClassName } from '@neko/ui/icons';
import type {
  AudioEffectInstance,
  AudioEffectParameterDefinition,
  AudioEffectParams,
} from '../types/audioEffects';
import { getAudioEffectDefinition } from '../types/audioEffects';
import { AudioIconButton, AudioSelect, AudioSlider } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

interface EffectEditorProps {
  effect: AudioEffectInstance;
  onUpdateParams: (id: string, params: Partial<AudioEffectParams>) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function readEffectParam(params: AudioEffectParams, key: string): unknown {
  return key in params ? params[key as keyof AudioEffectParams] : undefined;
}

export function EffectEditor({
  effect,
  onUpdateParams,
  onRemove,
  onToggle,
  onMoveUp,
  onMoveDown,
}: EffectEditorProps) {
  const definition = getAudioEffectDefinition(effect.type);
  if (!definition) return null;

  return (
    <div
      className={`border border-[var(--vscode-panel-border,#333)] rounded p-2 transition-opacity ${effect.enabled ? 'opacity-100' : 'opacity-50'}`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <AudioIconButton
          active={effect.enabled}
          className="h-5 w-5 text-[10px]"
          label={t('audio.effects.bypass')}
          onClick={() => onToggle(effect.id)}
          title={t('audio.effects.bypass')}
        >
          <span
            aria-hidden="true"
            className={toCodiconClassName(
              effect.enabled ? 'circle-large-filled' : 'circle-large-outline',
            )}
          />
        </AudioIconButton>
        <span className="flex-1 text-xs font-medium">{t(definition.nameKey) || effect.type}</span>
        {onMoveUp && (
          <AudioIconButton
            className="h-5 w-5 text-[10px]"
            label={t('audio.effects.moveUp')}
            onClick={onMoveUp}
          >
            <ChevronUpIcon className="h-3 w-3" />
          </AudioIconButton>
        )}
        {onMoveDown && (
          <AudioIconButton
            className="h-5 w-5 text-[10px]"
            label={t('audio.effects.moveDown')}
            onClick={onMoveDown}
          >
            <ChevronDownIcon className="h-3 w-3" />
          </AudioIconButton>
        )}
        <AudioIconButton
          className="h-5 w-5 text-[10px] text-[var(--status-error)]"
          label={t('audio.effects.remove')}
          onClick={() => onRemove(effect.id)}
          title={t('audio.effects.remove')}
        >
          <CloseIcon className="h-3 w-3" />
        </AudioIconButton>
      </div>

      {/* Parameters */}
      <div className="flex flex-col gap-1">
        {definition.parameterDefinitions.map((paramDef) => (
          <ParameterControl
            key={paramDef.key}
            paramDef={paramDef}
            value={readEffectParam(effect.params, paramDef.key)}
            onChange={(val) =>
              onUpdateParams(effect.id, { [paramDef.key]: val } as Partial<AudioEffectParams>)
            }
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Parameter Controls
// =============================================================================

interface ParameterControlProps {
  paramDef: AudioEffectParameterDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ParameterControl({ paramDef, value, onChange }: ParameterControlProps) {
  const handleSliderChange = useCallback((nextValue: number) => onChange(nextValue), [onChange]);

  const handleSelectChange = useCallback((nextValue: string) => onChange(nextValue), [onChange]);

  const handleBooleanChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange],
  );

  const label = t(paramDef.labelKey) || paramDef.key;

  switch (paramDef.type) {
    case 'slider':
      return (
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] min-w-[60px] max-w-[80px] shrink-0 opacity-70 truncate">
            {label}
          </label>
          <AudioSlider
            className="min-w-0 flex-1"
            label={label}
            min={paramDef.min ?? 0}
            max={paramDef.max ?? 1}
            step={paramDef.step ?? 0.01}
            value={typeof value === 'number' ? value : (paramDef.min ?? 0)}
            onChange={handleSliderChange}
          />
          <span className="text-[10px] min-w-[52px] text-right shrink-0 tabular-nums">
            {typeof value === 'number' ? formatValue(value, paramDef) : '—'}
          </span>
        </div>
      );

    case 'select':
      return (
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] min-w-[60px] max-w-[80px] shrink-0 opacity-70 truncate">
            {label}
          </label>
          <AudioSelect
            className="flex-1"
            label={label}
            value={typeof value === 'string' ? value : ''}
            onChange={handleSelectChange}
            options={(paramDef.options ?? []).map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey) || opt.value,
            }))}
          />
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] min-w-[60px] max-w-[80px] shrink-0 opacity-70 truncate">
            {label}
          </label>
          <input
            type="checkbox"
            checked={typeof value === 'boolean' ? value : false}
            onChange={handleBooleanChange}
          />
        </div>
      );

    default:
      return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function formatValue(value: number, paramDef: AudioEffectParameterDefinition): string {
  const unit = paramDef.unit ?? '';
  const step = paramDef.step ?? 1;

  if (step < 0.01) {
    return `${value.toFixed(3)}${unit}`;
  }
  if (step < 1) {
    return `${value.toFixed(2)}${unit}`;
  }
  return `${Math.round(value)}${unit}`;
}
