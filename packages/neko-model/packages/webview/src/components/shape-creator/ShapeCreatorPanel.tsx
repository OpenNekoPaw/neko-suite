import React, { useState, useMemo, useCallback } from 'react';
import {
  SHAPE_PARAMS,
  SHAPE_ICONS,
  type ShapeParamDef,
  type ShapeType,
} from '../../types/shapeParams';
import { useTranslation } from '../../i18n/I18nContext';

const SHAPE_TYPES: ShapeType[] = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'plane'];

interface ShapeCreatorPanelProps {
  disabled?: boolean;
  onCreateShape: (shapeType: ShapeType, params: Record<string, number>) => void;
}

/**
 * Shape Creator Panel - Create parametric 3D primitives.
 *
 * Select a shape type, adjust parameters, and create the mesh.
 */
export function ShapeCreatorPanel({
  disabled = false,
  onCreateShape,
}: ShapeCreatorPanelProps): React.JSX.Element {
  const [shapeType, setShapeType] = useState<ShapeType>('cube');
  const [params, setParams] = useState<Record<string, number>>(() => buildDefaults('cube'));

  const { t } = useTranslation();
  const paramDefs = useMemo(() => SHAPE_PARAMS[shapeType], [shapeType]);

  const handleShapeChange = useCallback((type: ShapeType) => {
    setShapeType(type);
    setParams(buildDefaults(type));
  }, []);

  const handleParamChange = useCallback((def: ShapeParamDef, value: number) => {
    setParams((prev) => ({ ...prev, [def.name]: normalizeShapeParamValue(def, value) }));
  }, []);

  const handleCreate = useCallback(() => {
    onCreateShape(shapeType, params);
  }, [onCreateShape, shapeType, params]);

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">{t('shape.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('shape.shapeSection')}</div>
          <div className="grid grid-cols-3 gap-1">
            {SHAPE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => handleShapeChange(type)}
                disabled={disabled}
                className={`${shapeType === type ? 'model-btn-primary' : 'model-btn-secondary'} flex flex-col items-center px-1 py-1.5 ${
                  shapeType === type ? '' : ''
                }`}
                title={t('shape.' + type)}
              >
                <span className="text-base leading-none">{SHAPE_ICONS[type]}</span>
                <span className="text-[10px] mt-0.5">{t('shape.' + type)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('shape.parameters')}</div>
          {paramDefs.map((def) => {
            const value = params[def.name] ?? def.default;
            return (
              <div key={def.name} className="mb-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-[var(--model-fg-secondary)]">{def.label}</span>
                  <span className="text-[10px] text-[var(--model-fg-secondary)]">
                    {formatShapeParamValue(value, def.step)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={value}
                    onChange={(event) => handleParamChange(def, parseFloat(event.target.value))}
                    disabled={disabled}
                    className="model-range min-w-0 flex-1"
                  />
                  <input
                    type="number"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={formatShapeParamValue(value, def.step)}
                    onChange={(event) =>
                      handleParamChange(def, parseFloat(event.currentTarget.value))
                    }
                    disabled={disabled}
                    className="model-input w-16 px-1.5 py-0.5 text-right text-[10px]"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-3 py-3">
          <button onClick={handleCreate} disabled={disabled} className="model-btn-primary w-full">
            {t('shape.create', { shape: t('shape.' + shapeType) })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Build default parameter values for a given shape type. */
function buildDefaults(type: ShapeType): Record<string, number> {
  const defaults: Record<string, number> = {};
  for (const def of SHAPE_PARAMS[type]) {
    defaults[def.name] = def.default;
  }
  return defaults;
}

export function normalizeShapeParamValue(def: ShapeParamDef, value: number): number {
  if (!Number.isFinite(value)) {
    return def.default;
  }
  const clamped = Math.min(def.max, Math.max(def.min, value));
  if (def.step <= 0) {
    return clamped;
  }
  const stepsFromMin = Math.round((clamped - def.min) / def.step);
  const stepped = def.min + stepsFromMin * def.step;
  return Number(formatShapeParamValue(Math.min(def.max, Math.max(def.min, stepped)), def.step));
}

function formatShapeParamValue(value: number, step: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return value.toFixed(step < 1 ? 2 : 0);
}
