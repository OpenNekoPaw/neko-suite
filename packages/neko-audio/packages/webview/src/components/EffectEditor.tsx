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
import { t } from '../i18n';

interface EffectEditorProps {
  effect: AudioEffectInstance;
  onUpdateParams: (id: string, params: Partial<AudioEffectParams>) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
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
      className={`effect-editor ${effect.enabled ? '' : 'effect-editor--disabled'}`}
      style={{
        border: '1px solid var(--vscode-panel-border, #333)',
        borderRadius: 4,
        padding: 8,
        opacity: effect.enabled ? 1 : 0.5,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <button
          className="btn btn--icon"
          onClick={() => onToggle(effect.id)}
          title={t('audio.effects.bypass')}
          style={{ fontSize: 10, width: 20, height: 20, padding: 0 }}
        >
          {effect.enabled ? '●' : '○'}
        </button>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>
          {t(definition.nameKey) || effect.type}
        </span>
        {onMoveUp && (
          <button
            className="btn btn--icon"
            onClick={onMoveUp}
            style={{ fontSize: 10, width: 20, height: 20, padding: 0 }}
          >
            ▲
          </button>
        )}
        {onMoveDown && (
          <button
            className="btn btn--icon"
            onClick={onMoveDown}
            style={{ fontSize: 10, width: 20, height: 20, padding: 0 }}
          >
            ▼
          </button>
        )}
        <button
          className="btn btn--icon"
          onClick={() => onRemove(effect.id)}
          title={t('audio.effects.remove')}
          style={{ fontSize: 10, width: 20, height: 20, padding: 0, color: '#f44' }}
        >
          ✕
        </button>
      </div>

      {/* Parameters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {definition.parameterDefinitions.map((paramDef) => (
          <ParameterControl
            key={paramDef.key}
            paramDef={paramDef}
            value={(effect.params as unknown as Record<string, unknown>)[paramDef.key]}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 10, width: 60, flexShrink: 0, opacity: 0.8 }}>{label}</label>
          <input
            type="range"
            className="slider"
            min={paramDef.min}
            max={paramDef.max}
            step={paramDef.step}
            value={typeof value === 'number' ? value : (paramDef.min ?? 0)}
            onChange={handleSliderChange}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 10, width: 50, textAlign: 'right', flexShrink: 0 }}>
            {typeof value === 'number' ? formatValue(value, paramDef) : '—'}
          </span>
        </div>
      );

    case 'select':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 10, width: 60, flexShrink: 0, opacity: 0.8 }}>{label}</label>
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={handleSelectChange}
            style={{
              flex: 1,
              fontSize: 11,
              padding: '2px 4px',
              background: 'var(--vscode-input-background, #1e1e1e)',
              color: 'var(--vscode-input-foreground, #ccc)',
              border: '1px solid var(--vscode-input-border, #333)',
              borderRadius: 3,
            }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 10, width: 60, flexShrink: 0, opacity: 0.8 }}>{label}</label>
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
