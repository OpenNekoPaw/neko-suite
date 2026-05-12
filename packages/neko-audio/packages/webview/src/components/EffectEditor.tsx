/**
 * EffectEditor - Dynamic parameter editor for a single audio effect
 *
 * Renders slider/select/boolean controls based on AudioEffectParameterDefinition.
 */

import { useCallback } from 'react';
import type {
  AudioEffectInstance,
  AudioEffectParameterDefinition,
  AudioEffectParams,
} from '../types/audioEffects';
import { getAudioEffectDefinition } from '../types/audioEffects';
import { MacIconButton } from '@neko/shared/components';
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
        <button
          className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] bg-transparent text-[var(--editor-fg)] border-none cursor-pointer hover:bg-[var(--audio-hover)] transition-colors"
          onClick={() => onToggle(effect.id)}
          title={t('audio.effects.bypass')}
        >
          {effect.enabled ? '●' : '○'}
        </button>
        <span className="flex-1 text-xs font-medium">{t(definition.nameKey) || effect.type}</span>
        {onMoveUp && (
          <MacIconButton size="sm" onClick={onMoveUp} className="w-5 h-5 text-[10px]">
            ▲
          </MacIconButton>
        )}
        {onMoveDown && (
          <MacIconButton size="sm" onClick={onMoveDown} className="w-5 h-5 text-[10px]">
            ▼
          </MacIconButton>
        )}
        <MacIconButton
          size="sm"
          onClick={() => onRemove(effect.id)}
          title={t('audio.effects.remove')}
          className="w-5 h-5 text-[10px] text-[var(--status-error)]"
        >
          ✕
        </MacIconButton>
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
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange],
  );

  const handleSelectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

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
          <input
            type="range"
            className="neko-slider flex-1 min-w-0"
            min={paramDef.min}
            max={paramDef.max}
            step={paramDef.step}
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
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={handleSelectChange}
            className="flex-1 text-[11px] px-1 py-0.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
          >
            {paramDef.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey) || opt.value}
              </option>
            ))}
          </select>
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
